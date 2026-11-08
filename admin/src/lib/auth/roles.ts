/// Rôles de l'espace contributeurs et règles de permission. Fonctions pures,
/// sans accès base ni Next : testables isolément et réutilisables côté
/// client pour griser l'interface (la vérification qui fait foi reste celle
/// des server actions).
///
///   contributeur : crée et améliore les questions non publiées, discute,
///                  traite les propositions des joueurs.
///   relecteur    : + valide, publie, retire, modifie les questions publiées.
///   admin        : + supprime des questions non publiées.
///   superadmin   : tout, sans garde-fou collectif — publication directe sans
///                  validation, suppression même d'une question publiée, et
///                  SEUL à gérer les comptes (création, rôles, mots de passe,
///                  désactivation) : un admin ou relecteur malveillant ne peut
///                  ni fabriquer de faux comptes, ni écarter les autres. Pensé pour le démarrage (pas
///                  encore de relecteurs) et comme recours contre des
///                  contributeurs malveillants. Ne se crée QU'en ligne de
///                  commande (scripts/contributor.cjs), jamais depuis le web.

export const ROLES = ["contributeur", "relecteur", "admin", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  contributeur: "Contributeur",
  relecteur: "Relecteur",
  admin: "Admin",
  superadmin: "Superadmin",
};

const RANK: Record<Role, number> = { contributeur: 0, relecteur: 1, admin: 2, superadmin: 3 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasRole(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export type Statut = "brouillon" | "revue" | "publie" | "retire";

/// Statuts « figés » : seuls les relecteurs y touchent.
const LOCKED_STATUTS: readonly string[] = ["publie", "retire"];

/// Peut-on modifier le contenu d'une question dans son statut actuel ?
export function canEditQuestion(role: Role, currentStatut: string): boolean {
  return hasRole(role, "relecteur") || !LOCKED_STATUTS.includes(currentStatut);
}

/// Statuts qu'un rôle peut choisir. `publie` reste en plus soumis à la règle
/// de validation (cf. publicationBlocker).
export function selectableStatuts(role: Role): Statut[] {
  return hasRole(role, "relecteur")
    ? ["brouillon", "revue", "publie", "retire"]
    : ["brouillon", "revue"];
}

/// Code (customId) et adresse courte (slug) d'une question qui a été en
/// ligne : les réponses et défis des joueurs référencent son code, et des
/// liens /q/<adresse> ont pu être partagés. Les changer casserait ces
/// références ; seul le superadmin peut passer outre. « A été en ligne » :
/// publiée, retirée (on ne retire que ce qui a été publié), ou datée d'une
/// publication (repassée en brouillon depuis).
export function canChangeIdentifiers(
  role: Role,
  q: { statut: string; datePublication?: Date | null },
): boolean {
  if (role === "superadmin") return true;
  return !LOCKED_STATUTS.includes(q.statut) && !q.datePublication;
}

export function canValidate(role: Role): boolean {
  return hasRole(role, "relecteur");
}

export function canDeleteQuestion(role: Role, statut: string): boolean {
  // Une question publiée a pu être jouée : on la retire, on ne l'efface pas
  // (les réponses et défis des joueurs référencent son customId). Seul le
  // superadmin passe outre.
  if (role === "superadmin") return true;
  return hasRole(role, "admin") && statut !== "publie";
}

/// Publication sans validation par un tiers.
export function canPublishDirectly(role: Role): boolean {
  return role === "superadmin";
}

/// Accès à la gestion des comptes : superadmin uniquement (choix du
/// 2026-11-07). Sinon un compte malveillant pourrait créer des complices qui
/// se valident entre eux.
export function canManageContributors(role: Role): boolean {
  return role === "superadmin";
}

/// Rôles attribuables depuis l'interface. Personne ne crée de superadmin
/// depuis le web (ligne de commande uniquement).
export function assignableRoles(actor: Role): Role[] {
  return canManageContributors(actor) ? ["contributeur", "relecteur", "admin"] : [];
}

/// Le superadmin gère tous les comptes de rang inférieur (pas les autres
/// superadmins, ni le sien).
export function canManageAccount(actor: Role, target: Role): boolean {
  return canManageContributors(actor) && RANK[target] < RANK[actor];
}

/// Règle de publication (choix éditorial du 2026-11-07) : une validation
/// suffit, quelle que soit la sensibilité, à condition qu'elle porte sur la
/// version exacte du contenu publié et qu'elle vienne d'un autre relecteur
/// que l'auteur de cette version. Retourne le motif de blocage, ou null.
export function publicationBlocker(args: {
  contentHash: string;
  /// Auteur de la dernière modification du contenu (null = import en masse
  /// ou question antérieure à l'historique).
  lastContentAuthorId: string | null;
  validations: ReadonlyArray<{ contributorId: string; contentHash: string }>;
}): string | null {
  const valid = countingValidations(args);
  if (valid.length > 0) return null;
  const stale = args.validations.some((v) => v.contentHash !== args.contentHash);
  return stale
    ? "Le contenu a changé depuis la dernière validation : il doit être revalidé par un relecteur avant publication."
    : "Publication impossible : cette version doit d'abord être validée par un relecteur (autre que l'auteur de la modification).";
}

/// Validations qui comptent pour la version courante.
export function countingValidations<V extends { contributorId: string; contentHash: string }>(args: {
  contentHash: string;
  lastContentAuthorId: string | null;
  validations: ReadonlyArray<V>;
}): V[] {
  return args.validations.filter(
    (v) => v.contentHash === args.contentHash && v.contributorId !== args.lastContentAuthorId,
  );
}

/// Un relecteur ne valide pas son propre travail.
export function canValidateVersion(args: {
  role: Role;
  contributorId: string;
  lastContentAuthorId: string | null;
}): boolean {
  return canValidate(args.role) && args.contributorId !== args.lastContentAuthorId;
}
