/// Agrégations dérivées de `Progress` pour la page "Mes stats".
///
/// Fonctions pures, sans dépendance React. Utilisées par screens/stats.tsx et
/// desktop/stats-dt.tsx — la page mobile et desktop partagent les mêmes
/// agrégations pour rester cohérentes.
///
/// On distingue ici "answered" (l'utilisateur a soumis quelque chose) et
/// "correct" (le runner a évalué la réponse comme juste — boolean dans
/// l'AnswerRecord, calculé au moment de la réponse selon les règles propres
/// au format).

import type { AnswerRecord, Progress } from "./progress";
import { currentStreak } from "./progress";
import type { Question, Theme } from "./types";
import {
  INDICATORS,
  INDICATOR_IDS,
  type IndicatorId,
} from "./indicators";
import { scoredItems } from "./curseur-anchors";

export type FormatId = Question["format"];

export const FORMAT_LABELS: Record<FormatId, string> = {
  estimation: "Estimation",
  ab: "A ou B",
  vraifaux: "Vrai / Faux",
  qcm: "QCM",
  classement: "Classement",
  vraifaux_multi: "Vrai / Faux multi",
  curseur_multi: "Curseur multi",
  categorisation: "Catégorisation",
  pondere: "Pondérée",
};

export type HeroStats = {
  answered: number;
  total: number;
  correct: number;
  accuracyPct: number | null;
  streakDays: number;
  lastPlayedDay: string | null;
  favorites: number;
};

export function computeHero(progress: Progress, total: number): HeroStats {
  const answered = Object.keys(progress.answers).length;
  let correct = 0;
  for (const id in progress.answers) {
    if (progress.answers[id].correct) correct++;
  }
  return {
    answered,
    total,
    correct,
    accuracyPct: answered > 0 ? Math.round((correct / answered) * 100) : null,
    streakDays: currentStreak(progress),
    lastPlayedDay: progress.streak.lastPlayedDay,
    favorites: Object.keys(progress.favorites).length,
  };
}

export type ThemeStatRow = {
  id: string;
  label: string;
  color: string;
  total: number;
  answered: number;
  correct: number;
  accuracyPct: number | null;
};

/// Agrège par thème en croisant questions publiées et réponses locales.
/// Trie par "answered desc" puis "total desc" : les thèmes les plus joués
/// apparaissent en premier. Filtre les thèmes sans question publiée pour
/// éviter d'afficher des barres vides.
export function computeByTheme(
  progress: Progress,
  questions: Question[],
  themes: Theme[],
): ThemeStatRow[] {
  const byId = new Map<string, Question>();
  for (const q of questions) byId.set(q.id, q);

  const rows = themes.map((t) => {
    const themeQuestions = questions.filter((q) => q.theme === t.label);
    let answered = 0;
    let correct = 0;
    for (const q of themeQuestions) {
      const a = progress.answers[q.id];
      if (!a) continue;
      answered++;
      if (a.correct) correct++;
    }
    return {
      id: t.id,
      label: t.label,
      color: t.color,
      total: t.count,
      answered,
      correct,
      accuracyPct: answered > 0 ? Math.round((correct / answered) * 100) : null,
    };
  });

  // Garde l'ordre catalogue mais place en premier les thèmes joués (par
  // nombre de réponses décroissant). Les thèmes 0-joué restent listés
  // dans l'ordre des thèmes (utile pour montrer les zones à explorer).
  const played = rows.filter((r) => r.answered > 0).sort((a, b) => b.answered - a.answered);
  const untouched = rows.filter((r) => r.answered === 0);
  // Petit garde silencieux contre l'unused var quand byId n'est plus utilisé
  // (ici on s'en servait pour un autre prototype, laissé en place au cas où
  // on veuille filtrer par questionId au lieu de label).
  void byId;
  return [...played, ...untouched];
}

export type FormatStatRow = {
  format: FormatId;
  label: string;
  answered: number;
  correct: number;
  accuracyPct: number | null;
};

