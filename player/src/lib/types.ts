export type Source = {
  name: string;
  url: string;
  tag: "Source primaire" | "Triangulation";
};

export type AbChoice = {
  label: string;
  valeur?: number;
  note?: string;
};

export type EstimationQuestion = {
  id: string;
  theme: string;
  format: "estimation";
  question: string;
  precisions?: string;
  range: [number, number];
  step: number;
  answer: number;
  unit: string;
  unitShort?: string;
  avgUser: number;
  /** Écart max pour être "très proche" (verdict vert). Maps DB `toleranceVerte`. */
  closeWithin: number;
  /** Écart max pour être "pas mal" (verdict orange). Au-delà = "loin" (rouge).
   *  Maps DB `toleranceOrange`. */
  midWithin: number;
  pctClose: number;
  pctOff: number;
  why: string;
  explain: string;
  sources: Source[];
};

export type AbQuestion = {
  id: string;
  theme: string;
  format: "ab";
  question: string;
  precisions?: string;
  choices: [AbChoice, AbChoice];
  correctIndex: 0 | 1;
  unite?: string;
  avgUserText: string;
  pctClose: number;
  pctOff: number;
  why: string;
  explain: string;
  sources: Source[];
};

export type VraiFauxQuestion = {
  id: string;
  theme: string;
  format: "vraifaux";
  question: string;
  precisions?: string;
  correctAnswer: boolean;
  avgUserText: string;
  pctClose: number;
  pctOff: number;
  why: string;
  explain: string;
  sources: Source[];
};

export type QcmQuestion = {
  id: string;
  theme: string;
  format: "qcm";
  question: string;
  precisions?: string;
  choices: string[];
  correctIndex: number;
  avgUserText: string;
  pctClose: number;
  pctOff: number;
  why: string;
  explain: string;
  sources: Source[];
};

export type ClassementItem = { id: string; label: string; figure?: string };
export type ClassementQuestion = {
  id: string;
  theme: string;
  format: "classement";
  question: string;
  precisions?: string;
  items: ClassementItem[];
  correctOrder: string[];
  why: string;
  explain: string;
  sources: Source[];
};

export type VFMultiStatement = {
  id: string;
  text: string;
  correct: boolean;
  why?: string;
};
export type VraiFauxMultiQuestion = {
  id: string;
  theme: string;
  format: "vraifaux_multi";
  question: string;
  precisions?: string;
  statements: VFMultiStatement[];
  why: string;
  explain: string;
  sources: Source[];
};

export type CurseurMultiItem = {
  id: string;
  label: string;
  real: number;
  color?: string;
};
export type CurseurMultiQuestion = {
  id: string;
  theme: string;
  format: "curseur_multi";
  question: string;
  precisions?: string;
  range: [number, number];
  unit?: string;
  labelMin?: string;
  labelMax?: string;
  items: CurseurMultiItem[];
  why: string;
  explain: string;
  sources: Source[];
};

export type CatBin = { id: string; label: string };
export type CatItem = {
  id: string;
  label: string;
  correct: string;
  note?: string;
};
export type CategorisationQuestion = {
  id: string;
  theme: string;
  format: "categorisation";
  question: string;
  precisions?: string;
  bins: CatBin[];
  items: CatItem[];
  why: string;
  explain: string;
  sources: Source[];
};

export type PondereCategory = {
  id: string;
  label: string;
  real: number;
  color?: string;
};
export type PondereQuestion = {
  id: string;
  theme: string;
  format: "pondere";
  question: string;
  precisions?: string;
  pool: number;
  step: number;
  categories: PondereCategory[];
  why: string;
  explain: string;
  sources: Source[];
};

/// Union des variantes par format. La structure de chaque variante est
/// portée par son propre type (cf. EstimationQuestion etc.).
type QuestionVariant =
  | EstimationQuestion
  | AbQuestion
  | VraiFauxQuestion
  | QcmQuestion
  | ClassementQuestion
  | VraiFauxMultiQuestion
  | CurseurMultiQuestion
  | CategorisationQuestion
  | PondereQuestion;

