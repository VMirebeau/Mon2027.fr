import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { appRedirect } from "@/lib/redirect";
import { prisma } from "@/lib/db";
import { hasRole, isRole, type Role } from "./roles";

/// Sessions des contributeurs : jeton aléatoire dans un cookie httpOnly, seul
/// son SHA-256 est stocké en base (une fuite de la base ne donne aucune
/// session utilisable). Sessions révocables : déconnexion, désactivation du
/// compte, changement ou réinitialisation de mot de passe.
///
/// ⚠️ Chaque page ET chaque server action appelle requireContributor : une
/// vérification dans un layout ne protège pas les actions (cf. guide
/// data-security de Next), et le proxy n'est pas fiable en build standalone.

export const SESSION_COOKIE = "m27_contrib";
/// 7 jours : accès en écriture au contenu publié, on garde court.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/// En prod l'admin vit sous /admin, sur le même domaine que le player : le
/// cookie est limité à ce chemin pour ne jamais partir vers l'app publique.
function cookiePath(): string {
  return process.env.NEXT_BASE_PATH || "/";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createContributorSession(contributorId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.contributorSession.create({
    data: { id: hashToken(token), contributorId, expiresAt },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath(),
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) await prisma.contributorSession.deleteMany({ where: { id: hashToken(token) } });
  c.delete({ name: SESSION_COOKIE, path: cookiePath() });
}

/// Révoque toutes les sessions d'un compte (désactivation, réinitialisation).
export async function destroyAllSessionsOf(contributorId: string): Promise<void> {
  await prisma.contributorSession.deleteMany({ where: { contributorId } });
}

export type CurrentContributor = {
  id: string;
  login: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
};

/// Contributeur connecté, ou null. Mis en cache pour la durée de la requête
/// (plusieurs composants peuvent l'appeler sans requêtes répétées).
export const getCurrentContributor = cache(async (): Promise<CurrentContributor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.contributorSession.findUnique({
    where: { id: hashToken(token) },
    select: {
      expiresAt: true,
      contributor: {
        select: {
          id: true,
          login: true,
          displayName: true,
          role: true,
          mustChangePassword: true,
          disabledAt: true,
        },
      },
    },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const c = session.contributor;
  if (c.disabledAt || !isRole(c.role)) return null;
  return {
    id: c.id,
    login: c.login,
    displayName: c.displayName,
    role: c.role,
    mustChangePassword: c.mustChangePassword,
  };
});

/// À appeler en tête de chaque page et de chaque server action.
///  - non connecté → page de connexion ;
///  - mot de passe provisoire → changement forcé (sauf sur la page compte) ;
///  - rôle insuffisant → retour à l'accueil.
export async function requireContributor(
  opts: { minRole?: Role; allowPendingPassword?: boolean } = {},
): Promise<CurrentContributor> {
  const me = await getCurrentContributor();
  if (!me) return appRedirect("/login");
  if (me.mustChangePassword && !opts.allowPendingPassword) return appRedirect("/compte?premiere=1");
  if (opts.minRole && !hasRole(me.role, opts.minRole)) return appRedirect("/");
  return me;
}

/// Nettoyage opportuniste des sessions expirées (appelé à la connexion).
export async function purgeExpiredSessions(): Promise<void> {
  await prisma.contributorSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
