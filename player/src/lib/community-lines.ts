/// Lecture collective par défaut des formats sans choix unique (estimation,
/// classement, échelle, catégorisation, pondéré, vrai/faux multiple) : UNE
/// phrase affichée d'office sous le verdict, comme la ligne de contraste des
/// formats binaires (cf. communityContrastLine dans format-shared). Les
/// onglets / boutons « réponses des autres » restent pour le détail.
///
/// Ton : collectif (« les joueurs », « on »), descriptif, sans honte — on
/// cartographie ce que les gens pensent, on ne note personne.
///
/// Toutes les fonctions renvoient null sous le seuil de données (réponse
/// /api/stats avec hasRealData = false, cf. REAL_STATS_THRESHOLD côté route) :
/// dans ce cas on n'affiche RIEN, pas de promesse « reviens plus tard ».

import type { StatsResponse } from "./stats-hook";
import type {
  CategorisationQuestion,
  ClassementQuestion,
  CurseurMultiQuestion,
  EstimationQuestion,
  PondereQuestion,
  VraiFauxMultiQuestion,
} from "./types";
import { fmt, fmtEstimationValue } from "./fmt";
import { scoredItems } from "./curseur-anchors";
import { niceStepForSpan, roundToStep } from "./step-rounding";

const NBSP = " ";

type RealStats = Extract<StatsResponse, { hasRealData: true }>;

function realStats(stats: StatsResponse | null | undefined): RealStats | null {
  return stats && stats.hasRealData ? stats : null;
}

const pct = (n: number) => `${Math.round(n)}${NBSP}%`;

/// « 1,8 » — moyenne d'éléments justes, une décimale au plus.
const avgText = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/// Accord en français : pluriel à partir de 2 (« 1,8 élément », « 2 éléments »).
const noun = (x: number, singular: string, plural: string) =>
  Math.round(x * 10) / 10 >= 2 ? plural : singular;

/// Estimation : moyenne des joueurs face à la réalité, avec le sens de
/// l'écart collectif, puis la part des joueurs tombés « tout près » (même
/// tolérance que le verdict vert).
export function estimationCommunityLine(
  q: EstimationQuestion,
  stats: StatsResponse | null | undefined,
): string | null {
  const s = realStats(stats);
  if (!s || typeof s.mean !== "number" || !Number.isFinite(s.mean)) return null;
  const unit = q.unitShort || q.unit;
  const meanText = fmtEstimationValue(roundToStep(s.mean, q.step), q.range, unit, q.step);
  const gap = s.mean - q.answer;
  let reading: string;
  if (Math.abs(gap) <= q.closeWithin) {
    reading = "la moyenne tombe juste";
  } else {
    const strong = Math.abs(gap) > q.midWithin;
    reading =
      gap > 0
        ? strong
          ? "on surestime nettement"
          : "on surestime un peu"
        : strong
          ? "on sous-estime nettement"
          : "on sous-estime un peu";
  }
  let line = `En moyenne, les joueurs disent ${meanText} : ${reading}.`;
  if (typeof s.pctClose === "number" && Number.isFinite(s.pctClose)) {
    const p = Math.round(s.pctClose);
    line +=
      p <= 5
        ? " Presque personne ne tombe tout près."
        : p < 35
          ? ` Seuls ${pct(p)} tombent tout près.`
          : ` ${pct(p)} tombent tout près.`;
  }
  return line;
}

/// Classement : nombre moyen d'éléments à leur bon rang (somme des % de
/// joueurs ayant mis chaque élément à sa vraie place), et l'élément le plus
/// souvent mal placé.
export function classementCommunityLine(
  q: ClassementQuestion,
  stats: StatsResponse | null | undefined,
): string | null {
  const dist = realStats(stats)?.perItemPositions;
  const n = q.correctOrder.length;
  if (!dist || n === 0) return null;
  let expected = 0;
  let seen = 0;
  let worst: { id: string; p: number } | null = null;
  q.correctOrder.forEach((id, pos) => {
    const d = dist[id];
    if (!d) return;
    seen++;
    const p = d[String(pos)] ?? 0;
    expected += p / 100;
    if (!worst || p < worst.p) worst = { id, p };
  });
  if (seen === 0) return null;
  let line = `En moyenne, les joueurs placent bien ${avgText(expected)} ${noun(expected, "élément", "éléments")} sur ${n}.`;
  const w = worst as { id: string; p: number } | null;
  if (w && w.p < 50) {
    const label = q.items.find((it) => it.id === w.id)?.label;
    if (label) line += ` « ${label} » est le plus souvent mal placé.`;
  }
  return line;
}