/// Métadonnées transverses ajoutées à la variante (purement additif, pas
/// de logique de jeu). Permet d'enrichir Question sans toucher chaque
/// variante individuelle.
type QuestionMeta = {
  /// Slug court d'URL publique (`/q/[slug]`). Optional : quand absent,
  /// le player tombe sur un slug auto-généré depuis le texte de la question
  /// (cf. lib/question-slug). Stocké en DB sur Question.slug.
  slug?: string;
  /// Difficulté 1..5. Surfacée pour permettre :
  ///   - le picking pondéré par niveau gamification (débutants → ★1-2)
  ///   - l'affichage discret d'une étoile sur les rows Réviser / Favoris
  ///   - de futurs filtres "facile/normal/expert"
  /// Source : DB Question.difficulte (cf. prisma/schema.prisma). Optionnelle
  /// dans le type parce que les demos de la dev-scene (cf. useDevDemos)
  /// arrivent typés sur la variante pure (sans QuestionMeta) — runtime,
  /// elles ont toujours difficulte (filtrées depuis loadPublishedQuestions).
  difficulte?: number;
  /// "Mise en perspective" : 1 à 3 phrases courtes qui contextualisent le
  /// chiffre dans le temps (évolution), l'espace (vs autres pays) ou la
  /// trajectoire (en hausse / stable / en baisse). Optionnelle — affichée
  /// dans le dossier après le verdict si présente, sinon le dossier reste
  /// au format "explication + sources" historique.
  /// Source : DB Question.miseEnPerspective. Rationale produit : passer
  /// d'une donnée brute ("47 %") à une compréhension structurelle ("47 %,
  /// soit ×2 depuis 1990 et 10 pts au-dessus de la moyenne UE").
  miseEnPerspective?: string;
  /// Indicateurs sémantiques transverses : tableau de paires (id, polarité)
  /// indiquant sur quels axes du portrait civique cette question pèse.
  /// Cf. lib/indicators.ts pour la taxonomie. Stocké en DB en JSON
  /// sérialisé sur `Question.indicators`, parsé via parseQuestionIndicators.
  /// Remplace les anciens `biaisDirection` / `biaisErreur` (mono-axe par
  /// thème), retirés du code application 2026-05-22.
  indicators?: import("./indicators").QuestionIndicator[];
  /// Vrai quand le dossier (why, explain, miseEnPerspective, sources) a été
  /// retiré de l'objet pour alléger la page d'accueil : les écrans qui
  /// l'affichent passent par `useQuestionDossier(q)`, qui le charge à part
  /// (cf. lib/question-dossier.ts). Absent = objet complet.
  dossierDeferred?: true;
};

export type Question = QuestionVariant & QuestionMeta;

// Answer encoding:
// - estimation: number
// - ab: 0 | 1
// - vraifaux: boolean
// - qcm: number (the chosen index)
// - classement: string[] (user's ordering, item ids)
// - vraifaux_multi: Record<string, boolean> (per statement id)
// - curseur_multi: Record<string, number> (per item id)
// - categorisation: Record<string, string> (item id -> bin id)
// - pondere: Record<string, number> (category id -> points)
export type Answer =
  | number
  | boolean
  | string[]
  | Record<string, boolean | number | string>
  | null;

export type Theme = {
  id: string;
  label: string;
  color: string;
  count: number;
  /// Questions de ce thème déjà répondues localement. Enrichi côté
  /// client par app-shell (à partir de useProgress) — absent côté
  /// serveur ; les consommateurs doivent traiter undefined comme 0.
  answered?: number;
};

export type SceneId =
  | "onboarding"
  | "home"
  | "game"
  | "q-estim"
  | "q-tf"
  | "q-ab"
  | "q-qcm"
  | "q-classement"
  | "q-vftf-multi"
  | "q-curseur-multi"
  | "q-cat"
  | "q-pondere"
  | "recap"
  | "challenge"
  | "themes"
  | "review"
  | "favorites"
  | "account"
  | "profile"
  | "stats"
  | "rewards"
  | "defis-history"
  | "methode"
  | "apropos";

/// Cibles de navigation top-level utilisées par l'AppNav unifié.
/// - "home"     : retour à l'accueil (clic logo)
/// - "daily"    : lance la question du jour
/// - "themes"   : page de découverte (acceptée comme cible de "Découvrir"
///                tant que l'écran dédié n'existe pas)
/// - "review"   : mode Réviser — placeholder, route vers themes pour
///                l'instant (cf. project-menu-architecture)
/// - "challenge": création d'un défi
/// - "favorites": page des favoris
/// - "account"  : page "Mon compte" (login/signup/profil) — anciennement
///                AccountModal, maintenant scène plein écran pour rester
///                cohérent avec le reste de l'app.
/// - "stats"    : page "Mes stats" (progression, justesse, séries)
/// - "rewards"  : page "Mes récompenses" (badges, niveau, missions du jour)
/// - "methode"  : page Méthode
/// - "apropos"  : page À propos
export type NavTarget =
  | "home"
  | "daily"
  | "themes"
  | "review"
  | "challenge"
  | "favorites"
  | "account"
  | "profile"
  | "stats"
  | "rewards"
  | "defis-history"
  | "methode"
  | "apropos";
