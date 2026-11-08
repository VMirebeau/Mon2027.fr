/// Système de gamification — badges, niveaux, XP, missions du jour.
///
/// Toute la logique de ce module est pure : on dérive l'état de récompense
/// à partir d'un snapshot `Progress` (cf. lib/progress) et, pour les badges
/// qui en ont besoin, du catalogue de questions/thèmes publié.
///
/// Le déblocage de badges est asynchrone vis-à-vis de l'écriture : on ne
/// modifie pas Progress depuis ce fichier. C'est `GamificationWatcher`
/// (côté composant) qui appelle `evaluateBadges()` après chaque mutation
/// et écrit les nouveaux unlocks via `unlockBadges()` exposé par progress.ts.
///
/// Philosophie pédagogique du système, en accord avec l'éditorial :
/// les récompenses encouragent l'engagement (jouer régulièrement, explorer
/// les thèmes inconfortables, partager) sans transformer l'app en jeu à
/// score. Pas de classement compétitif entre utilisateurs ; on récompense
/// le geste, pas la performance brute.
///
/// XP est strictement dérivé du progress (pas stocké) : on évite ainsi tout
/// désalignement entre "ce que le user a fait" et "ce qu'on lui dit avoir
/// gagné". Si on change la formule plus tard, l'XP affiché s'ajuste
/// rétroactivement — c'est délibéré.

import type { Progress } from "./progress";

/// Projection minimale du catalogue suffisante pour évaluer tous les
/// badges. Sciemment plus léger que `Question[] + Theme[]` : on n'a besoin
/// que des comptes globaux et d'un index `id → theme` pour calculer le
/// nombre de thèmes touchés (badge polyglotte). Cette forme permet de
/// monter `GamificationProvider` au root layout sans payer le coût de
/// `loadPublishedQuestions()` (full mapping + sources) sur chaque route.
export type CatalogIndex = {
  /// Nombre total de questions publiées.
  totalQuestions: number;
  /// Nombre de thèmes du catalogue (cf. HOME_THEMES côté content.ts).
  totalThemes: number;
  /// Map `question.id → theme label`. Utilisé pour compter combien de
  /// thèmes distincts l'utilisateur a touchés via `progress.answers`.
  questionTheme: Readonly<Record<string, string>>;
};

// ============================================================================
// Catalogue : niveaux civiques
// ============================================================================

/// Échelle de niveau. Les noms évoquent le parcours d'un·e citoyen·ne qui
/// s'informe, sans hype gaming. Le rank 10 est l'horizon "militant éclairé"
/// — l'utilisateur cible final de l'app.
export type LevelDef = {
  rank: number;
  name: string;
  minXp: number;
};

export const LEVELS: LevelDef[] = [
  { rank: 1, name: "Citoyen·ne curieux·se", minXp: 0 },
  { rank: 2, name: "Lecteur·rice attentif·ve", minXp: 100 },
  { rank: 3, name: "Informé·e", minXp: 250 },
  { rank: 4, name: "Vérifié·e", minXp: 500 },
  { rank: 5, name: "Esprit critique", minXp: 900 },
  { rank: 6, name: "Sociologue amateur·rice", minXp: 1400 },
  { rank: 7, name: "Analyste citoyen·ne", minXp: 2000 },
  { rank: 8, name: "Argumentateur·rice", minXp: 2800 },
  { rank: 9, name: "Pédagogue", minXp: 3700 },
  { rank: 10, name: "Stratège militant·e", minXp: 5000 },
];

export type LevelInfo = {
  current: LevelDef;
  /// Le suivant (null si au plafond, cap rank 10).
  next: LevelDef | null;
  xp: number;
  /// XP nécessaire pour passer au rank+1 (0 quand au plafond).
  xpToNext: number;
  /// Progression dans le palier courant, 0..1 (1 quand au plafond).
  progressInLevel: number;
};

export function computeLevel(xp: number): LevelInfo {
  let current = LEVELS[0];
  let next: LevelDef | null = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] ?? null;
    } else {
      break;
    }
  }
  if (!next) {
    return { current, next: null, xp, xpToNext: 0, progressInLevel: 1 };
  }
  const span = next.minXp - current.minXp;
  const inLevel = xp - current.minXp;
  return {
    current,
    next,
    xp,
    xpToNext: Math.max(0, next.minXp - xp),
    progressInLevel: span > 0 ? Math.min(1, Math.max(0, inLevel / span)) : 0,
  };
}

