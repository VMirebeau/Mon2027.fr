import { NextResponse } from "next/server";
import {
  destroyAllSessionsFor,
  getCurrentUser,
} from "@/lib/auth/session";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** DELETE /api/me/sessions — invalide TOUTES les sessions du user
 *  courant (déconnecte tous les appareils).
 *
 *  Usage typique : « j'ai oublié de me déconnecter sur l'ordi d'un café ».
 *  Pas besoin de re-confirmation MDP : on est *déjà* authentifié sur
 *  l'appareil qui déclenche, c'est l'opération la moins destructive
 *  qu'on puisse imaginer (les données restent intactes, juste les
 *  cookies des autres devices deviennent invalides).
 *
 *  Rate-limit : 5/h/user, pour éviter qu'un cookie volé fasse du bruit
 *  inutile en logs DB.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`sessions:revoke:user:${user.id}`, LIMITS.sessionsRevokePerUser);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  await destroyAllSessionsFor(user.id);
  return NextResponse.json({ ok: true });
}
