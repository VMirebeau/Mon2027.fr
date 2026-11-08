import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefiClientId } from "@/lib/defi-client-cookie";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/me/defis-impact — compte le nombre de fois où les défis créés
 *  par l'utilisateur courant ont été joués par des destinataires.
 *
 *  Source de vérité pour les badges Partage (ambassadeur, bouche-à-oreille).
 *  Choix éditorial : on récompense la portée réelle (un défi qui a généré
 *  une réponse côté ami) plutôt que la simple création — créer un défi est
 *  trivial, recevoir une réponse signale qu'une conversation a eu lieu.
 *
 *  Auth (même pattern que /api/defis/mine) :
 *    - cookie httpOnly `mon2027_defi_client` → filtre par creatorClientId
 *    - session user → filtre par creatorUserId
 *    - les deux peuvent coexister (militant qui a créé en anonyme puis
 *      s'est connecté) — on prend l'union.
 *
 *  Retourne :
 *    { totalResponses: number, defisWithResponses: number }
 *  Si aucune preuve d'identité, retourne { totalResponses: 0, defisWithResponses: 0 }.
 *
 *  Performance : un seul `count` SQL par condition (UNION via OR). Pas de
 *  pull de la liste des défis — endpoint volontairement minimaliste pour
 *  être appelable depuis le watcher gamification sans coût.
 */
export type DefisImpactResponse = {
  totalResponses: number;
  defisWithResponses: number;
};

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const rlIp = rateLimit(`defis:reads:ip:${ip}`, LIMITS.defiReadsPerIp);
  if (!rlIp.ok) return tooManyRequests(rlIp.resetAt);

  const [clientId, user] = await Promise.all([
    getDefiClientId(),
    getCurrentUser(),
  ]);

  if (!clientId && !user) {
    return NextResponse.json({
      totalResponses: 0,
      defisWithResponses: 0,
    } satisfies DefisImpactResponse);
  }

  // Limite serrée par identité (session ou cookie défi signé) : une salle
  // derrière la même IP n'est pas pénalisée, un client qui boucle l'est.
  const identity = user ? `user:${user.id}` : `client:${clientId}`;
  const rl = rateLimit(`defis:impact:${identity}`, LIMITS.defiImpactPerIdentity);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  const orConditions: Array<{ creatorClientId?: string; creatorUserId?: string }> = [];
  if (clientId) orConditions.push({ creatorClientId: clientId });
  if (user) orConditions.push({ creatorUserId: user.id });

  // Agrégations directes sur DefiResponse via un filtre relationnel — pas
  // besoin de pull les rows de Defi pour les sommer côté Node. Les deux
  // queries en parallèle tapent sur l'index `defiShortCode` de DefiResponse
  // (déjà déclaré dans schema.prisma) :
  //   - count : nb total de réponses reçues sur tous les défis du user
  //   - groupBy : nb de défis distincts ayant au moins une réponse
  // Aucune ligne de Defi n'est transférée au Node — uniquement les 2
  // agrégats finaux. Linéaire dans le nombre de réponses, indépendant
  // du nombre de défis créés (qui peut grossir sans coût additionnel ici).
  const where = { defi: { OR: orConditions } };
  const [totalResponses, perDefi] = await Promise.all([
    prisma.defiResponse.count({ where }),
    prisma.defiResponse.groupBy({ by: ["defiShortCode"], where }),
  ]);

  return NextResponse.json({
    totalResponses,
    defisWithResponses: perDefi.length,
  } satisfies DefisImpactResponse);
}