// ============================================================================
// État dérivé partagé par les prédicats de badges
// ============================================================================

export type BadgeEvalState = {
  progress: Progress;
  /// Nombre total de questions publiées dans le catalogue courant.
  totalQuestions: number;
  /// Nombre de thèmes dans le catalogue.
  totalThemes: number;
  /// Stats globales user.
  answeredCount: number;
  /// Thèmes touchés (≥1 réponse).
  themesTouched: number;
  /// Snapshot des compteurs gamif (raccourcis).
  daysStreakMax: number;
  defisCreated: number;
  /// Nombre de réponses reçues par les destinataires des défis créés —
  /// source de vérité pour les badges Partage (cf. GamificationWatcher).
  defisPlayedByOthers: number;
  /// Nombre lifetime de défis reçus que l'utilisateur a joués (symétrique
  /// de defisPlayedByOthers, côté destinataire actif).
  defisReceivedPlayed: number;
  favoritesCount: number;
  todayPlayedCount: number;
};

export function buildEvalState(
  progress: Progress,
  catalog: CatalogIndex
): BadgeEvalState {
  const answeredIds = Object.keys(progress.answers);

  // Thèmes touchés (≥1 réponse). On lit le thème via l'index `questionTheme` ;
  // les réponses dont la question a été dépubliée (id absent de l'index)
  // sont ignorées — comportement délibéré pour ne pas figer un thème dans
  // le compteur d'un user après un retrait admin de sa dernière question.
  const themesSet = new Set<string>();
  for (const id of answeredIds) {
    const theme = catalog.questionTheme[id];
    if (theme) themesSet.add(theme);
  }

  return {
    progress,
    totalQuestions: catalog.totalQuestions,
    totalThemes: catalog.totalThemes,
    answeredCount: answeredIds.length,
    themesTouched: themesSet.size,
    daysStreakMax: progress.gamif.daysStreakMax,
    defisCreated: progress.gamif.defisCreated,
    defisPlayedByOthers: progress.gamif.defisPlayedByOthers,
    defisReceivedPlayed: progress.gamif.defisReceivedPlayed,
    favoritesCount: Object.keys(progress.favorites).length,
    todayPlayedCount: progress.gamif.todayPlayedCount,
  };
}

/// Helper : construit un `CatalogIndex` depuis les listes complètes
/// (Question[]-like + Theme[]-like). Utile pour les tests et pour les
/// callers qui ont déjà les listes en main. La fonction de production qui
/// charge l'index directement depuis la DB vit dans `content.ts >
/// loadCatalogIndex()`.
export function buildCatalogIndex(
  questions: ReadonlyArray<{ id: string; theme: string }>,
  themes: ReadonlyArray<unknown>
): CatalogIndex {
  const questionTheme: Record<string, string> = {};
  for (const q of questions) questionTheme[q.id] = q.theme;
  return {
    totalQuestions: questions.length,
    totalThemes: themes.length,
    questionTheme,
  };
}

// ============================================================================
// Catalogue : badges
// ============================================================================

/// Catégories de badges. Choix éditorial volontaire : pas de catégorie
/// "Maîtrise" (qui récompenserait la justesse pure). L'app pose comme
/// thèse qu'« on est tous trompés ensemble » — célébrer la précision
/// brute réinjecterait exactement la honte personnelle qu'on cherche à
/// désamorcer.
export type BadgeCategory =
  | "discovery"
  | "regularity"
  | "social"
  | "curation";

export const BADGE_CATEGORY_LABEL: Record<BadgeCategory, string> = {
  discovery: "Découverte",
  regularity: "Régularité",
  social: "Partage",
  curation: "Curation",
};

/// Tag visuel : type de pictogramme du badge (rendu côté UI par
/// BadgeIcon). Volontairement abstrait — pas d'emoji ou d'URL ici, l'UI
/// décide du rendu.
export type BadgeIconKind =
  | "spark"
  | "compass"
  | "library"
  | "globe"
  | "shuffle"
  | "target"
  | "trophy"
  | "fire"
  | "calendar"
  | "marathon"
  | "share"
  | "people"
  | "megaphone"
  | "user"
  | "star"
  | "bookmark"
  | "key"
  | "scale"
  | "owl";

