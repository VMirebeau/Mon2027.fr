import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Minimum count of answers before we trust real stats. */
const REAL_STATS_THRESHOLD = 5;

/// Cache mémoire par question (60 s) : la route relit toutes les réponses
/// d'une question à chaque appel, potentiellement des centaines de fois par
/// minute. Taille bornée (vidé quand plein).
const STATS_CACHE_TTL_MS = 60_000;
const STATS_CACHE_MAX = 2000;
const statsCache = new Map<string, { at: number; body: StatsResponse }>();

export type StatsResponse =
  | { hasRealData: false; count: number }
  | {
      hasRealData: true;
      count: number;
      // estimation
      mean?: number;
      pctClose?: number;
      pctOff?: number;
      // ab/qcm
      distribution?: Record<string, number>; // { "0": pct, "1": pct, ... }
      // vraifaux
      pctTrue?: number;
      pctFalse?: number;
      // vraifaux_multi
      perStatement?: Record<string, { pctTrue: number; pctFalse: number }>;
      // curseur_multi
      perItemMean?: Record<string, number>;
      // categorisation
      perItemBins?: Record<string, Record<string, number>>;
      // classement
      perItemPositions?: Record<string, Record<string, number>>;
      // pondere
      perCategoryMean?: Record<string, number>;
    };

