/// Teinte d'une réponse au récap (vignettes mobile et bureau, modale de
/// partage). Plus aucun seuil ici : le niveau vient de `answerLevel`
/// (lib/correctness.ts), la même fonction que la révélation, l'accueil et la
/// progression. Ce module ne fait que traduire ce niveau en couleurs, avec le
/// même vocabulaire (LEVEL_LABEL), plus un état « miss » pour les questions
/// sans réponse exploitable.

import type { Answer, Question } from "./types";
import { answerLevel, LEVEL_LABEL, type AnswerLevel } from "./correctness";

export type Closeness = "close" | "mid" | "far" | "miss";

export const CLOSENESS_COLOR: Record<
  Closeness,
  { bg: string; border: string; chip: string; lbl: string }
> = {
  close: {
    bg: "rgba(74,143,92,0.10)",
    border: "rgba(74,143,92,0.5)",
    chip: "var(--signal-good)",
    lbl: LEVEL_LABEL.good,
  },
  mid: {
    bg: "rgba(216,154,62,0.10)",
    border: "rgba(216,154,62,0.5)",
    chip: "var(--signal-mid)",
    lbl: LEVEL_LABEL.mid,
  },
  far: {
    bg: "rgba(199,93,93,0.10)",
    border: "rgba(199,93,93,0.5)",
    chip: "var(--signal-bad)",
    lbl: LEVEL_LABEL.bad,
  },
  miss: {
    bg: "rgba(0,0,0,0.04)",
    border: "var(--rule)",
    chip: "var(--ink-mute)",
    lbl: "–",
  },
};

const FROM_LEVEL: Record<AnswerLevel, Closeness> = {
  good: "close",
  mid: "mid",
  bad: "far",
};

export function closenessOf(q: Question, a: Answer): Closeness {
  if (a == null) return "miss";
  // Estimation avec une valeur non numérique (donnée locale corrompue) :
  // rien à évaluer, plutôt que de la peindre en rouge.
  if (q.format === "estimation" && typeof a !== "number") return "miss";
  return FROM_LEVEL[answerLevel(q, a)];
}