/// Agrège par format de question. Ne liste que les formats où l'utilisateur
/// a au moins une réponse — pas la peine d'afficher des lignes vides pour
/// les formats qu'il n'a jamais joués.
export function computeByFormat(
  progress: Progress,
  questions: Question[],
): FormatStatRow[] {
  const byId = new Map<string, Question>();
  for (const q of questions) byId.set(q.id, q);

  const acc = new Map<FormatId, { answered: number; correct: number }>();
  for (const [qid, a] of Object.entries(progress.answers)) {
    const q = byId.get(qid);
    if (!q) continue; // réponse à une question dépubliée — ignorée pour les stats
    const entry = acc.get(q.format) ?? { answered: 0, correct: 0 };
    entry.answered++;
    if (a.correct) entry.correct++;
    acc.set(q.format, entry);
  }

  const rows: FormatStatRow[] = [];
  for (const [format, { answered, correct }] of acc.entries()) {
    rows.push({
      format,
      label: FORMAT_LABELS[format],
      answered,
      correct,
      accuracyPct: answered > 0 ? Math.round((correct / answered) * 100) : null,
    });
  }
  rows.sort((a, b) => b.answered - a.answered);
  return rows;
}

export type ChallengeSummary = {
  /// Défis envoyés. Source serveur (/api/defis/mine) quand elle est fournie :
  /// `progress.challenges.sent` n'est plus alimenté depuis que les défis
  /// vivent en base, il ne sert plus que de repli.
  sentCount: number;
  /// Réponses d'ami·e·s reçues sur ces défis envoyés (0 sans source serveur).
  sentResponses: number;
  receivedCount: number;
  receivedPlayed: number;
  /// Score moyen sur les défis reçus joués (% justesse moyen). null si aucun
  /// défi reçu n'a encore été joué.
  receivedAvgMyScore: number | null;
  /// Score moyen de l'envoyeur sur ces mêmes défis joués (comparable à
  /// `receivedAvgMyScore`). null si aucun joué.
  receivedAvgOpponentScore: number | null;
};

export function computeChallenges(
  progress: Progress,
  /// Défis envoyés lus côté serveur (cf. useMyDefis). null/undefined = pas
  /// (encore) disponible → repli sur le local.
  sentDefis?: ReadonlyArray<{ responsesCount: number }> | null,
): ChallengeSummary {
  const sent = progress.challenges.sent;
  const received = progress.challenges.received;
  const played = received.filter((r) => r.myScore !== null);
  const sumMy = played.reduce((s, r) => s + (r.myScore ?? 0), 0);
  const sumOp = played.reduce((s, r) => s + r.opponentScore, 0);
  return {
    sentCount: sentDefis ? sentDefis.length : sent.length,
    sentResponses: sentDefis
      ? sentDefis.reduce((n, d) => n + Math.max(0, d.responsesCount), 0)
      : 0,
    receivedCount: received.length,
    receivedPlayed: played.length,
    receivedAvgMyScore: played.length > 0 ? Math.round(sumMy / played.length) : null,
    receivedAvgOpponentScore:
      played.length > 0 ? Math.round(sumOp / played.length) : null,
  };
}

/// Portrait civique : agrège des signaux que les stats brutes ne révèlent
/// pas au premier coup d'œil. Plutôt que "47% de justesse sur Climat"
/// (chiffre flat), on cherche à dire "Tu surestimes les fragilités
/// démocratiques" — ce qui est actionnable politiquement.
///
/// Quatre signaux exposés :
///   - `strongTheme`  : meilleur taux de justesse (≥ 3 questions répondues
///                      pour éviter le bruit) → "Ton point fort"
///   - `weakTheme`    : pire taux de justesse (idem ≥ 3) → "Ton angle mort"
///   - `blindSpot`    : thème publié avec le plus de questions non touchées
///                      → "À creuser" (n'a rien à voir avec la justesse,
///                      c'est juste de la couverture)
///   - `indicatorBiases` : par INDICATEUR SÉMANTIQUE TRANSVERSE (précarité,
///                      inégalités, démocratie…), score signé sur [-1, +1].
///                      Lecture beaucoup plus puissante que par thème car
///                      la même question peut peser sur plusieurs indicateurs
///                      (ex. mal-logés → précarité + logement). Cf. lib/
///                      indicators.ts pour la taxonomie + tagging.

