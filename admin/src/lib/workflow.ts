import { prisma } from "@/lib/db";
import { CONTENT_REVISION_KINDS } from "@/lib/validation-status";

export { CONTENT_REVISION_KINDS };

/// Auteur de la dernière modification du contenu, ou null pour un import en
/// masse ou une question antérieure à l'historique. Sert à empêcher un
/// relecteur de valider son propre travail.
export async function lastContentAuthorId(questionId: string): Promise<string | null> {
  const r = await prisma.questionRevision.findFirst({
    where: { questionId, kind: { in: [...CONTENT_REVISION_KINDS] } },
    orderBy: { createdAt: "desc" },
    select: { contributorId: true },
  });
  return r?.contributorId ?? null;
}

export const SUGGESTION_KINDS = [
  { value: "erreur", label: "Erreur" },
  { value: "source", label: "Source" },
  { value: "formulation", label: "Formulation" },
  { value: "nouvelle_question", label: "Nouvelle question" },
  { value: "autre", label: "Autre" },
] as const;

export const SUGGESTION_STATUTS = [
  { value: "nouvelle", label: "Nouvelle", color: "bg-sky-100 text-sky-800" },
  { value: "en_cours", label: "En cours", color: "bg-amber-100 text-amber-800" },
  { value: "acceptee", label: "Acceptée", color: "bg-emerald-100 text-emerald-800" },
  { value: "refusee", label: "Refusée", color: "bg-zinc-200 text-zinc-700" },
] as const;

export type SuggestionStatut = (typeof SUGGESTION_STATUTS)[number]["value"];

export function isSuggestionStatut(v: unknown): v is SuggestionStatut {
  return SUGGESTION_STATUTS.some((s) => s.value === v);
}

export const REVISION_LABELS: Record<string, string> = {
  creation: "a créé la question",
  modification: "a modifié",
  statut: "a changé",
  import: "Import local",
};

/// Libellés courts des champs pour l'historique.
export const FIELD_LABELS: Record<string, string> = {
  customId: "code",
  slug: "adresse courte",
  theme: "thème",
  sousTheme: "sous-thème",
  format: "format",
  statut: "statut",
  sensibilite: "sensibilité",
  difficulte: "difficulté",
  question: "question",
  precisions: "précisions",
  explication: "explication",
  contextePedagogique: "contexte",
  miseEnPerspective: "mise en perspective",
  indicators: "indicateurs",
  unite: "unité",
  plageMin: "plage min",
  plageMax: "plage max",
  reponseNumerique: "réponse",
  toleranceVerte: "tolérance verte",
  toleranceOrange: "tolérance orange",
  payload: "réponses",
  dateDonnee: "année",
  auteur: "auteur",
  sources: "sources",
};
