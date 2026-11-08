export const THEMES = [
  "Immigration",
  "Sécurité",
  "Économie",
  "Travail",
  "Climat",
  "Santé",
  "École",
  "Logement",
  "Institutions",
  "Services publics",
  "Égalités",
  "Numérique & IA",
  "International",
] as const;

/// Libellés alignés sur les noms vus par les joueurs ; `hint` dit ce que le
/// joueur fait (aide du formulaire).
export const FORMATS = [
  { value: "estimation_numerique", label: "Estimation", hint: "Le joueur place sa réponse sur un curseur, puis découvre la vraie valeur." },
  { value: "qcm", label: "QCM", hint: "Le joueur choisit une réponse parmi plusieurs (2 à 6)." },
  { value: "vrai_faux", label: "Vrai ou faux", hint: "Le joueur dit si une affirmation est vraie ou fausse." },
  { value: "ab", label: "A ou B", hint: "Le joueur choisit entre deux propositions." },
  { value: "classement", label: "Remettre dans l'ordre", hint: "Le joueur range des éléments dans le bon ordre." },
  { value: "vraifaux_multi", label: "Plusieurs vrai/faux", hint: "Le joueur juge 4 à 6 affirmations, chacune vraie ou fausse." },
  { value: "curseur_multi", label: "Placer sur une échelle", hint: "Le joueur place plusieurs étiquettes sur une même échelle graduée." },
  { value: "categorisation", label: "Classer dans des catégories", hint: "Le joueur range des étiquettes dans des cases." },
  { value: "pondere", label: "Répartir des points", hint: "Le joueur répartit un total de points entre des catégories." },
] as const;

export type FormatValue = (typeof FORMATS)[number]["value"];

/// `hint` : ce que le statut veut dire pour le joueur et pour l'équipe.
export const STATUTS = [
  { value: "brouillon", label: "Brouillon", color: "bg-zinc-200 text-zinc-700", hint: "En cours d'écriture. Invisible des joueurs." },
  { value: "revue", label: "En revue", color: "bg-amber-100 text-amber-800", hint: "Prête à être relue : elle entre dans la file « À valider ». Toujours invisible des joueurs." },
  { value: "publie", label: "Publié", color: "bg-emerald-100 text-emerald-800", hint: "Jouable par tous. Il faut qu'un relecteur ait validé la version actuelle." },
  { value: "retire", label: "Retiré", color: "bg-rose-100 text-rose-800", hint: "Retirée du jeu. Elle reste consultable ici." },
] as const;

/// Indication éditoriale, jamais montrée aux joueurs (cf. README, « Sensibilités »).
export const SENSIBILITES = [
  { value: "standard", label: "Standard", color: "bg-zinc-100 text-zinc-700", hint: "Sujet sans difficulté particulière." },
  { value: "haute", label: "Haute", color: "bg-amber-100 text-amber-800", hint: "Sujet délicat : relis les chiffres et les formulations avec soin." },
  { value: "critique", label: "Critique", color: "bg-rose-100 text-rose-800", hint: "Sujet polémique : demande plusieurs relectures dans la discussion avant de valider." },
] as const;

/// Difficulté 1 à 5. Libellés du player (DifficultyChip, format-shared.tsx).
export const DIFFICULTES = [
  { value: "1", label: "1 · Très facile" },
  { value: "2", label: "2 · Facile" },
  { value: "3", label: "3 · Moyen" },
  { value: "4", label: "4 · Difficile" },
  { value: "5", label: "5 · Très difficile" },
] as const;

export const SOURCE_TYPES = [
  { value: "primaire", label: "Source primaire" },
  { value: "triangulation", label: "Triangulation" },
] as const;

/// Taxonomie des indicateurs sémantiques transverses (cf.
/// player/src/lib/indicators.ts). Tagger 0 à 3 indicateurs par question
/// avec polarité ±1. La source de vérité reste player/src/lib/indicators.ts ;
/// on duplique ici ce qu'affiche le formulaire admin (constants.test.ts
/// vérifie que les deux copies concordent) :
///   - `subject` = `subjectShort` du player, inséré dans « Tu surestimes … »
///     du portrait ;
///   - `description` = `definitionPlus1`, ce qui compte sur cet axe.
export const INDICATORS = [
  {
    value: "precarite",
    label: "Précarité",
    subject: "la précarité des plus modestes",
    description:
      "Condition matérielle des plus modestes : pauvreté, mal-logement, désert médical, illettrisme, NEET, RSA, accidents au travail.",
  },
  {
    value: "inegalites",
    label: "Inégalités",
    subject: "les inégalités structurelles",
    description:
      "Écart entre haut et bas : Gini, héritage scolaire, parité H/F, ouvriers à l'Assemblée, écart de pensions, mobilité sociale.",
  },
  {
    value: "migration",
    label: "Migration",
    subject: "la présence de l'immigration",
    description:
      "Stocks et flux migratoires en France : % d'immigrés, demandeurs d'asile, naturalisations, OQTF, étudiants étrangers.",
  },
  {
    value: "insecurite",
    label: "Insécurité",
    subject: "les chiffres de la délinquance",
    description:
      "Faits de délinquance et violences : homicides, cambriolages, agressions, féminicides, violences sexuelles.",
  },
  {
    value: "climat",
    label: "Climat",
    subject: "la gravité de la crise climatique",
    description:
      "Empreinte carbone, biodiversité, transition énergétique : émissions, passoires thermiques, déclin des espèces, part des renouvelables.",
  },
  {
    value: "ecole",
    label: "École",
    subject: "les difficultés du système scolaire",
    description:
      "Performance et équité du système scolaire : chute PISA, décrochage, illettrisme, harcèlement, postes non pourvus.",
  },
  {
    value: "sante",
    label: "Santé",
    subject: "les tensions sur le système de santé",
    description:
      "Accès aux soins et fragilités du système : désert médical, lits supprimés, attente aux urgences, médecins manquants, ruptures de médicaments.",
  },
  {
    value: "democratie",
    label: "Démocratie",
    subject: "les fragilités démocratiques",
    description:
      "Confiance institutionnelle, représentativité, médias : abstention, défiance presse, corruption, concentration des médias, parité des élus.",
  },
  {
    value: "logement",
    label: "Logement",
    subject: "la tension sur le logement",
    description:
      "Marché immobilier et accès au logement : vacance, file HLM, mal-logés, prix au m², délais d'attribution, mises en chantier.",
  },
] as const;

export type IndicatorId = (typeof INDICATORS)[number]["value"];

/// Plafond éditorial à 3 indicateurs par question : au-delà, le signal se
/// dilue et la lecture du portrait devient confuse (cf. indicators.ts).
export const MAX_INDICATORS_PER_QUESTION = 3;