/// Seuils des paliers qualitatifs pour les scores d'indicateur. Cale
/// "sur"/"sous" à 0.2 (assez net pour être affiché sans risque de
/// sur-interprétation) et "forte_sur"/"forte_sous" à 0.5 (signal franc).
const QUALITATIVE_THRESHOLDS = {
  forte: 0.5,
  moderate: 0.2,
} as const;
function qualitativeOf(signedScore: number): IndicatorBiasRow["qualitative"] {
  if (signedScore >= QUALITATIVE_THRESHOLDS.forte) return "forte_sur";
  if (signedScore >= QUALITATIVE_THRESHOLDS.moderate) return "sur";
  if (signedScore <= -QUALITATIVE_THRESHOLDS.forte) return "forte_sous";
  if (signedScore <= -QUALITATIVE_THRESHOLDS.moderate) return "sous";
  return "juste";
}

/// Seuil minimum d'indices agrégés par indicateur pour qu'il ressorte au
/// portrait. ≥ 3 est un compromis : assez pour réduire le bruit de
/// hasard, assez bas pour qu'un user actif voit son portrait dès quelques
/// dizaines de questions jouées (vs ≥ 5 qui exigeait souvent 50+ questions).
const INDICATOR_MIN_SAMPLES = 3;

/// Calcule le score signé par indicateur sémantique pour le user courant.
///
/// Comportement :
///   - Retourne UN row par indicateur trans-thèmes qui a accumulé
///     ≥ INDICATOR_MIN_SAMPLES indices. Les indicateurs sans data
///     suffisante sont exclus (pour avoir un signal stable).
///   - Pour obtenir TOUS les indicateurs (incluant ceux à 0 indice),
///     utiliser `computeAllIndicatorBiases` (cf. page Indicateurs dédiée).
///
/// Contribution par question (signe = direction du biais user → +1, -1) :
///   - estimation : clamp((userValue − truth) / truth, -1, +1) * polarity
///     Clamp pour éviter qu'une estimation très éloignée (ratio +15)
///     écrase la moyenne sur 5-10 indices.
///   - V/F, A/B, QCM : 0 si réponse correcte, polarity si fausse
///     Convention : la polarity de la question pour cet indicateur exprime
///     "se tromper SUR-évalue (+1) ou SOUS-évalue (-1) l'indicateur".
///   - Composites (vraifaux_multi, classement, categorisation, pondere,
///     curseur_multi) : ratio d'erreur ∈ [0, 1] × polarity (cf. contributionFor).
///
/// Cette fonction est appelée depuis computePortrait, mais exportée pour
/// permettre des tests et des appels indépendants.
export function computeIndicatorBiases(
  progress: Progress,
  questions: Question[],
): IndicatorBiasRow[] {
  // Index par id pour O(1) lookup pendant l'itération sur answers.
  const byId = new Map<string, Question>();
  for (const q of questions) byId.set(q.id, q);

  // Accumule sum + count par indicateur. Map sur IndicatorId pour stay
  // typesafe ; les indicateurs absents = pas de signal pour le user.
  const acc = new Map<IndicatorId, { sum: number; count: number }>();

  for (const [qid, a] of Object.entries(progress.answers)) {
    const q = byId.get(qid);
    if (!q?.indicators?.length) continue;
    const baseContribution = contributionFor(q, a);
    if (baseContribution === null) continue;
    // Une question peut peser sur 1-3 indicateurs avec sa propre polarité
    // pour chacun. La même contribution brute est multipliée par chaque
    // polarité indicator-wise pour signer la direction par indicateur.
    for (const { id, polarity } of q.indicators) {
      const signed = baseContribution * polarity;
      const entry = acc.get(id) ?? { sum: 0, count: 0 };
      entry.sum += signed;
      entry.count++;
      acc.set(id, entry);
    }
  }

  const rows: IndicatorBiasRow[] = [];
  for (const [id, { sum, count }] of acc.entries()) {
    if (count < INDICATOR_MIN_SAMPLES) continue;
    const meta = INDICATORS[id];
    const signedScore = sum / count;
    rows.push({
      id,
      label: meta.label,
      subjectShort: meta.subjectShort,
      signedScore,
      count,
      qualitative: qualitativeOf(signedScore),
    });
  }
  // Tri par magnitude décroissante : les biais les plus marqués en
  // premier (signal le plus actionnable pour l'utilisateur).
  rows.sort((a, b) => Math.abs(b.signedScore) - Math.abs(a.signedScore));
  return rows;
}

