import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefiClientId } from "@/lib/defi-client-cookie";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/defis/mine/unseen — compteur léger de réponses non vues.
 *
 *  Endpoint dédié au polling régulier (AppShell, toutes les 60 s + sur
 *  visibilitychange). Volontairement minimaliste : pas de questions, pas de
 *  themes, juste les compteurs nécessaires pour piloter :
 *    - la pastille rouge globale sur l'onglet "Défier" (total)
 *    - la pastille par carte dans MyDefisList (byShortCode)
 *
 *  Auth : même union que /api/defis/mine (cookie clientId OU session user).
 *  Sans aucune preuve d'identité on retourne `{ total: 0, byShortCode: {} }`
 *  plutôt que 401 — c'est juste l'absence de défis envoyés. Le client peut
 *  donc poller sans condition.
 *
 *  Rate-limit généreux (120/min/IP) : le polling normal est 1 hit/min/onglet,
 *  on couvre plusieurs onglets ouverts sur la même IP NAT (école, bureau)
 *  tout en cassant un client buggé qui pollerait en boucle serrée.
 */
export type UnseenDefisResponse = {
  total: number;
  byShortCode: Record<string, number>;
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
      total: 0,
      byShortCode: {},
    } satisfies UnseenDefisResponse);
  }

  // Limite serrée par identité (session ou cookie défi signé) : une salle
  // derrière la même IP n'est pas pénalisée, un client qui boucle l'est.
  const identity = user ? `user:${user.id}` : `client:${clientId}`;
  const rl = rateLimit(`defis:unseen:${identity}`, LIMITS.defiUnseenPerIdentity);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  // Filtre OR sur les deux sources possibles de paternité — mêmes règles que
  // /api/defis/mine, donc cohérence garantie : tout défi compté ici est
  // affichable dans MyDefisList.
  const orConditions: Array<{ creatorClientId?: string; creatorUserId?: string }> = [];
  if (clientId) orConditions.push({ creatorClientId: clientId });
  if (user) orConditions.push({ creatorUserId: user.id });

  // groupBy direct sur DefiResponse, filtré par les défis du créateur via
  // un join implicite sur la relation `defi`. Évite de charger N défis en
  // mémoire puis de boucler côté JS : la DB compte ce qu'il faut compter.
  const rows = await prisma.defiResponse.groupBy({
    by: ["defiShortCode"],
    where: {
      seenByCreatorAt: null,
      defi: { OR: orConditions },
    },
    _count: { _all: true },
  });

  const byShortCode: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const n = r._count._all;
    byShortCode[r.defiShortCode] = n;
    total += n;
  }

  return NextResponse.json({
    total,
    byShortCode,
  } satisfies UnseenDefisResponse);
}