export type BadgeDef = {
  id: string;
  label: string;
  /// Phrase courte décrivant comment l'obtenir, à afficher sous le badge.
  description: string;
  category: BadgeCategory;
  icon: BadgeIconKind;
  /// XP attribués au déblocage. Pondéré par rareté (50 standard, 100 rare,
  /// 200 légendaire). Multipliés par 1 — pas d'inflation à prévoir.
  xpReward: number;
  /// Prédicat de déblocage. Retourne true dès que conditions remplies.
  isUnlocked: (s: BadgeEvalState) => boolean;
};

/// Le catalogue est volontairement court (~15 entrées) et orienté
/// "engagement plutôt que performance". Choix éditoriaux :
///   - Pas de badge de justesse pure (precis 80% / expert 90% / etc.) :
///     ils transformeraient l'app en quiz à score et frapperaient pile sur
///     la honte de "ne pas savoir" — exactement ce qu'on cherche à neutraliser.
///   - Pas de badge "binge" type 15 questions en une journée ou 30 jours
///     d'affilée : on cherche un usage régulier, pas un farming.
///   - Catégorie Lucidité valorise reconnaître une erreur et atterrir dans
///     la moyenne — c'est la posture militante recherchée.
///
/// Tiers d'XP : 40 (acquis tôt), 80 (palier intermédiaire), 150 (rare).
/// Pas de palier au-dessus pour ne pas créer de "fin de jeu" mythique.
export const BADGES: BadgeDef[] = [
  // ───── Découverte ─────
  {
    id: "premier-pas",
    label: "Premier pas",
    description: "Réponds à ta première question.",
    category: "discovery",
    icon: "spark",
    xpReward: 40,
    isUnlocked: (s) => s.answeredCount >= 1,
  },
  {
    id: "curieux",
    label: "Curieux·se",
    description: "Réponds à 10 questions.",
    category: "discovery",
    icon: "compass",
    xpReward: 40,
    isUnlocked: (s) => s.answeredCount >= 10,
  },
  {
    id: "explorateur",
    label: "Explorateur·rice",
    description: "Réponds à 50 questions.",
    category: "discovery",
    icon: "compass",
    xpReward: 80,
    isUnlocked: (s) => s.answeredCount >= 50,
  },
  {
    id: "touche-a-tout",
    label: "Touche-à-tout",
    description: "Joue dans au moins 3 thèmes.",
    category: "discovery",
    icon: "shuffle",
    xpReward: 40,
    isUnlocked: (s) => s.themesTouched >= 3,
  },
  {
    id: "polyglotte",
    label: "Sur tous les fronts",
    description: "Joue dans tous les thèmes du catalogue, même ceux qui te dérangent.",
    category: "discovery",
    icon: "globe",
    xpReward: 150,
    isUnlocked: (s) => s.totalThemes > 0 && s.themesTouched >= s.totalThemes,
  },

  // ───── Régularité ─────
  {
    id: "habitue",
    label: "Habitué·e",
    description: "Joue 3 jours d'affilée.",
    category: "regularity",
    icon: "calendar",
    xpReward: 40,
    isUnlocked: (s) => s.daysStreakMax >= 3,
  },
  {
    id: "fidele",
    label: "Fidèle au poste",
    description: "Joue 7 jours d'affilée.",
    category: "regularity",
    icon: "calendar",
    xpReward: 80,
    isUnlocked: (s) => s.daysStreakMax >= 7,
  },
  {
    id: "inebranlable",
    label: "Inébranlable",
    description: "Joue 14 jours d'affilée.",
    category: "regularity",
    icon: "calendar",
    xpReward: 150,
    isUnlocked: (s) => s.daysStreakMax >= 14,
  },

  // ───── Partage ─────
  // Distinction éditoriale clé : on garde 'premier-defi' (signal "j'ai
  // tenté") au seuil bas, mais les paliers de partage massif sont indexés
  // sur le nombre de RÉPONSES reçues — pas sur les défis créés. Créer un
  // défi est trivial ; recevoir une réponse signale qu'une conversation a
  // eu lieu, ce qui est l'objectif réel de l'app (cf. Broockman & Kalla
  // 2016 : la persuasion passe par les conversations interpersonnelles).
  {
    id: "premier-defi",
    label: "Premier défi",
    description: "Crée un défi pour un proche.",
    category: "social",
    icon: "share",
    xpReward: 40,
    isUnlocked: (s) => s.defisCreated >= 1,
  },
  {
    id: "premier-rebond",
    label: "Premier rebond",
    description:
      "Un destinataire a joué l'un de tes défis : une conversation s'est lancée.",
    category: "social",
    icon: "share",
    xpReward: 60,
    isUnlocked: (s) => s.defisPlayedByOthers >= 1,
  },
  {
    id: "ambassadeur",
    label: "Ambassadeur·rice",
    description: "Tes défis ont reçu 5 réponses en tout.",
    category: "social",
    icon: "people",
    xpReward: 100,
    isUnlocked: (s) => s.defisPlayedByOthers >= 5,
  },
  {
    id: "bouche-a-oreille",
    label: "Bouche-à-oreille",
    description: "Tes défis ont reçu 15 réponses en tout.",
    category: "social",
    icon: "megaphone",
    xpReward: 200,
    isUnlocked: (s) => s.defisPlayedByOthers >= 15,
  },
  // Côté "destinataire actif" : symétrique des badges émission (premier-
  // rebond / ambassadeur). On veut récompenser la viralité dans les deux
  // sens — quelqu'un qui joue des défis reçus participe à la dynamique
  // militante autant que celui qui en envoie.
  {
    id: "premier-repondu",
    label: "Premier répondu",
    description: "Joue un défi qu'un·e proche t'a envoyé.",
    category: "social",
    icon: "people",
    xpReward: 40,
    isUnlocked: (s) => s.defisReceivedPlayed >= 1,
  },
  {
    id: "cercle-militant",
    label: "Cercle militant",
    description:
      "Joue 5 défis reçus : il y a une communauté qui pousse autour de toi.",
    category: "social",
    icon: "people",
    xpReward: 100,
    isUnlocked: (s) => s.defisReceivedPlayed >= 5,
  },
  {
    id: "reseau-militant",
    label: "Réseau militant",
    description:
      "Joue 15 défis reçus : tu es au cœur d'un réseau d'échange régulier.",
    category: "social",
    icon: "megaphone",
    xpReward: 200,
    isUnlocked: (s) => s.defisReceivedPlayed >= 15,
  },
  {
    id: "connecte",
    label: "Synchronisé·e",
    description: "Crée un compte pour synchroniser tes données.",
    category: "social",
    icon: "user",
    xpReward: 40,
    isUnlocked: (s) => s.progress.identity.pseudo !== null,
  },

  // ───── Curation ─────
  {
    id: "collector",
    label: "Collectionneur·se",
    description: "Marque 10 questions en favori pour y revenir.",
    category: "curation",
    icon: "bookmark",
    xpReward: 40,
    isUnlocked: (s) => s.favoritesCount >= 10,
  },
];