export type IndicatorContribution = {
  question: Question;
  answer: AnswerRecord;
  /// Polarité de la question SUR CET indicateur (+1 ou -1).
  polarity: 1 | -1;
  /// Contribution brute de la réponse, avant polarité — [-1, +1] pour
  /// estimation, 0 ou 1 pour les binaires, [0, 1] pour les composites.
  baseContribution: number;
  /// baseContribution × polarity : c'est ce qui rentre dans la somme.
  /// +1 = pousse l'indicateur vers la surestime, -1 vers la sous-estime,
  /// 0 = neutre (réponse juste).
  signedContribution: number;
};

/// Liste détaillée des réponses qui ont contribué à un indicateur donné.
/// Sert la modal "détail des dimensions" : on doit pouvoir reconstituer
/// exactement comment le score d'un indicateur a été construit.
///
/// Ordre de sortie : magnitude de la contribution signée décroissante,
/// puis ts décroissant (plus récents d'abord à magnitude égale).
export function computeIndicatorContributions(
  progress: Progress,
  questions: Question[],
  indicatorId: IndicatorId,
): IndicatorContribution[] {
  const byId = new Map<string, Question>();
  for (const q of questions) byId.set(q.id, q);
  const out: IndicatorContribution[] = [];
  for (const [qid, a] of Object.entries(progress.answers)) {
    const q = byId.get(qid);
    if (!q?.indicators?.length) continue;
    const tag = q.indicators.find((t) => t.id === indicatorId);
    if (!tag) continue;
    const base = contributionFor(q, a);
    if (base === null) continue;
    const polarity = tag.polarity as 1 | -1;
    out.push({
      question: q,
      answer: a,
      polarity,
      baseContribution: base,
      signedContribution: base * polarity,
    });
  }
  out.sort((a, b) => {
    const dm = Math.abs(b.signedContribution) - Math.abs(a.signedContribution);
    if (dm !== 0) return dm;
    return b.answer.ts - a.answer.ts;
  });
  return out;
}

/// Seuil min d'indicateurs mesurés pour qu'on calcule un score Lucidité.
/// En dessous, le chiffre serait trompeur (basé sur 1-2 axes seulement,
/// non représentatif).
const LUCIDITY_MIN_INDICATORS = 3;

export type LucidityResult = {
  /// Score 0-100, plus élevé = vision plus proche de la réalité.
  score: number;
  /// Nombre d'indicateurs effectivement comptés dans le calcul (≥ MIN).
  measuredCount: number;
  /// Nombre total d'indicateurs de la taxonomie (typiquement 9).
  totalCount: number;
};

