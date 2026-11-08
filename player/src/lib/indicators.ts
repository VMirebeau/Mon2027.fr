/// Taxonomie des indicateurs sémantiques transverses du portrait civique.
///
/// Pourquoi un système d'indicateurs ?
/// Avant, le biais d'estimation était calculé PAR THÈME : "tu surestimes
/// École" / "tu sous-estimes Économie". Limitation majeure : un thème
/// regroupe des questions hétérogènes (École contient PISA, harcèlement,
/// protection ASE), et "surestimer École" ne dit rien de concret.
///
/// Avec les indicateurs :
///   1. Chaque question pèse sur 0 à 3 indicateurs, indépendamment de son
///      thème (la question "% mal-logés" peut peser sur Précarité ET
///      Crise du logement).
///   2. L'agrégation produit un score par indicateur trans-thèmes — beaucoup
///      plus signifiant ("tu surestimes la précarité, signal présent sur 4
///      thèmes") qu'une lecture isolée.
///   3. Les indicateurs sont définis en termes neutres et descriptifs
///      (pas "tu vois trop X" mais "tu surestimes l'intensité du
///      phénomène X").
///
/// Règle pour ajouter un indicateur :
///   - Doit capturer une dimension distincte (orthogonale aux autres)
///   - Doit avoir ≥ 10 questions taggées pour produire un signal stable
///   - Doit être lisible politiquement neutre (pas "Poids de l'État")
///   - Son `subjectShort` doit fonctionner en "tu surestimes [subjectShort]"

export type IndicatorId =
  | "precarite"
  | "inegalites"
  | "migration"
  | "insecurite"
  | "climat"
  | "ecole"
  | "sante"
  | "democratie"
  | "logement";

export type IndicatorMeta = {
  id: IndicatorId;
  /// Libellé court pour les en-têtes UI : "Précarité", "Inégalités"…
  label: string;
  /// Fragment à insérer dans "Tu surestimes [subject]" — toujours au
  /// féminin/avec article défini ("la précarité", "les inégalités").
  subjectShort: string;
  /// Définition précise de ce qui compte comme "+1" pour cet indicateur.
  /// Sert d'oracle pour valider les tags lors de la curation.
  definitionPlus1: string;
};

export const INDICATORS: Record<IndicatorId, IndicatorMeta> = {
  precarite: {
    id: "precarite",
    label: "Précarité",
    subjectShort: "la précarité des plus modestes",
    definitionPlus1:
      "Condition matérielle des plus modestes : pauvreté, mal-logement, désert médical, illettrisme, NEET, RSA, accidents au travail.",
  },
  inegalites: {
    id: "inegalites",
    label: "Inégalités",
    subjectShort: "les inégalités structurelles",
    definitionPlus1:
      "Écart entre haut et bas : Gini, héritage scolaire, parité H/F, ouvriers à l'Assemblée, écart de pensions, mobilité sociale.",
  },
  migration: {
    id: "migration",
    label: "Migration",
    subjectShort: "la présence de l'immigration",
    definitionPlus1:
      "Stocks et flux migratoires en France : % d'immigrés, demandeurs d'asile, naturalisations, OQTF, étudiants étrangers.",
  },
  insecurite: {
    id: "insecurite",
    label: "Insécurité",
    subjectShort: "les chiffres de la délinquance",
    definitionPlus1:
      "Faits de délinquance et violences : homicides, cambriolages, agressions, féminicides, violences sexuelles.",
  },
  climat: {
    id: "climat",
    label: "Climat",
    subjectShort: "la gravité de la crise climatique",
    definitionPlus1:
      "Empreinte carbone, biodiversité, transition énergétique : émissions, passoires thermiques, déclin des espèces, part des renouvelables.",
  },
  ecole: {
    id: "ecole",
    label: "École",
    subjectShort: "les difficultés du système scolaire",
    definitionPlus1:
      "Performance et équité du système scolaire : chute PISA, décrochage, illettrisme, harcèlement, postes non pourvus.",
  },
  sante: {
    id: "sante",
    label: "Santé",
    subjectShort: "les tensions sur le système de santé",
    definitionPlus1:
      "Accès aux soins et fragilités du système : désert médical, lits supprimés, attente aux urgences, médecins manquants, ruptures de médicaments.",
  },
  democratie: {
    id: "democratie",
    label: "Démocratie",
    subjectShort: "les fragilités démocratiques",
    definitionPlus1:
      "Confiance institutionnelle, représentativité, médias : abstention, défiance presse, corruption, concentration des médias, parité des élus.",
  },
  logement: {
    id: "logement",
    label: "Logement",
    subjectShort: "la tension sur le logement",
    definitionPlus1:
      "Marché immobilier et accès au logement : vacance, file HLM, mal-logés, prix au m², délais d'attribution, mises en chantier.",
  },
};

/// Liste ordonnée des IDs — sert au tagging (l'agent doit choisir parmi
/// ces IDs exacts) et au tri d'affichage par défaut.
export const INDICATOR_IDS: IndicatorId[] = [
  "precarite",
  "inegalites",
  "migration",
  "insecurite",
  "climat",
  "ecole",
  "sante",
  "democratie",
  "logement",
];

/// Garde de validation pour parser des IDs venant de la DB (JSON).
export function isIndicatorId(s: unknown): s is IndicatorId {
  return typeof s === "string" && (INDICATOR_IDS as string[]).includes(s);
}

/// Format de stockage en DB (champ `Question.indicators`, JSON sérialisé) :
/// tableau de paires `{ id: IndicatorId, polarity: 1 | -1 }`. Une question
/// peut peser sur 0 à 3 indicateurs. Polarity = +1 si une valeur élevée
/// (estimation) ou une erreur (V/F/A/B/QCM) signe "+ d'intensité du
/// phénomène mesuré par l'indicateur". Mêmes règles que les anciens
/// biaisDirection/biaisErreur, mais multi-indicateurs.
export type QuestionIndicator = {
  id: IndicatorId;
  polarity: 1 | -1;
};

/// Parse + valide le champ JSON `Question.indicators`. Tolère les entrées
/// corrompues : on filtre silencieusement plutôt que de crasher la page.
/// Cap à 3 indicateurs par question : au-delà la lecture devient confuse
/// et on dilue le signal de chaque indicateur.
export function parseQuestionIndicators(
  json: string | null | undefined,
): QuestionIndicator[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: QuestionIndicator[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { id?: unknown }).id;
      const pol = (item as { polarity?: unknown }).polarity;
      if (!isIndicatorId(id)) continue;
      if (pol !== 1 && pol !== -1) continue;
      out.push({ id, polarity: pol });
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}
