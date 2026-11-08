import type { Answer, Question } from "./types";
import { fmt } from "./fmt";
import { scoredItems } from "./curseur-anchors";

/// Niveau de justesse d'une réponse, UNIQUE pour toute l'app : pastilles et
/// couleurs de la révélation, récap, accueil, progression, répétition
/// espacée, scores de défi et portrait (ces trois derniers via `isCorrect`,
/// qui vaut exactement `answerLevel(...) === "good"`).
///
///   - "good" (bon)   : la réponse est juste (ou presque, selon le format)
///   - "mid"  (moyen) : dans le bon ordre de grandeur / à moitié juste
///   - "bad"  (loin)  : à côté
///
/// Les formats binaires (vrai/faux, A/B, QCM) n'ont pas de niveau moyen.
export type AnswerLevel = "good" | "mid" | "bad";

/// Un seul vocabulaire pour dire le niveau, partout (bandeaux, pastilles,
/// légende du récap, annonces lecteur d'écran). Ton « pas de honte » : on
/// décrit le résultat, jamais la personne.
export const LEVEL_LABEL: Record<AnswerLevel, string> = {
  good: "Bien vu",
  mid: "Pas loin",
  bad: "Pas cette fois",
};

/// Seuils d'évaluation par format, centralisés ici : c'est le seul endroit
/// qui décide « qu'est-ce qu'on considère comme juste ».
///
/// - Estimation : les seuils viennent de la question (`closeWithin` = vert,
///   `midWithin` = orange ; par défaut 5 % et 15 % de la plage, cf.
///   content.ts). Les mêmes au récap et à la révélation.
/// - Placer sur une échelle (curseur_multi) : écart moyen des étiquettes du
///   joueur (repères exclus), en fraction de la plage. < 10 % = bon
///   (seuil de référence historique), < 30 % = moyen.
/// - Pondéré : score = pool − Σ|écart|/2, exprimé en % du pool. ≥ 85 % = bon
///   (seuil de référence historique), ≥ 65 % = moyen.
/// - Formats « N éléments sur M justes » (classement : éléments bien placés,
///   vrai/faux multiple : affirmations bien jugées, catégorisation : cartes
///   bien classées) : UNE règle commune, alignée sur le pondéré.
///     bon   : au moins 85 % des éléments justes — en pratique tout juste
///             jusqu'à 6 éléments (5/6 = 83 %), une erreur tolérée à partir
///             de 7 (6/7 = 86 %) ;
///     moyen : au moins la moitié des éléments justes ;
///     loin  : moins de la moitié.
///   Avant, 4/5 était vert en classement et en vrai/faux multiple mais
///   orange en catégorisation, et comptait juste ou faux selon le format
///   côté progression.
export const CORRECTNESS_THRESHOLDS = {
  curseurAvgDeviationMax: 0.1,
  curseurAvgDeviationMid: 0.3,
  pondereScoreThreshold: 85,
  pondereScoreMid: 65,
  countGoodPct: 85,
  countMidPct: 50,
} as const;

// ─── Scores bruts par format (partagés avec les écrans de révélation) ───

/// Classement : nombre d'éléments à leur rang exact.
export function scoreClassement(user: string[], correct: string[]): number {
  let good = 0;
  user.forEach((id, i) => {
    if (correct[i] === id) good++;
  });
  return good;
}

/// Vrai/faux multiple : nombre d'affirmations bien jugées.
export function scoreVraiFauxMulti(
  picks: Record<string, boolean>,
  q: Extract<Question, { format: "vraifaux_multi" }>,
): number {
  return q.statements.filter((s) => picks[s.id] === s.correct).length;
}

/// Catégorisation : nombre de cartes rangées dans la bonne case.
export function scoreCategorisation(
  placements: Record<string, string>,
  q: Extract<Question, { format: "categorisation" }>,
): number {
  return q.items.filter((it) => placements[it.id] === it.correct).length;
}

/// Pondéré : points « bien répartis » sur l'échelle 0..pool. Chaque point
/// mal placé compte deux fois dans Σ|écart| (en trop ici, manquant là),
/// d'où la division par 2.
export function scorePondere(
  alloc: Record<string, number>,
  q: Extract<Question, { format: "pondere" }>,
): number {
  const totalDiff = q.categories.reduce(
    (acc, c) => acc + Math.abs((alloc[c.id] ?? 0) - c.real),
    0,
  );
  return Math.max(0, q.pool - totalDiff / 2);
}

/// Placer sur une échelle : écart moyen |joueur − réel| des étiquettes à
/// placer, en fraction de la plage. Repères exclus : posés d'office à leur
/// vraie position, ils rendraient le score artificiellement bon (cf.
/// curseur-anchors). Une étiquette sans position compte au milieu de la plage.
export function curseurAvgDeviation(
  pos: Record<string, number>,
  q: Extract<Question, { format: "curseur_multi" }>,
): number {
  const span = q.range[1] - q.range[0];
  const items = scoredItems(q);
  if (items.length === 0 || span <= 0) return 0;
  return (
    items.reduce(
      (acc, it) => acc + Math.abs((pos[it.id] ?? q.range[0] + span / 2) - it.real),
      0,
    ) /
    items.length /
    span
  );
}