/// Score "Lucidité" : 0-100, plus élevé = vision plus proche de la réalité.
/// Calcul : pour chaque indicateur AVEC ASSEZ DE DATA, on prend la magnitude
/// |signedScore| (∈ [0, 1] où 0 = juste, 1 = très loin), on moyenne, et on
/// convertit en `(1 - moyenne) * 100`.
///
/// IMPORTANT — les indicateurs sans données suffisantes (count < minSamples)
/// sont EXCLUS du calcul (pas pénalisés). Un user qui n'a pas joué Climat
/// ne s'est pas "trompé" dessus. Mais ça crée une asymétrie de confiance :
/// un score basé sur 3 axes mesurés est moins robuste qu'un score basé sur
/// 9. C'est pourquoi on retourne aussi `measuredCount` — l'UI peut afficher
/// "82/100 sur 5 dimensions" pour rester épistémiquement honnête.
///
/// Retourne null si moins de LUCIDITY_MIN_INDICATORS indicateurs sont
/// mesurés (sinon le chiffre serait basé sur un échantillon trop maigre).
///
/// Pourquoi exposer ce chiffre : c'est le hook viral. Un score simple,
/// flatteur quand on est bon, intrigant pour les autres — l'équivalent
/// civique du "X/6 Wordle". Pas un classement vs les autres — juste une
/// mesure absolue de "ta vision est-elle proche de la réalité française ?".
export function computeLucidityScore(
  biases: IndicatorBiasRow[],
  minSamples = 3,
): LucidityResult | null {
  const measured = biases.filter((b) => b.count >= minSamples);
  if (measured.length < LUCIDITY_MIN_INDICATORS) return null;
  const avgError =
    measured.reduce((sum, b) => sum + Math.abs(b.signedScore), 0) /
    measured.length;
  return {
    score: Math.round((1 - avgError) * 100),
    measuredCount: measured.length,
    totalCount: biases.length,
  };
}

/// Variante "vue complète" : retourne UN row par indicateur de la taxonomie
/// (cf. INDICATOR_IDS), même ceux à 0 indice. Utilisée par la page
/// "Indicateurs" dédiée pour afficher tous les axes du portrait, y compris
/// ceux où l'utilisateur n'a pas encore assez de matière. Trie par ordre
/// canonique (INDICATOR_IDS) — utile pour avoir un layout stable.
export function computeAllIndicatorBiases(
  progress: Progress,
  questions: Question[],
): IndicatorBiasRow[] {
  const computed = computeIndicatorBiases(progress, questions);
  const byId = new Map(computed.map((r) => [r.id, r]));
  return INDICATOR_IDS.map((id) => {
    const existing = byId.get(id);
    if (existing) return existing;
    const meta = INDICATORS[id];
    return {
      id,
      label: meta.label,
      subjectShort: meta.subjectShort,
      signedScore: 0,
      count: 0,
      qualitative: "juste" as const,
    };
  });
}

