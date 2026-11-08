import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PasswordBusyError, verifyPassword } from "@/lib/auth/password";
import {
  destroyCurrentSession,
  getCurrentUser,
} from "@/lib/auth/session";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/me — retourne l'utilisateur courant ou `null` si pas connecté.
 *  Sert au client pour rebrancher l'état d'auth après un refresh.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}

/** DELETE /api/me — supprime le compte courant (RGPD art. 17, droit à
 *  l'effacement). Exige une re-confirmation par mot de passe pour éviter
 *  qu'un cookie volé / un onglet ouvert dans un café puisse détruire le
 *  compte en un clic.
 *
 *  Cascade Prisma : Session, UserSnapshot, PushSubscription sont supprimés
 *  automatiquement. Les Defi créés par le user passent en creatorUserId=null
 *  (SetNull) — on garde le défi vivant pour les amis qui ont déjà joué.
 *
 *  Body: { password: string }
 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Anti-brute-force MDP : un cookie volé permettrait sinon ~illimité
  // d'essais MDP jusqu'à pression du compte. La clé est userId (pas IP)
  // pour qu'un attaquant ne contourne pas via plusieurs IP.
  const rl = rateLimit(`me:delete:user:${user.id}`, LIMITS.meDeletePerUser);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // `null` est un JSON valide : sans ce garde-fou, lire un champ plantait (500).
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json(
      { error: { message: "Mot de passe requis pour confirmer." } },
      { status: 400 },
    );
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row) {
    // Session orpheline, on la détruit au passage.
    await destroyCurrentSession();
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let ok: boolean;
  try {
    ok = await verifyPassword(password, row.passwordHash);
  } catch (e) {
    if (e instanceof PasswordBusyError) {
      return NextResponse.json(
      { error: { message: "Serveur occupé : réessaie dans un instant." } },
      { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    throw e;
  }
  if (!ok) {
    return NextResponse.json(
      { error: { message: "Mot de passe incorrect." } },
      { status: 401 },
    );
  }

  await prisma.user.delete({ where: { id: user.id } });
  await destroyCurrentSession();

  return NextResponse.json({ ok: true });
}
