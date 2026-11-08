"use server";

import { revalidatePath } from "next/cache";
import { appRedirect } from "@/lib/redirect";
import { prisma } from "@/lib/db";
import { attempt, clientIp, resetAttempts, safeNextPath } from "./guard";
import {
  generateTemporaryPassword,
  getDummyHash,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "./password";
import { assignableRoles, canManageAccount, isRole, type Role } from "./roles";
import {
  createContributorSession,
  destroyAllSessionsOf,
  destroyCurrentSession,
  purgeExpiredSessions,
  requireContributor,
} from "./session";

export type FormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /// Mot de passe provisoire à transmettre à la personne (affiché une fois).
  tempPassword?: string;
  login?: string;
} | null;

const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

// ------------------------------------------------------------------
// Connexion / déconnexion / mot de passe
// ------------------------------------------------------------------

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const login = String(formData.get("login") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  if (!login || !password) return { error: "Identifiant et mot de passe requis." };

  // Anti brute-force : par compte visé (quelle que soit l'IP) et par IP.
  const ip = await clientIp();
  if (!attempt(`ip:${ip}`, 30, 60_000) || !attempt(`login:${login}`, 10, 10 * 60_000)) {
    return { error: "Trop de tentatives. Réessaie dans quelques minutes." };
  }

  const c = await prisma.contributor.findUnique({ where: { login } });
  // Hash factice si le compte n'existe pas : même durée de réponse.
  const valid = await verifyPassword(password, c?.passwordHash ?? (await getDummyHash()));
  if (!c || !valid || c.disabledAt) {
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  resetAttempts(`login:${login}`);
  await purgeExpiredSessions();
  await createContributorSession(c.id);
  await prisma.contributor.update({ where: { id: c.id }, data: { lastLoginAt: new Date() } });
  return appRedirect(c.mustChangePassword ? "/compte?premiere=1" : next);
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  return appRedirect("/login");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireContributor({ allowPendingPassword: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!attempt(`pw:${me.id}`, 10, 10 * 60_000)) {
    return { error: "Trop de tentatives. Réessaie dans quelques minutes." };
  }
  const row = await prisma.contributor.findUnique({ where: { id: me.id } });
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return { error: "Mot de passe actuel incorrect." };
  }
  if (next !== confirm) return { error: "Les deux nouveaux mots de passe ne correspondent pas." };
  if (next === current) return { error: "Le nouveau mot de passe doit être différent de l'actuel." };
  const problem = validateNewPassword(next, me.login);
  if (problem) return { error: problem };

  await prisma.contributor.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  // Déconnecte les autres appareils, garde celui-ci.
  await destroyAllSessionsOf(me.id);
  await createContributorSession(me.id);
  resetAttempts(`pw:${me.id}`);
  if (me.mustChangePassword) return appRedirect("/");
  return { ok: true, message: "Mot de passe changé. Tes autres sessions ont été déconnectées." };
}

// ------------------------------------------------------------------
// Gestion des comptes (admin)
// ------------------------------------------------------------------

/// Charge le compte visé et vérifie que l'acteur a autorité dessus (rang
/// strictement inférieur : un admin ne touche ni aux admins ni au superadmin).
async function manageableTarget(actorRole: Role, contributorId: string) {
  const target = await prisma.contributor.findUnique({ where: { id: contributorId } });
  if (!target) return { error: "Compte introuvable." } as const;
  if (!isRole(target.role) || !canManageAccount(actorRole, target.role)) {
    return { error: "Ce compte est d'un rang égal ou supérieur au tien : tu ne peux pas le modifier." } as const;
  }
  return { target } as const;
}

export async function createContributorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireContributor({ minRole: "superadmin" });
  const login = String(formData.get("login") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!LOGIN_RE.test(login)) {
    return { error: "Identifiant : 3 à 32 caractères, lettres minuscules, chiffres, « . », « _ » ou « - »." };
  }
  if (displayName.length < 2 || displayName.length > 60) {
    return { error: "Nom affiché : 2 à 60 caractères." };
  }
  if (!isRole(role) || !assignableRoles(me.role).includes(role)) {
    return { error: "Tu ne peux pas attribuer ce rôle." };
  }
  if (await prisma.contributor.findUnique({ where: { login } })) {
    return { error: `L'identifiant « ${login} » est déjà pris.` };
  }

  const tempPassword = generateTemporaryPassword();
  await prisma.contributor.create({
    data: { login, displayName, role, passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
  });
  revalidatePath("/contributeurs");
  return {
    ok: true,
    login,
    tempPassword,
    message: `Compte « ${login} » créé. Transmets-lui ce mot de passe provisoire (il devra le changer à la première connexion) :`,
  };
}

export async function setRoleAction(contributorId: string, role: Role): Promise<FormState> {
  const me = await requireContributor({ minRole: "superadmin" });
  if (contributorId === me.id) return { error: "Tu ne peux pas changer ton propre rôle." };
  if (!isRole(role) || !assignableRoles(me.role).includes(role)) {
    return { error: "Tu ne peux pas attribuer ce rôle." };
  }
  const found = await manageableTarget(me.role, contributorId);
  if ("error" in found) return { error: found.error };
  const { target } = found;
  await prisma.contributor.update({ where: { id: contributorId }, data: { role } });
  revalidatePath("/contributeurs");
  return { ok: true, message: `${target.displayName} est maintenant ${role}.` };
}

export async function resetPasswordAction(contributorId: string): Promise<FormState> {
  const me = await requireContributor({ minRole: "superadmin" });
  if (contributorId === me.id) return { error: "Change ton propre mot de passe depuis « Mon compte »." };
  const found = await manageableTarget(me.role, contributorId);
  if ("error" in found) return { error: found.error };
  const { target } = found;
  const tempPassword = generateTemporaryPassword();
  await prisma.contributor.update({
    where: { id: contributorId },
    data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
  });
  await destroyAllSessionsOf(contributorId);
  revalidatePath("/contributeurs");
  return {
    ok: true,
    login: target.login,
    tempPassword,
    message: `Nouveau mot de passe provisoire pour « ${target.login} » (ses sessions ont été déconnectées) :`,
  };
}

export async function setDisabledAction(contributorId: string, disabled: boolean): Promise<FormState> {
  const me = await requireContributor({ minRole: "superadmin" });
  if (contributorId === me.id) return { error: "Tu ne peux pas désactiver ton propre compte." };
  const found = await manageableTarget(me.role, contributorId);
  if ("error" in found) return { error: found.error };
  const { target } = found;
  await prisma.contributor.update({
    where: { id: contributorId },
    data: { disabledAt: disabled ? new Date() : null },
  });
  if (disabled) await destroyAllSessionsOf(contributorId);
  revalidatePath("/contributeurs");
  return { ok: true, message: disabled ? `${target.displayName} est désactivé.` : `${target.displayName} est réactivé.` };
}
