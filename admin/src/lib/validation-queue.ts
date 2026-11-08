import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { contentHash, type SourceLike } from "@/lib/content-hash";
import { buildOrderBy, buildWhere, type QuestionFilters } from "@/lib/queries";
import {
  awaitsValidation,
  CONTENT_REVISION_KINDS,
  latestContentAuthors,
  versionValidation,
  type VersionValidation,
} from "@/lib/validation-status";

/// Chargement de l'état de validation pour un lot de questions (liste, file
/// « À valider », compteur de la barre de navigation). Quelques requêtes par
/// lot, jamais une par question.

/// À inclure dans un findMany pour pouvoir calculer l'empreinte et l'état de
/// validation (les colonnes du contenu viennent avec `include`).
export const VALIDATION_INCLUDE = {
  sources: { select: { nom: true, url: true, type: true, ordre: true } },
  validations: {
    select: {
      contributorId: true,
      contentHash: true,
      createdAt: true,
      contributor: { select: { displayName: true } },
    },
  },
} satisfies Prisma.QuestionInclude;

type RowWithValidation = Record<string, unknown> & {
  id: string;
  sources: SourceLike[];
  validations: ReadonlyArray<{
    contributorId: string;
    contentHash: string;
    createdAt: Date;
    contributor: { displayName: string };
  }>;
};

/// État de validation de chaque question de `rows`. `scope` est le filtre qui
/// a servi à les charger : les révisions sont lues par jointure plutôt que
/// par une liste d'identifiants (pas de limite de variables SQLite).
export async function validationStatuses(
  rows: readonly RowWithValidation[],
  scope: Prisma.QuestionWhereInput,
): Promise<Map<string, VersionValidation>> {
  if (rows.length === 0) return new Map();
  const revisions = await prisma.questionRevision.findMany({
    where: { kind: { in: [...CONTENT_REVISION_KINDS] }, question: { is: scope } },
    select: { questionId: true, contributorId: true, kind: true, createdAt: true },
  });
  const authors = latestContentAuthors(revisions);
  return new Map(
    rows.map((q) => [
      q.id,
      versionValidation({
        contentHash: contentHash(q, q.sources),
        lastContentAuthorId: authors.get(q.id) ?? null,
        validations: q.validations.map((v) => ({ ...v, contributorName: v.contributor.displayName })),
      }),
    ]),
  );
}

/// Identifiants des questions de la file « À valider » (dans `where`).
export async function awaitingValidationIds(where: Prisma.QuestionWhereInput = {}): Promise<Set<string>> {
  const scope: Prisma.QuestionWhereInput = { AND: [where, { statut: "revue" }] };
  const rows = await prisma.question.findMany({ where: scope, include: VALIDATION_INCLUDE });
  const statuses = await validationStatuses(rows, scope);
  return new Set(
    rows.filter((q) => awaitsValidation(q.statut, statuses.get(q.id) ?? { kind: "aucune" })).map((q) => q.id),
  );
}

/// Questions correspondant aux filtres de la liste, dans l'ordre de tri — vue
/// « À valider » comprise. Sert à la navigation de revue (précédente/suivante).
export async function filteredQuestionIds(filters: QuestionFilters): Promise<string[]> {
  const where = buildWhere(filters);
  const rows = await prisma.question.findMany({
    where,
    orderBy: buildOrderBy(filters.sort),
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (filters.vue !== "a-valider") return ids;
  const awaiting = await awaitingValidationIds(where);
  return ids.filter((id) => awaiting.has(id));
}
