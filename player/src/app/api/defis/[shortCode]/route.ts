import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidShortCode } from "@/lib/defi-shortcode";
import { parseQuestionIds, reorderQuestions } from "@/lib/defi";
import { computeThemeFromNames } from "@/lib/defi-loader";
import { loadQuestionsByIds } from "@/lib/content";
import { computeIdentityTag } from "@/lib/defi-identity-server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefiClientId } from "@/lib/defi-client-cookie";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/defis/[shortCode] — lecture publique d'un défi.
 *
 *  Pas d'auth. Retourne :
 *    - meta du défi (shortCode, creatorPseudo, source, themeId, expiresAt, isExpired)
 *    - questions complètes (Question[] typées, prêtes pour GameSession)
 *    - liste des réponses existantes (pour permettre au client de détecter
 *      "j'ai déjà joué" via un hash salé de son clientId).
 *
 *  PRIVACY : on n'expose JAMAIS `creatorClientId` ni `amiClientId` raw
 *  (UUID stable par navigateur). À la place, un tag salé `sha256(shortCode + clientId)`
 *  qui change pour chaque défi — empêche la corrélation cross-défi
 *  (cf. defi-identity.ts pour la rationale).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ shortCode: string }> }
) {
  const { shortCode } = await ctx.params;
  if (!isValidShortCode(shortCode)) {
    return NextResponse.json({ error: "bad_shortcode" }, { status: 400 });
  }

  // Anti-énumération : le shortCode est plus court qu'un UUID, donc on
  // veut empêcher de scanner /api/defis/* en boucle pour cartographier
  // les défis existants. 30 req / IP / minute laisse de la marge pour
  // un usage normal (lecture, polling page résultats) tout en cassant
  // un scan brute-force.
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`defis:read:ip:${ip}`, LIMITS.defiReadPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  const defi = await prisma.defi.findUnique({
    where: { shortCode },
    select: {
      shortCode: true,
      creatorPseudo: true,
      creatorClientId: true,
      questionIds: true,
      source: true,
      themeId: true,
      title: true,
      createdAt: true,
      expiresAt: true,
      // Cap défensif : un défi viral peut accumuler des centaines de
      // responses. On expose les 50 plus récentes côté API publique — la
      // page /d/[shortCode]/resultats passe par loadDefi() (côté serveur)
      // pour le détail complet du créateur. orderBy DESC pour garder les
      // dernières en cas de truncation.
      responses: {
        take: 50,
        select: { amiLabel: true, amiClientId: true, score: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!defi) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let questionIds: string[];
  try {
    questionIds = parseQuestionIds(defi.questionIds);
  } catch {
    return NextResponse.json({ error: "corrupt_defi" }, { status: 500 });
  }

  // Charge uniquement les 5 questions du défi (cf. loadQuestionsByIds dans
  // content.ts) au lieu de scanner toutes les publiées.
  const picked = await loadQuestionsByIds(questionIds);
  const orderedQuestions = reorderQuestions(picked, questionIds);

  // Si trop de questions ont été dépubliées (>1 manquante p.ex.), le défi
  // n'est plus jouable proprement — on signale l'état au client qui peut
  // proposer "ce défi est obsolète, regénère-le".
  const stale = orderedQuestions.length < questionIds.length;

  // Label thématique recalculé depuis les vraies questions chargées (cohérent
  // avec defi-loader). `themeId` retourné ici est le slug pour la couleur,
  // pas la valeur brute stockée en DB (qui resterait stale si une question
  // a été déplacée vers un autre thème côté admin).
  const bucket = computeThemeFromNames(orderedQuestions.map((q) => q.theme));

  return NextResponse.json({
    defi: {
      shortCode: defi.shortCode,
      creatorPseudo: defi.creatorPseudo,
      creatorTag: computeIdentityTag(shortCode, defi.creatorClientId),
      source: defi.source,
      themeId: bucket.themeId,
      themeLabel: bucket.themeLabel,
      title: defi.title,
      createdAt: defi.createdAt.toISOString(),
      expiresAt: defi.expiresAt.toISOString(),
      isExpired: defi.expiresAt.getTime() < Date.now(),
      stale,
    },
    questions: orderedQuestions,
    responses: defi.responses.map((r) => ({
      amiLabel: r.amiLabel,
      amiTag: computeIdentityTag(shortCode, r.amiClientId),
      score: r.score,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/** DELETE /api/defis/[shortCode] — suppression d'un défi par son créateur.
 *
 *  Auth obligatoire — le défi ne peut être supprimé que par son auteur :
 *    - cookie `mon2027_defi_client` matche `creatorClientId` (mode anonyme), OU
 *    - session user matche `creatorUserId` (mode connecté).
 *  L'un ou l'autre suffit (même union que `/api/defis/mine`). Si aucune des
 *  deux conditions n'est satisfaite, 403 — pas 401, parce qu'un visiteur
 *  anonyme valide peut techniquement appeler l'endpoint, c'est l'identité
 *  qui ne matche pas le créateur du défi ciblé.
 *
 *  Cascade : les DefiResponse liées sont automatiquement supprimées via la
 *  relation Prisma (`onDelete: Cascade` sur DefiResponse.defi).
 *
 *  Effet de bord côté destinataires : le lien `/d/[shortCode]` devient un
 *  404. C'est attendu — c'est le but de la suppression. La confirm modal
 *  côté client l'explique avant l'action.
 *
 *  Rate-limit modéré (10/min/IP) : la suppression n'est pas brute-forceable
 *  sans connaître le shortCode, mais on protège contre un client buggé qui
 *  poller­ait. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ shortCode: string }> }
) {
  const { shortCode } = await ctx.params;
  if (!isValidShortCode(shortCode)) {
    return NextResponse.json({ error: "bad_shortcode" }, { status: 400 });
  }

  const ip = getClientIp(req.headers);
  const rl = rateLimit(`defis:delete:ip:${ip}`, LIMITS.defiDeletePerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  const [clientId, user] = await Promise.all([
    getDefiClientId(),
    getCurrentUser(),
  ]);
  if (!clientId && !user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const defi = await prisma.defi.findUnique({
    where: { shortCode },
    select: { creatorClientId: true, creatorUserId: true },
  });
  if (!defi) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isCreatorByClient =
    !!clientId && clientId === defi.creatorClientId;
  const isCreatorByUser = !!user && user.id === defi.creatorUserId;
  if (!isCreatorByClient && !isCreatorByUser) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.defi.delete({ where: { shortCode } });
  // 204 No Content — pas de body, pas de cache-control particulier.
  return new NextResponse(null, { status: 204 });
}