export const BADGE_BY_ID: Map<string, BadgeDef> = new Map(
  BADGES.map((b) => [b.id, b])
);

// ============================================================================
// Évaluation : retourne la liste d'IDs débloqués selon l'état courant
// ============================================================================

/// Filtre le catalogue : ne renvoie que les badges actuellement vérifiés.
/// L'appelant compare ensuite avec `progress.badges` pour identifier les
/// nouveaux. Pure fonction, sans side-effect ; ré-exécution OK à chaque
/// render React (cf. GamificationWatcher).
export function evaluateUnlockedBadges(state: BadgeEvalState): string[] {
  const unlocked: string[] = [];
  for (const b of BADGES) {
    if (b.isUnlocked(state)) unlocked.push(b.id);
  }
  return unlocked;
}

/// Renvoie les IDs débloqués mais pas encore présents dans Progress —
/// raccourci pour le watcher.
export function findNewBadgeUnlocks(
  progress: Progress,
  catalog: CatalogIndex
): string[] {
  const state = buildEvalState(progress, catalog);
  const all = evaluateUnlockedBadges(state);
  const out: string[] = [];
  for (const id of all) {
    if (!progress.badges[id]) out.push(id);
  }
  return out;
}

// ============================================================================
// XP
// ============================================================================

/// Calcule l'XP cumulé d'un user à partir de son progress + du catalogue.
/// La formule est volontairement simple et lisible :
///   - +10 par bonne réponse, +3 par mauvaise (on récompense aussi la
///     tentative — le ratio reste 3:1 en faveur des bonnes pour conserver
///     un signal de progression)
///   - +5 par jour de série historique (daysStreakMax)
///   - +20 par défi créé
///   - +2 par question favorite
///   - +xpReward par badge débloqué
///
/// Tout est déterministe — réexécuter sur le même progress donne le même
/// nombre. Si on ajuste la formule, l'XP affiché change rétroactivement
/// (c'est délibéré pour éviter le décalage perçu/réel).
export function computeXp(progress: Progress): number {
  let xp = 0;
  for (const a of Object.values(progress.answers)) {
    xp += a.correct ? 10 : 3;
  }
  xp += progress.gamif.daysStreakMax * 5;
  xp += progress.gamif.defisCreated * 20;
  xp += Object.keys(progress.favorites).length * 2;
  for (const id of Object.keys(progress.badges)) {
    const def = BADGE_BY_ID.get(id);
    if (def) xp += def.xpReward;
  }
  return xp;
}

