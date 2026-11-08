import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from "@/lib/indicators";
import { loadPublishedQuestions } from "@/lib/content";
import { contributionFor } from "@/lib/progress-stats";
import { isCorrect } from "@/lib/correctness";
import { DB_FORMAT, validateAnswer } from "@/lib/answer-validation";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

/// GET /api/indicators/community-mean
/// Retourne le score moyen de chaque indicateur, agrégé sur TOUTES les
/// réponses anonymes stockées (table Answer). Utilisé par le radar de la
/// page Indicateurs pour comparer ton profil à la moyenne des joueurs.
///
/// Stratégie de calcul (sans précompute, pas de cron) :
///   1. Charge toutes les Answer récentes (cap 90 jours pour rester
///      relevant — un biais social en 2027 ne sera pas le même qu'en 2025).
///   2. Index les Question publiées (id, format, indicators, answer pour
///      les estimations).
///   3. Pour chaque Answer, retrouve la question, calcule la contribution
///      brute (cf. contributionFor côté player), distribue par indicateur
///      avec polarity.
///   4. Moyenne par indicateur, retour structuré.
///
/// Coût : avec ~10k Answers, ~50ms. On expose un Cache-Control public de
/// 1h — un cdn ou Next ISR peut tenir l'agrégat sans hammer la DB.
///
/// Anonyme : Answer ne stocke ni IP ni session, pure agrégation
/// statistique. Pas de fuite de profil individuel.

const RECENT_DAYS = 90;
const COMMUNITY_MIN_SAMPLES = 50;

export type CommunityMeanResponse = {
  /// Date d'agrégation (ISO) pour info debug + invalidation cache éventuel.
  computedAt: string;
  /// Score moyen par indicateur, dans [-1, +1]. Indicateurs avec
  /// `count < COMMUNITY_MIN_SAMPLES` sont retournés à null pour qu'un
  /// caller puisse les distinguer du vrai "0" (= juste).
  indicators: Array<{
    id: IndicatorId;
    label: string;
    signedScore: number | null;
    count: number;
  }>;
};

/// Résultat gardé en mémoire : le calcul relit toutes les réponses des 90
/// derniers jours, et les biais collectifs bougent lentement. (L'en-tête
/// Cache-Control ne suffisait pas : aucun cache HTTP devant le serveur.)
const CACHE_TTL_MS = 10 * 60 * 1000;
let cached: { at: number; body: CommunityMeanResponse } | null = null;

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`community:ip:${ip}`, LIMITS.communityPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  if (!cached || Date.now() - cached.at > CACHE_TTL_MS) {
    cached = { at: Date.now(), body: await computeCommunityMean() };
  }
  return NextResponse.json(cached.body, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=600" },
  });
}

async function computeCommunityMean(): Promise<CommunityMeanResponse> {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const [answers, published] = await Promise.all([
    prisma.answer.findMany({
      where: { createdAt: { gte: since } },
      select: { questionId: true, format: true, value: true },
    }),
    loadPublishedQuestions(),
  ]);

  const byId = new Map<string, Question>();
  for (const q of published) if (q.indicators?.length) byId.set(q.id, q);

  // Même calcul que le portrait du joueur (contributionFor + isCorrect),
  // appliqué aux réponses anonymes. L'ancienne version dupliquait cette
  // logique côté serveur et lisait des champs qui n'existent pas
  // (`reponse` au lieu de `reponseCorrecte`, `ordre`, `plage`…) : 6 formats
  // sur 9 étaient ignorés et la moyenne tirée vers « juste ».
  const acc = new Map<IndicatorId, { sum: number; count: number }>();
  for (const a of answers) {
    const q = byId.get(a.questionId);
    // Réponse enregistrée sous un autre format (question modifiée depuis) :
    // elle ne correspond plus à la question actuelle.
    if (!q || a.format !== DB_FORMAT[q.format]) continue;
    const check = validateAnswer(q, parseStoredValue(q, a.value));
    if (!check.ok) continue;
    const contrib = contributionFor(q, { value: check.value, correct: isCorrect(q, check.value) });
    if (contrib === null) continue;
    for (const { id, polarity } of q.indicators ?? []) {
      const entry = acc.get(id) ?? { sum: 0, count: 0 };
      entry.sum += contrib * polarity;
      entry.count++;
      acc.set(id, entry);
    }
  }

  return {
    computedAt: new Date().toISOString(),
    indicators: INDICATOR_IDS.map((id) => {
      const meta = INDICATORS[id];
      const entry = acc.get(id);
      if (!entry || entry.count < COMMUNITY_MIN_SAMPLES) {
        return { id, label: meta.label, signedScore: null, count: entry?.count ?? 0 };
      }
      return { id, label: meta.label, signedScore: entry.sum / entry.count, count: entry.count };
    }),
  };
}

/// Answer.value est sérialisée en texte (cf. serializeForStats).
function parseStoredValue(q: Question, raw: string): unknown {
  switch (q.format) {
    case "estimation":
    case "ab":
    case "qcm": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "vraifaux":
      return raw === "true" ? true : raw === "false" ? false : null;
    default:
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
  }
}
