import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadQuestionsByIds } from "@/lib/content";
import { DB_FORMAT, serializeForStats, validateAnswer } from "@/lib/answer-validation";
import { maybePurge } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

/** POST /api/answers — store an anonymous answer.
 * Body: { questionId: string, value: number | boolean | 0 | 1 }
 *
 * No IP, no fingerprint, no session ID stored. Statistical aggregation only.
 *
 * Rate-limit par IP (cf. LIMITS.answersPerIp) contre le bourrage des stats
 * affichées publiquement ; l'IP n'est jamais stockée. La valeur est validée
 * contre la question (identifiants, types, taille bornée).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`answers:ip:${ip}`, LIMITS.answersPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }
  const { questionId, value } = body as { questionId?: unknown; value?: unknown };
  if (typeof questionId !== "string" || questionId.length > 40) {
    return NextResponse.json({ error: "missing_questionId" }, { status: 400 });
  }

  // Question publiée, sous sa forme typée : la réponse est validée contre
  // ses vrais identifiants d'items (cf. lib/answer-validation).
  const [q] = await loadQuestionsByIds([questionId]);
  if (!q) {
    return NextResponse.json({ error: "unknown_question" }, { status: 404 });
  }
  const check = validateAnswer(q, value);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  await prisma.answer.create({
    data: { questionId, format: DB_FORMAT[q.format], value: serializeForStats(check.value) },
  });

  // Route la plus fréquente : on y accroche le ménage périodique (sessions
  // et défis expirés), sans l'attendre. Cf. lib/maintenance.ts.
  void maybePurge();

  return NextResponse.json({ ok: true });
}
