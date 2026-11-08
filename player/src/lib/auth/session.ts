import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "mon2027_sess";
/// 30 jours. Le compte est *facultatif*, donc la session courte (genre
/// 24 h) frustrerait des utilisateurs venus exprès pour la sync.
/// Re-roll au moindre login pour garder un cycle de vie raisonnable.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000;

function newToken(): string {
  // 32 octets aléatoires → 256 bits d'entropie. Suffisant contre
  // toute énumération réaliste.
  return randomBytes(32).toString("base64url");
}

/// Crée une nouvelle session DB et pose le cookie sur la réponse en
/// cours. À appeler depuis un Route Handler après signup ou login.
export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { id: token, userId, expiresAt },
  });
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/// Détruit la session courante (si présente) côté DB *et* côté cookie.
/// Idempotent : noop si pas de session.
export async function destroyCurrentSession(): Promise<void> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { id: token } });
  }
  c.delete(SESSION_COOKIE);
}

/// Détruit *toutes* les sessions du user — utile après un changement de
/// mot de passe ou un soupçon de compromission. Le cookie courant est
/// effacé aussi (le caller redirigera vers /).
export async function destroyAllSessionsFor(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  pseudo: string;
  displayPseudo: string;
};

/// Lit le cookie de session, vérifie la session DB, retourne le user
/// associé ou `null` si pas/plus connecté. Met à jour `lastSeenAt`
/// sans bloquer (best-effort).
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    select: {
      expiresAt: true,
      user: {
        select: { id: true, pseudo: true, displayPseudo: true, lastSeenAt: true },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    // Session expirée — on la supprime et on traite comme déconnecté.
    await prisma.session.deleteMany({ where: { id: token } });
    // Next n'autorise la modification des cookies qu'en Route Handler ou
    // Server Function : appelé depuis le rendu d'une page (/d/…), delete()
    // lève une erreur. Le cookie, devenu inutile, sera écrasé plus tard.
    try {
      c.delete(SESSION_COOKIE);
    } catch {
      /* rendu de page : on ignore */
    }
    return null;
  }

  // Touch lastSeenAt sans attendre, au plus une fois par heure : chaque
  // requête authentifiée (polling compris) déclenchait une écriture, alors
  // que SQLite n'accepte qu'un écrivain à la fois. Échec sans importance.
  const { lastSeenAt, ...user } = session.user;
  if (Date.now() - lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return user;
}