/// Contribution brute (avant multiplication par polarity indicator-wise)
/// d'une réponse. Retourne `null` si la question n'a pas de format pris
/// en charge ou si la donnée est invalide (NaN, truth=0, etc.).
///
/// Convention de signe :
///   - Formats avec direction native (estimation) : la contribution PORTE
///     le signe — +1 = surestimation au sens de la question.
///   - Formats sans direction native (V/F, A/B, QCM, composites) : la
///     contribution est dans [0, +1], la direction étant appliquée par
///     `polarity` au moment de l'agrégation. 0 = parfait, 1 = erreur max.
///
/// Pour les composites, on calcule un **ratio d'erreur** ∈ [0, 1] :
///   - vraifaux_multi : fraction d'affirmations mal jugées
///   - classement     : fraction d'items à la mauvaise position
///   - categorisation : fraction d'items dans le mauvais bin
///   - pondere        : distance L1 normalisée par max théorique (2×pool)
///   - curseur_multi  : moyenne des écarts |user-real| normalisés par range
///
/// Chaque ratio représente "à quel point le user s'est trompé sur cette
/// question". La polarité par indicateur, appliquée plus haut, traduit ce
/// ratio en signedScore (vers + ou - sur l'axe sémantique). C'est la
/// même logique que pour V/F, juste étendue au domaine continu.
/// Exportée pour que le serveur (moyenne communautaire du portrait) applique
/// exactement le même calcul que le joueur.
export function contributionFor(
  q: Question,
  a: { value: unknown; correct: boolean },
): number | null {
  switch (q.format) {
    case "estimation": {
      if (typeof a.value !== "number") return null;
      if (q.answer === 0) return null;
      // Division par |réponse| : avec une vraie valeur négative (ex. −0,5 %),
      // diviser par la valeur signée inversait le sens (surestimer comptait
      // comme sous-estimer).
      const raw = (a.value - q.answer) / Math.abs(q.answer);
      // Borne [-1, +1] : une estimation aberrante (ratio +15) serait
      // disproportionnée vs une erreur binaire (qui vaut au max +1).
      return Math.max(-1, Math.min(1, raw));
    }
    case "vraifaux":
    case "ab":
    case "qcm":
      return a.correct ? 0 : 1;
    case "vraifaux_multi": {
      // value = Record<statementId, boolean>. On compte le nb d'affirmations
      // mal jugées sur le total. Une réponse non fournie pour une affirmation
      // compte comme erreur (équivalent au passage du temps sans choisir).
      const userMap = a.value as Record<string, boolean> | null;
      if (!userMap || typeof userMap !== "object") return null;
      const total = q.statements.length;
      if (total === 0) return null;
      let errors = 0;
      for (const s of q.statements) {
        if (userMap[s.id] !== s.correct) errors++;
      }
      return errors / total;
    }
    case "classement": {
      // value = string[] dans l'ordre user. correctOrder = string[] vrai
      // ordre. On mesure la fraction d'items dont la position diffère
      // (mesure stricte) — simple et borné [0, 1]. Une distance type
      // Spearman serait plus fine mais le strict-match suffit à signer
      // le biais (mal classer = se tromper, c'est le signal qu'on veut).
      const userOrder = a.value as string[] | null;
      if (!Array.isArray(userOrder)) return null;
      const total = q.correctOrder.length;
      if (total === 0) return null;
      let misplaced = 0;
      for (let i = 0; i < total; i++) {
        if (userOrder[i] !== q.correctOrder[i]) misplaced++;
      }
      return misplaced / total;
    }
    case "categorisation": {
      // value = Record<itemId, binId>. Fraction d'items dans un mauvais bin.
      const userMap = a.value as Record<string, string> | null;
      if (!userMap || typeof userMap !== "object") return null;
      const total = q.items.length;
      if (total === 0) return null;
      let errors = 0;
      for (const it of q.items) {
        if (userMap[it.id] !== it.correct) errors++;
      }
      return errors / total;
    }
    case "pondere": {
      // value = Record<catId, points>. On normalise par 2×pool : la somme
      // |user_i - real_i| atteint son max quand toute la masse user est
      // concentrée sur la catégorie opposée à celle où real concentre
      // (max = 2×pool). Ratio ∈ [0, 1].
      const userMap = a.value as Record<string, number> | null;
      if (!userMap || typeof userMap !== "object") return null;
      const total = q.categories.length;
      if (total === 0 || q.pool <= 0) return null;
      let absDiff = 0;
      for (const c of q.categories) {
        const userVal = typeof userMap[c.id] === "number" ? userMap[c.id] : 0;
        absDiff += Math.abs(userVal - c.real);
      }
      return Math.min(1, absDiff / (2 * q.pool));
    }
    case "curseur_multi": {
      // value = Record<itemId, position>. Pour chaque item, on calcule
      // |user_i - real_i| / range, puis on moyenne. Une position user hors
      // range (saisie corrompue) est clampée pour rester dans [0, 1].
      const userMap = a.value as Record<string, number> | null;
      if (!userMap || typeof userMap !== "object") return null;
      // Repères exclus (placés d'office, cf. curseur-anchors).
      const items = scoredItems(q);
      const total = items.length;
      const range = q.range[1] - q.range[0];
      if (total === 0 || range <= 0) return null;
      let sumNorm = 0;
      for (const it of items) {
        const userVal = typeof userMap[it.id] === "number" ? userMap[it.id] : it.real;
        const diff = Math.abs(userVal - it.real);
        sumNorm += Math.min(1, diff / range);
      }
      return sumNorm / total;
    }
  }
}

