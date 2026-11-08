/** Phase machine pilotée par le question-runner. Le passage de chaque phase
 *  à la suivante débloque une couche d'animation dans le composant question
 *  correspondant (verdict, vérité, comparaison) puis l'apparition du dossier
 *  documenté en dessous. */
export type RevealPhase =
  | "ask"
  | "verdict"
  | "truth"
  | "comparison"
  | "dossier";

const ORDER: RevealPhase[] = [
  "ask",
  "verdict",
  "truth",
  "comparison",
  "dossier",
];

export function phaseAtLeast(current: RevealPhase, target: RevealPhase): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(target);
}

/** Calendrier conseillé pour le runner. Les valeurs viennent du brief UX :
 *  verdict à 200 ms, vérité à 500 ms, comparaison à 950 ms, dossier à 1550 ms.
 *  Les valeurs sont en millisecondes depuis la soumission. */
export const PHASE_DELAYS: Record<Exclude<RevealPhase, "ask">, number> = {
  verdict: 200,
  truth: 500,
  comparison: 950,
  dossier: 1550,
};
