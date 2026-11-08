import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { parseSuggestion } from "@/lib/suggestions";

export const dynamic = "force-dynamic";

/** POST /api/suggestions — un joueur propose une correction ou une question.
 *  Body : { kind, questionId?, message, sourceUrl?, website? (piège à robots) }
 *  Sans effet sur le contenu : la proposition arrive dans la file de l'espace
 *  contributeurs. Aucune IP stockée ; lien au compte seulement si connecté. */
export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`suggestions:ip:${ip}`, LIMITS.suggestionPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_json", message: "Requête invalide." } }, { status: 400 });
  }

  const parsed = parseSuggestion(body);
  if (!parsed.ok) {
    if (parsed.honeypot) return NextResponse.json({ ok: true }, { status: 201 });
    return NextResponse.json({ error: { code: "invalid", message: parsed.error } }, { status: 400 });
  }
  const data = parsed.data;

  // Le player désigne une question par `customId ?? id` : on retrouve la
  // question publiée correspondante et on stocke son customId canonique.
  if (data.questionCustomId) {
    const q = await prisma.question.findFirst({
      where: { statut: "publie", OR: [{ customId: data.questionCustomId }, { id: data.questionCustomId }] },
      select: { id: true, customId: true },
    });
    if (!q) {
      return NextResponse.json({ error: { code: "unknown_question", message: "Question inconnue." } }, { status: 400 });
    }
    data.questionCustomId = q.customId ?? q.id;
  }

  const user = await getCurrentUser();
  await prisma.suggestion.create({ data: { ...data, userId: user?.id ?? null } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