/// Biais agrégé par indicateur sémantique trans-thèmes — la nouvelle
/// version (depuis 2026-05-22) du biais d'estimation. Plus puissant que
/// `EstimationBiasRow` (par thème) car capture des dimensions transverses
/// : précarité, inégalités, démocratie… cf. lib/indicators.ts.
export type IndicatorBiasRow = {
  id: IndicatorId;
  label: string;
  subjectShort: string;
  /// Score signé dans [-1, +1]. Positif = surestime, négatif = sous-estime.
  /// Magnitude exprime la cohérence du biais (1.0 = systématique, 0.1 = faible).
  signedScore: number;
  /// Nombre d'indices agrégés (estimations + erreurs binaires).
  count: number;
  /// Étiquette qualitative dérivée du signedScore — évite d'afficher
  /// des "+9 %" sur petit échantillon (mensonge implicite de précision).
  ///   forte_sous    : signedScore ≤ -0.5
  ///   sous          : signedScore ≤ -0.2
  ///   juste         : -0.2 < signedScore < +0.2
  ///   sur           : signedScore ≥ +0.2
  ///   forte_sur     : signedScore ≥ +0.5
  qualitative: "forte_sous" | "sous" | "juste" | "sur" | "forte_sur";
};

export type PortraitStats = {
  strongTheme: ThemeStatRow | null;
  weakTheme: ThemeStatRow | null;
  blindSpot: ThemeStatRow | null;
  /// Biais par indicateur sémantique trans-thèmes — la lecture principale
  /// affichée dans la section Portrait depuis 2026-05-22.
  indicatorBiases: IndicatorBiasRow[];
};

/// Seuil minimum de questions répondues pour qu'un thème soit éligible aux
/// labels "point fort / angle mort". En dessous, un seul faux pas peut faire
/// passer un thème de 100% à 50% → mauvaise narration.
const PORTRAIT_MIN_ANSWERED = 3;

export function computePortrait(
  progress: Progress,
  questions: Question[],
  themes: Theme[],
): PortraitStats {
  const byTheme = computeByTheme(progress, questions, themes);
  const eligible = byTheme.filter(
    (r) => r.answered >= PORTRAIT_MIN_ANSWERED && r.accuracyPct !== null,
  );
  // Tie-break sur le nombre de questions répondues (plus joué = plus
  // significatif) puis l'ordre catalogue. Sans ce break, deux thèmes à 100%
  // avec 3 et 12 réponses seraient mis à égalité — on préfère valoriser le
  // plus joué comme "point fort".
  const sortedByAcc = [...eligible].sort((a, b) => {
    const accDiff = (b.accuracyPct ?? 0) - (a.accuracyPct ?? 0);
    if (accDiff !== 0) return accDiff;
    return b.answered - a.answered;
  });
  const strongTheme = sortedByAcc[0] ?? null;
  // weakTheme : on prend le moins bon DIFFÉRENT du strongTheme (sinon avec un
  // seul thème éligible, on aurait strong === weak ce qui est absurde).
  const weakCandidate = sortedByAcc[sortedByAcc.length - 1];
  const weakTheme =
    weakCandidate && weakCandidate.id !== strongTheme?.id ? weakCandidate : null;

  // blindSpot : thème publié avec le plus de questions non touchées en valeur
  // absolue. Filtre les thèmes vides (rien à explorer). Privilégier la valeur
  // absolue plutôt que % car un thème "petit mais tout neuf" (5 questions,
  // 0 touchées) compte moins comme angle mort qu'un gros thème entamé à 10%.
  const blindSpot =
    byTheme
      .filter((r) => r.total > 0)
      .map((r) => ({ row: r, remaining: r.total - r.answered }))
      .sort((a, b) => b.remaining - a.remaining)[0]?.row ?? null;

  // Indicateurs sémantiques trans-thèmes : la lecture principale du
  // portrait depuis 2026-05-22. Capture des biais transversaux (précarité,
  // démocratie…) qui n'apparaîtraient pas dans une lecture par thème pur.
  // Cap à 5 entrées : au-delà la section devient illisible.
  const indicatorBiases = computeIndicatorBiases(progress, questions);

  return {
    strongTheme,
    weakTheme,
    blindSpot,
    indicatorBiases: indicatorBiases.slice(0, 5),
  };
}

/// Formate un YYYY-MM-DD en "11 mai 2026" (locale fr-FR).
export function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  // Construit à midi UTC pour éviter les surprises DST au passage en local.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}
