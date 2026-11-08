import type { Question, Source } from "./types";

/// Le « dossier » d'une question : ce qui ne sert qu'APRÈS la réponse
/// (contexte, chiffre en détail, mise en perspective, sources). C'est
/// l'essentiel du poids du catalogue (~70 %) : la page d'accueil envoie
/// les questions sans leur dossier et le navigateur charge les dossiers à
/// part, une fois, en tâche de fond (GET /api/catalogue/dossiers, mis en
/// cache par version). Pur et partagé serveur / client.
export type QuestionDossier = {
  why: string;
  explain: string;
  miseEnPerspective?: string;
  sources: Source[];
};

export function dossierOf(q: Question): QuestionDossier {
  return {
    why: q.why,
    explain: q.explain,
    miseEnPerspective: q.miseEnPerspective,
    sources: q.sources,
  };
}

/// Copie de la question sans son dossier, marquée `dossierDeferred`.
/// Le reste (énoncé, réponse, réglages du format, indicateurs) est intact :
/// le jeu, le score et le portrait n'en ont pas besoin.
export function withoutDossier(q: Question): Question {
  return {
    ...q,
    why: "",
    explain: "",
    miseEnPerspective: undefined,
    sources: [],
    dossierDeferred: true,
  };
}