/// Vrai/faux multiple : nombre moyen d'affirmations bien jugées, et celle
/// qui piège le plus.
export function vraiFauxMultiCommunityLine(
  q: VraiFauxMultiQuestion,
  stats: StatsResponse | null | undefined,
): string | null {
  const per = realStats(stats)?.perStatement;
  const n = q.statements.length;
  if (!per || n === 0) return null;
  let expected = 0;
  let seen = 0;
  let worst: { idx: number; right: number; wrong: number } | null = null;
  q.statements.forEach((st, idx) => {
    const d = per[st.id];
    if (!d) return;
    seen++;
    const right = st.correct ? d.pctTrue : d.pctFalse;
    const wrong = st.correct ? d.pctFalse : d.pctTrue;
    expected += right / 100;
    if (!worst || right < worst.right) worst = { idx, right, wrong };
  });
  if (seen === 0) return null;
  let line = `En moyenne, les joueurs jugent bien ${avgText(expected)} ${noun(expected, "affirmation", "affirmations")} sur ${n}.`;
  const w = worst as { idx: number; right: number; wrong: number } | null;
  if (w && w.right < 50) {
    line += ` L'affirmation ${String.fromCharCode(65 + w.idx)} piège le plus : ${pct(w.wrong)} se trompent.`;
  }
  return line;
}

/// Catégorisation : nombre moyen de cartes bien classées, et la carte qui
/// piège le plus (avec la case où on la range à tort).
export function categorisationCommunityLine(
  q: CategorisationQuestion,
  stats: StatsResponse | null | undefined,
): string | null {
  const per = realStats(stats)?.perItemBins;
  const n = q.items.length;
  if (!per || n === 0) return null;
  let expected = 0;
  let seen = 0;
  let worst: { id: string; p: number } | null = null;
  for (const it of q.items) {
    const d = per[it.id];
    if (!d) continue;
    seen++;
    const p = d[it.correct] ?? 0;
    expected += p / 100;
    if (!worst || p < worst.p) worst = { id: it.id, p };
  }
  if (seen === 0) return null;
  let line = `En moyenne, les joueurs classent bien ${avgText(expected)} ${noun(expected, "carte", "cartes")} sur ${n}.`;
  const w = worst as { id: string; p: number } | null;
  if (w && w.p < 50) {
    const item = q.items.find((it) => it.id === w.id);
    const d = per[w.id] ?? {};
    let trap: { bin: string; p: number } | null = null;
    for (const [bin, p] of Object.entries(d)) {
      if (bin === item?.correct) continue;
      if (!trap || p > trap.p) trap = { bin, p };
    }
    const t = trap as { bin: string; p: number } | null;
    const binLabel = t ? q.bins.find((b) => b.id === t.bin)?.label : undefined;
    if (item && t && binLabel) {
      line += ` « ${item.label} » piège le plus : ${pct(t.p)} la rangent dans « ${binLabel} ».`;
    } else if (item) {
      line += ` « ${item.label} » piège le plus.`;
    }
  }
  return line;
}

/// Écart (en fraction de la plage) sous lequel la moyenne des joueurs est
/// « près de la vraie valeur » — le même 5 % que la couleur verte de la
/// colonne « Ton écart » de la révélation.
const CURSEUR_NEAR = 0.05;

/// Placer sur une échelle : l'étiquette où la position moyenne des joueurs
/// s'écarte le plus de la réalité. Repères exclus (placés d'office).
export function curseurCommunityLine(
  q: CurseurMultiQuestion,
  stats: StatsResponse | null | undefined,
): string | null {
  const means = realStats(stats)?.perItemMean;
  const span = q.range[1] - q.range[0];
  if (!means || !(span > 0)) return null;
  const items = scoredItems(q).filter(
    (it) => typeof means[it.id] === "number" && Number.isFinite(means[it.id]),
  );
  if (items.length === 0) return null;
  const worst = items.reduce((a, b) =>
    Math.abs(means[b.id] - b.real) > Math.abs(means[a.id] - a.real) ? b : a,
  );
  const mean = means[worst.id];
  if (Math.abs(mean - worst.real) / span < CURSEUR_NEAR) {
    return "En moyenne, les joueurs placent chaque étiquette près de sa vraie valeur.";
  }
  const step = niceStepForSpan(span);
  const v = (x: number) => fmt(roundToStep(x, step), q.unit);
  return `En moyenne, les joueurs placent « ${worst.label} » à ${v(mean)} (réalité : ${v(worst.real)}) : c'est là qu'on se trompe le plus.`;
}

/// Pondéré : la part où l'allocation moyenne des joueurs s'écarte le plus
/// de la réalité. « À quelques points près » sous 5 % du pool.
export function pondereCommunityLine(
  q: PondereQuestion,
  stats: StatsResponse | null | undefined,
): string | null {
  const means = realStats(stats)?.perCategoryMean;
  if (!means || q.pool <= 0) return null;
  const cats = q.categories.filter(
    (c) => typeof means[c.id] === "number" && Number.isFinite(means[c.id]),
  );
  if (cats.length === 0) return null;
  const worst = cats.reduce((a, b) =>
    Math.abs(means[b.id] - b.real) > Math.abs(means[a.id] - a.real) ? b : a,
  );
  const mean = Math.round(means[worst.id]);
  const gap = means[worst.id] - worst.real;
  if (Math.abs(gap) <= q.pool * 0.05) {
    return "En moyenne, la répartition des joueurs colle à la réalité, à quelques points près.";
  }
  const pts = (x: number) => `${x}${NBSP}pt${Math.abs(x) >= 2 ? "s" : ""}`;
  return `En moyenne, les joueurs donnent ${pts(mean)} à « ${worst.label} », pour ${fmt(worst.real)} en réalité : c'est la part qu'on ${gap > 0 ? "surestime" : "sous-estime"} le plus.`;
}
