import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { isValidShortCode } from "@/lib/defi-shortcode";
import {
  parseQuestionIds,
  scoreFromAnswers,
  serializeAnswersMap,
  validateResponsePayload,
} from "@/lib/defi";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { setDefiClientCookie } from "@/lib/defi-client-cookie";
import { getCurrentUser } from "@/lib/auth/session";
import { loadQuestionsByIds } from "@/lib/content";
import { rescoreAnswers } from "@/lib/answer-validation";

export const dynamic = "force-dynamic";

/** POST /api/defis/[shortCode]/responses — l'ami soumet ses réponses.
 *
 *  Body (JSON) :
 *    amiClientId : string  (UUID localStorage de l'ami)
 *    amiLabel    : string  (prénom saisi, ou "" → "Anonyme")
 *    answers     : { [questionId]: { value, correct } }
 *
 *  Auth optionnelle : si une session est active au moment de la soumission,
 *  on rattache la réponse au compte via `amiUserId`. Ça permet à l'ami connecté
 *  de retrouver ses défis joués depuis n'importe quel device (sinon `amiClientId`
 *  ne matche que sur le device d'origine). Le rétro-claim — quand l'ami se
 *  connecte APRÈS avoir joué — est géré côté page `/d/[code]/resultats`.
 *
 *  Idempotence via la contrainte unique (defiShortCode, amiClientId) :
 *  retenter avec le même amiClientId renvoie 409 sans dupliquer.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ shortCode: string }> }
) {
  const { shortCode } = await ctx.params;
  if (!isValidShortCode(shortCode)) {
    return NextResponse.json({ error: "bad_shortcode" }, { status: 400 });
  }

  // Anti-flood : on a déjà la contrainte UNIQUE (defiShortCode,amiClientId)
  // qui empêche un même clientId de soumettre plusieurs fois. Mais sans
  // rate-limit, un bot avec N clientId distincts peut polluer la liste.
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`defis:respond:ip:${ip}`, LIMITS.defiRespondPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const v = validateResponsePayload(body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: v.status });
  }

  // Vérifie l'existence du défi avant l'insert pour renvoyer 404 clair
  // (sinon on tomberait sur l'erreur FK Prisma au moment du create).
  // On charge aussi `creatorUserId` pour la garde "self-defi" plus bas.
  const defi = await prisma.defi.findUnique({
    where: { shortCode },
    select: { shortCode: true, expiresAt: true, creatorUserId: true, questionIds: true },
  });
  if (!defi) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (defi.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Réponses recalculées côté serveur : seules les questions du défi
  // comptent, chaque valeur est validée et sa justesse réévaluée (le flag
  // `correct` du client permettait d'afficher un score de « 1000/5 »).
  let questionIds: string[];
  try {
    questionIds = parseQuestionIds(defi.questionIds);
  } catch {
    return NextResponse.json({ error: "corrupt_defi" }, { status: 500 });
  }
  const answers = rescoreAnswers(await loadQuestionsByIds(questionIds), v.data.answers);
  const score = scoreFromAnswers(answers);

  // Best-effort : si l'ami est connecté, on lie la réponse à son compte.
  // Ne bloque pas le POST si la résolution échoue (cookie absent ou session
  // expirée → on stocke comme anonyme).
  const user = await getCurrentUser();

  // amiUserId = user.id SAUF si :
  //   - playAsGuest opt-out explicite (l'utilisateur a cliqué "Pas moi"
  //     sur B1 → c'est quelqu'un d'autre qui joue sur son device).
  //   - self-defi (créateur qui joue son propre défi : sémantiquement faux,
  //     éviterait "Pierre et Pierre se sont défié·es" en UI).
  // Dans ces cas la réponse est quand même stockée (l'historique côté device
  // reste intact via cookie), juste pas rattachée au compte.
  const isSelfDefi =
    user !== null && defi.creatorUserId !== null && defi.creatorUserId === user.id;
  const amiUserId =
    user !== null && !v.data.playAsGuest && !isSelfDefi ? user.id : null;

  try {
    await prisma.defiResponse.create({
      data: {
        defiShortCode: shortCode,
        amiClientId: v.data.amiClientId,
        amiUserId,
        amiLabel: v.data.amiLabel,
        answers: serializeAnswersMap(answers),
        score,
      },
    });
  } catch (err) {
    // Prisma P2002 = contrainte unique violée → cet amiClientId a déjà
    // soumis une réponse pour ce défi. On retourne 409 pour que le
    // client redirige vers la page de résultats au lieu de réessayer.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "already_responded" }, { status: 409 });
    }
    throw err;
  }

  // Lie le device au clientId (idem création — cf. defi-client-cookie.ts).
  await setDefiClientCookie(v.data.amiClientId);

  return NextResponse.json({
    ok: true,
    score,
    resultsUrl: `/d/${shortCode}/resultats`,
  });
}