// ============================================================================
// Missions du jour
// ============================================================================

/// Une mission est une cible journalière. On en propose trois paliers qui
/// se déclenchent en cascade : jouer 1 → 3 → 7 questions dans la journée.
/// Pas de stockage : on lit `gamif.todayPlayedCount` et on compare aux
/// seuils. La cible "défi du jour" reste hors scope pour l'instant.
export type DailyMission = {
  id: string;
  label: string;
  goal: number;
  /// Récompense XP indicative (non décomptée — le système XP est dérivé,
  /// les XP arrivent naturellement via les bonnes réponses et badges).
  xpHint: number;
};

export const DAILY_MISSIONS: DailyMission[] = [
  { id: "daily-1", label: "Joue 1 question aujourd'hui", goal: 1, xpHint: 10 },
  { id: "daily-3", label: "Joue 3 questions aujourd'hui", goal: 3, xpHint: 30 },
  { id: "daily-7", label: "Joue 7 questions aujourd'hui", goal: 7, xpHint: 70 },
];

export type DailyMissionProgress = {
  mission: DailyMission;
  current: number;
  done: boolean;
};

export function computeDailyMissions(
  progress: Progress,
  todayKey: string
): DailyMissionProgress[] {
  // Si le `todayPlayedDay` ne correspond pas à aujourd'hui (changement de
  // jour pas encore enregistré côté local), on considère 0.
  const cur =
    progress.gamif.todayPlayedDay === todayKey
      ? progress.gamif.todayPlayedCount
      : 0;
  return DAILY_MISSIONS.map((m) => ({
    mission: m,
    current: Math.min(cur, m.goal),
    done: cur >= m.goal,
  }));
}

// ============================================================================
// Helpers d'agrégation pour l'UI
// ============================================================================

export type BadgeView = {
  def: BadgeDef;
  unlocked: boolean;
  unlockedAt: number | null;
};

/// Retourne TOUS les badges, classés par catégorie, avec leur état.
/// Utilisé par la page Récompenses.
export function listAllBadges(progress: Progress): BadgeView[] {
  return BADGES.map((def) => {
    const rec = progress.badges[def.id];
    return {
      def,
      unlocked: !!rec,
      unlockedAt: rec?.unlockedAt ?? null,
    };
  });
}

/// Compte les badges débloqués / total du catalogue (filtre les IDs orphelins
/// dans progress.badges qui ne sont plus au catalogue).
export function countBadges(progress: Progress): {
  unlocked: number;
  total: number;
} {
  let unlocked = 0;
  for (const id of Object.keys(progress.badges)) {
    if (BADGE_BY_ID.has(id)) unlocked++;
  }
  return { unlocked, total: BADGES.length };
}

/// Liste les IDs des badges débloqués mais pas encore vus par l'utilisateur
/// (toast pas dismissed). Utilisé par BadgeToastQueue côté UI.
export function listUnseenBadges(progress: Progress): string[] {
  const out: string[] = [];
  for (const [id, rec] of Object.entries(progress.badges)) {
    if (rec.seen) continue;
    if (!BADGE_BY_ID.has(id)) continue;
    out.push(id);
  }
  return out;
}