/** GET /api/stats?questionId=... — anonymous aggregate stats for a question. */
export async function GET(req: Request) {
  // La requête ratisse toutes les Answer pour la questionId ; sans cache,
  // un scraper peut générer 1000 req/s. 120 req/min/IP couvre un usage
  // joueur (lecture après chaque réponse) avec marge.
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`stats:ip:${ip}`, LIMITS.statsPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  const url = new URL(req.url);
  const questionId = url.searchParams.get("questionId");
  if (!questionId) {
    return NextResponse.json({ error: "missing_questionId" }, { status: 400 });
  }

  const now = Date.now();
  const hit = statsCache.get(questionId);
  if (hit && now - hit.at < STATS_CACHE_TTL_MS) {
    return NextResponse.json(hit.body, { headers: { "Cache-Control": "no-store" } });
  }
  const result = await computeStats(questionId);
  if (result === null) {
    return NextResponse.json({ error: "unknown_question" }, { status: 404 });
  }
  if (statsCache.size >= STATS_CACHE_MAX) statsCache.clear();
  statsCache.set(questionId, { at: now, body: result });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

/// Statistiques d'une question publiée, ou null si elle n'existe pas / n'est
/// pas publiée.
async function computeStats(questionId: string): Promise<StatsResponse | null> {
  const q = await prisma.question.findUnique({
    where: { customId: questionId },
    select: {
      statut: true,
      format: true,
      reponseNumerique: true,
      toleranceVerte: true,
      plageMin: true,
      plageMax: true,
    },
  });
  if (!q || q.statut !== "publie") return null;

  // Uniquement les réponses au format ACTUEL de la question : après un
  // changement de format, les anciennes réponses (ex. estimations sur une
  // question devenue vrai/faux) faussaient tout (« 0 % pensent que c'est
  // faux » affiché comme une vraie donnée).
  const rows = await prisma.answer.findMany({
    where: { questionId, format: q.format },
    select: { value: true },
  });
  const count = rows.length;

  if (count < REAL_STATS_THRESHOLD) {
    return { hasRealData: false, count } satisfies StatsResponse;
  }

  if (q.format === "estimation_numerique" && q.reponseNumerique != null) {
    const values = rows.map((r) => parseFloat(r.value)).filter((n) => !Number.isNaN(n));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // Même tolérance que le verdict du joueur (content.ts : 5 % de la plage).
    const tolerance =
      q.toleranceVerte ??
      (q.plageMin != null && q.plageMax != null ? (q.plageMax - q.plageMin) * 0.05 : 1);
    const close = values.filter((v) => Math.abs(v - q.reponseNumerique!) <= tolerance).length;
    const pctClose = Math.round((close / values.length) * 100);
    return { hasRealData: true, count, mean, pctClose, pctOff: 100 - pctClose } satisfies StatsResponse;
  }

  if (q.format === "ab" || q.format === "qcm") {
    const dist: Record<string, number> = {};
    for (const r of rows) dist[r.value] = (dist[r.value] ?? 0) + 1;
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const pct: Record<string, number> = {};
    for (const [k, v] of Object.entries(dist)) pct[k] = Math.round((v / total) * 100);
    return { hasRealData: true, count, distribution: pct } satisfies StatsResponse;
  }

  if (q.format === "vrai_faux") {
    const t = rows.filter((r) => r.value === "true").length;
    const f = rows.filter((r) => r.value === "false").length;
    const total = t + f;
    return {
        hasRealData: true,
        count,
        pctTrue: total ? Math.round((t / total) * 100) : 0,
        pctFalse: total ? Math.round((f / total) * 100) : 0,
      } satisfies StatsResponse;
  }

  // Pour les formats composites, value est un JSON sérialisé. On parse en
  // best-effort et on tolère les lignes corrompues : un crash ici masquerait
  // toutes les stats du format pour cette question.
  const parsed = rows
    .map((r) => {
      try {
        return JSON.parse(r.value) as unknown;
      } catch {
        return null;
      }
    })
    .filter((v): v is Record<string, unknown> => v !== null && typeof v === "object");

  if (q.format === "vraifaux_multi") {
    // value = { statementId: boolean }
    const perStatement: Record<string, { t: number; f: number }> = {};
    for (const ans of parsed) {
      for (const [sid, v] of Object.entries(ans)) {
        if (typeof v !== "boolean") continue;
        const e = (perStatement[sid] ??= { t: 0, f: 0 });
        if (v) e.t += 1;
        else e.f += 1;
      }
    }
    const out: Record<string, { pctTrue: number; pctFalse: number }> = {};
    for (const [sid, { t, f }] of Object.entries(perStatement)) {
      const total = t + f;
      out[sid] = {
        pctTrue: total ? Math.round((t / total) * 100) : 0,
        pctFalse: total ? Math.round((f / total) * 100) : 0,
      };
    }
    return { hasRealData: true, count, perStatement: out } satisfies StatsResponse;
  }

  if (q.format === "curseur_multi") {
    // value = { itemId: number }
    const sums: Record<string, { sum: number; n: number }> = {};
    for (const ans of parsed) {
      for (const [iid, v] of Object.entries(ans)) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const e = (sums[iid] ??= { sum: 0, n: 0 });
        e.sum += v;
        e.n += 1;
      }
    }
    const out: Record<string, number> = {};
    for (const [iid, { sum, n }] of Object.entries(sums)) {
      if (n > 0) out[iid] = sum / n;
    }
    return { hasRealData: true, count, perItemMean: out } satisfies StatsResponse;
  }

  if (q.format === "categorisation") {
    // value = { itemId: binId }
    const counts: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    for (const ans of parsed) {
      for (const [iid, bin] of Object.entries(ans)) {
        if (typeof bin !== "string") continue;
        const c = (counts[iid] ??= {});
        c[bin] = (c[bin] ?? 0) + 1;
        totals[iid] = (totals[iid] ?? 0) + 1;
      }
    }
    const out: Record<string, Record<string, number>> = {};
    for (const [iid, byBin] of Object.entries(counts)) {
      const total = totals[iid] ?? 1;
      out[iid] = {};
      for (const [bin, c] of Object.entries(byBin)) {
        out[iid][bin] = Math.round((c / total) * 100);
      }
    }
    return { hasRealData: true, count, perItemBins: out } satisfies StatsResponse;
  }

  if (q.format === "classement") {
    // value = array of itemIds in user's order. Position = index dans le tableau.
    const counts: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    for (const ans of parsed) {
      if (!Array.isArray(ans)) continue;
      for (let pos = 0; pos < ans.length; pos++) {
        const iid = ans[pos];
        if (typeof iid !== "string") continue;
        const c = (counts[iid] ??= {});
        const key = String(pos);
        c[key] = (c[key] ?? 0) + 1;
        totals[iid] = (totals[iid] ?? 0) + 1;
      }
    }
    const out: Record<string, Record<string, number>> = {};
    for (const [iid, byPos] of Object.entries(counts)) {
      const total = totals[iid] ?? 1;
      out[iid] = {};
      for (const [pos, c] of Object.entries(byPos)) {
        out[iid][pos] = Math.round((c / total) * 100);
      }
    }
    return { hasRealData: true, count, perItemPositions: out } satisfies StatsResponse;
  }

  if (q.format === "pondere") {
    // value = { catId: number }
    const sums: Record<string, { sum: number; n: number }> = {};
    for (const ans of parsed) {
      for (const [cid, v] of Object.entries(ans)) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const e = (sums[cid] ??= { sum: 0, n: 0 });
        e.sum += v;
        e.n += 1;
      }
    }
    const out: Record<string, number> = {};
    for (const [cid, { sum, n }] of Object.entries(sums)) {
      if (n > 0) out[cid] = sum / n;
    }
    return { hasRealData: true, count, perCategoryMean: out } satisfies StatsResponse;
  }

  return { hasRealData: false, count } satisfies StatsResponse;
}
