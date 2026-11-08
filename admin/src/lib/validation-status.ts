import { countingValidations } from "@/lib/auth/roles";

/// État de validation d'une question, pour l'affichage (liste, panneau) et la
/// file « À valider ». Fonctions pures, sans accès base : le chargement se
/// fait dans lib/validation-queue.ts.

/// Types de révision qui modifient le *contenu* (par opposition à « statut »).
export const CONTENT_REVISION_KINDS = ["creation", "modification", "import"] as const;

export type ValidationRecord = {
  contributorId: string;
  contentHash: string;
  createdAt: Date;
  /// Nom affiché du relecteur (pour la liste).
  contributorName?: string;
};

/// - validee : au moins une validation compte pour la version actuelle ;
/// - caduque : des validations existent, mais aucune ne compte (contenu
///   modifié depuis, ou validation par l'auteur de la dernière modification) ;
/// - aucune  : personne n'a jamais validé cette question.
export type VersionValidation =
  | { kind: "validee"; validators: string[] }
  | { kind: "caduque" }
  | { kind: "aucune" };

export function versionValidation(args: {
  contentHash: string;
  lastContentAuthorId: string | null;
  validations: readonly ValidationRecord[];
}): VersionValidation {
  const counted = countingValidations(args);
  if (counted.length > 0) {
    return { kind: "validee", validators: counted.map((v) => v.contributorName ?? "?") };
  }
  return args.validations.length > 0 ? { kind: "caduque" } : { kind: "aucune" };
}

/// File « À valider » : relecture demandée (statut « En revue ») et aucune
/// validation qui compte pour la version actuelle. Une question validée mais
/// pas encore publiée n'y est plus : il ne reste qu'à la publier.
export function awaitsValidation(statut: string, v: VersionValidation): boolean {
  return statut === "revue" && v.kind !== "validee";
}

/// Auteur de la dernière modification du contenu, par question, à partir d'un
/// lot de révisions (dans n'importe quel ordre). Les révisions de statut ne
/// comptent pas ; un import en masse donne null (personne ne l'a « écrit » :
/// n'importe quel relecteur peut le valider).
export function latestContentAuthors(
  revisions: ReadonlyArray<{ questionId: string; contributorId: string | null; kind: string; createdAt: Date }>,
): Map<string, string | null> {
  const latest = new Map<string, { at: number; author: string | null }>();
  for (const r of revisions) {
    if (!(CONTENT_REVISION_KINDS as readonly string[]).includes(r.kind)) continue;
    const at = r.createdAt.getTime();
    const cur = latest.get(r.questionId);
    if (!cur || at > cur.at) latest.set(r.questionId, { at, author: r.contributorId });
  }
  return new Map([...latest].map(([id, v]) => [id, v.author]));
}

/// Question publiée avant la mise en place des validations (2026-11-07) :
/// aucune validation, aucune révision faite par un contributeur (au plus des
/// imports depuis le poste local). Elle n'a donc jamais pu être « validée » au
/// sens actuel : le dire, plutôt que d'annoncer qu'il faut la valider avant
/// publication alors qu'elle est en ligne.
export function publishedBeforeValidations(args: {
  statut: string;
  validationsCount: number;
  contributorRevisionsCount: number;
}): boolean {
  return args.statut === "publie" && args.validationsCount === 0 && args.contributorRevisionsCount === 0;
}

export type PublishMeta = { valideurs: string; dateValidation: Date; datePublication: Date };

/// Colonnes renseignées à la publication. Sans validation qui compte (seul cas
/// possible : publication directe par le superadmin), c'est la personne qui
/// publie qui en est garante, et la date de validation est celle de la
/// publication.
export function publishMetaFrom(args: {
  counted: ReadonlyArray<{ createdAt: Date }>;
  validatorNames: readonly string[];
  publisherName: string;
  now: Date;
}): PublishMeta {
  const names = args.validatorNames.length > 0 ? [...args.validatorNames] : [args.publisherName];
  return {
    valideurs: JSON.stringify(names),
    dateValidation:
      args.counted.length > 0
        ? new Date(Math.max(...args.counted.map((v) => v.createdAt.getTime())))
        : args.now,
    datePublication: args.now,
  };
}