/// Règle commune des formats « N éléments sur M justes ». Comparaison en
/// entiers (pas de flottants) : good × 100 ≥ total × seuil.
export function countLevel(good: number, total: number): AnswerLevel {
  if (total <= 0) return "good";
  if (good * 100 >= total * CORRECTNESS_THRESHOLDS.countGoodPct) return "good";
  if (good * 100 >= total * CORRECTNESS_THRESHOLDS.countMidPct) return "mid";
  return "bad";
}

function isRecord(ans: Answer): ans is Record<string, boolean | number | string> {
  return typeof ans === "object" && ans !== null && !Array.isArray(ans);
}

/// LA fonction de niveau. Toute évaluation d'une réponse passe par ici.
export function answerLevel(q: Question, ans: Answer): AnswerLevel {
  if (ans == null) return "bad";
  switch (q.format) {
    case "estimation": {
      if (typeof ans !== "number") return "bad";
      const diff = Math.abs(ans - q.answer);
      if (diff <= q.closeWithin) return "good";
      if (diff <= q.midWithin) return "mid";
      return "bad";
    }
    case "ab":
    case "qcm":
      return ans === q.correctIndex ? "good" : "bad";
    case "vraifaux":
      return ans === q.correctAnswer ? "good" : "bad";
    case "classement":
      if (!Array.isArray(ans)) return "bad";
      return countLevel(scoreClassement(ans, q.correctOrder), q.correctOrder.length);
    case "vraifaux_multi":
      if (!isRecord(ans)) return "bad";
      return countLevel(
        scoreVraiFauxMulti(ans as Record<string, boolean>, q),
        q.statements.length,
      );
    case "categorisation":
      if (!isRecord(ans)) return "bad";
      return countLevel(
        scoreCategorisation(ans as Record<string, string>, q),
        q.items.length,
      );
    case "curseur_multi": {
      if (!isRecord(ans)) return "bad";
      const avg = curseurAvgDeviation(ans as Record<string, number>, q);
      if (avg < CORRECTNESS_THRESHOLDS.curseurAvgDeviationMax) return "good";
      if (avg < CORRECTNESS_THRESHOLDS.curseurAvgDeviationMid) return "mid";
      return "bad";
    }
    case "pondere": {
      if (!isRecord(ans)) return "bad";
      if (q.pool <= 0) return "bad";
      const pct = (scorePondere(ans as Record<string, number>, q) / q.pool) * 100;
      if (pct >= CORRECTNESS_THRESHOLDS.pondereScoreThreshold) return "good";
      if (pct >= CORRECTNESS_THRESHOLDS.pondereScoreMid) return "mid";
      return "bad";
    }
  }
  return "bad";
}

/// Réponse « juste » au sens de la progression (accueil, stats, Réviser,
/// répétition espacée), des scores de défi recalculés côté serveur et du
/// portrait : exactement le niveau « bon ».
export function isCorrect(q: Question, ans: Answer): boolean {
  return answerLevel(q, ans) === "good";
}

export function formatUserAnswer(q: Question, ans: Answer): string {
  if (q.format === "estimation") {
    if (typeof ans !== "number") return "–";
    return fmt(ans, q.unitShort || q.unit);
  }
  if (q.format === "ab") {
    if (ans !== 0 && ans !== 1) return "–";
    return q.choices[ans].label;
  }
  if (q.format === "vraifaux") {
    if (typeof ans !== "boolean") return "–";
    return ans ? "Vrai" : "Faux";
  }
  if (q.format === "qcm") {
    if (typeof ans !== "number" || ans < 0 || ans >= q.choices.length) return "–";
    return q.choices[ans];
  }
  if (q.format === "classement") {
    if (!Array.isArray(ans)) return "–";
    const good = scoreClassement(ans, q.correctOrder);
    return `${good}/${q.correctOrder.length} bien placés`;
  }
  if (q.format === "vraifaux_multi") {
    if (!isRecord(ans)) return "–";
    const good = scoreVraiFauxMulti(ans as Record<string, boolean>, q);
    return `${good}/${q.statements.length} correctes`;
  }
  if (q.format === "curseur_multi") {
    if (!isRecord(ans)) return "–";
    return "Placements enregistrés";
  }
  if (q.format === "categorisation") {
    if (!isRecord(ans)) return "–";
    const good = scoreCategorisation(ans as Record<string, string>, q);
    return `${good}/${q.items.length} bien classées`;
  }
  if (q.format === "pondere") {
    if (!isRecord(ans)) return "–";
    const pct = scorePondere(ans as Record<string, number>, q);
    return `${Math.round(pct)}/${q.pool} bien distribués`;
  }
  return "–";
}
