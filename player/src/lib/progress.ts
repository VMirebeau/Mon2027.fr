// Persistance locale de l'état utilisateur.
// Source de vérité : localStorage clé "mon2027:progress".
// Structure versionnée pour permettre des migrations futures.
//
// Toute mutation passe par les helpers de ce fichier (pas d'écriture
// directe ailleurs) pour garder la sérialisation/désérialisation
// centralisée et l'invariant de version respecté.

export const PROGRESS_KEY = "mon2027:progress";
/// Version du schéma local. Tout snapshot dont la version ne matche pas
/// `PROGRESS_VERSION` est wipé à `DEFAULT_PROGRESS` au prochain mount —
/// pas de migration douce. C'est l'outil utilisé pour invalider tous les
/// clients en bloc quand la base de connaissances est refondue (ex.
/// 2026-05-21 : rééquilibrage formats + re-notation difficulté → certains
/// customId ont disparu, certains ont changé de format, les `answers`
/// stockées localement référencent des questions qui n'existent plus en
/// DB ou ne sont plus du bon format). Bumper cette constante après
/// chaque refonte majeure du contenu.
///
/// v1 = initial
/// v2 = ajout badges + gamif
/// v3 = wipe forcé suite à la refonte base de connaissances (2026-05-21)
export const PROGRESS_VERSION = 3;

/// Valeur stockée pour une réponse joueur, telle qu'écrite côté client dans
/// le snapshot localStorage. Couvre tous les formats :
///   - `number` pour estimation et A/B (l'index 0/1)
///   - `boolean` pour vrai/faux
///   - `number` pour qcm (index du choix)
///   - `string[]` pour classement (ordre des item ids)
///   - `Record<string, ...>` pour vraifaux_multi (id → boolean),
///     curseur_multi (id → number), categorisation (id → binId string),
///     pondere (id → allocation number)
///   - `null` quand la question est skippée / non répondue
///
/// Avant ce typage, AnswerValue était limité à `number | boolean | 0 | 1` et
/// tous les composite formats étaient stockés via `as` cast — la valeur
/// arrivait correctement à l'écran mais aucun consommateur ne pouvait la
/// relire de manière typée. Désormais le type décrit ce qui est réellement
/// stocké.
/// Note typage : on stocke un Record<string, boolean | number | string>
/// (union de valeurs) plutôt que l'union de trois Records distincts, parce
/// que TS ne sait pas auto-narrower entre Record<string, boolean> et
/// Record<string, number> sans guard runtime. La lecture côté composant
/// downcast par format (coerce-answer fournit asRecordBoolean etc.).
export type AnswerValue =
  | number
  | boolean
  | string[]
  | Record<string, boolean | number | string>
  | null;

/// État de répétition espacée pour une question. Recalculé à chaque
/// nouvelle réponse à la même question, via `srsNext()`. Optionnel sur
/// AnswerRecord : les anciennes réponses (avant ajout du système SRS) ont
/// `srs` undefined → la lecture les traite comme "dues immédiatement si
/// fausses, plus jamais sinon" (comportement legacy) jusqu'au prochain
/// passage de la question.
export type SrsState = {
  /// 0 = juste fauté, ré-incrémenté à chaque bonne réponse, reset à 0 sur
  /// faute. Sert d'index dans le ladder d'intervalles SRS_INTERVALS_DAYS.
  consecutiveCorrect: number;
  /// Intervalle courant en jours (snapshot pour debug / introspection).
  /// Redondant avec `nextDueAt - ts` mais évite à la lecture de refaire
  /// le calcul.
  intervalDays: number;
  /// Epoch ms à partir duquel la question sera dûe à la révision.
  nextDueAt: number;
};

export type AnswerRecord = {
  value: AnswerValue;
  correct: boolean;
  /// epoch ms
  ts: number;
  /// Optionnel : présent dès qu'une réponse a été enregistrée via le système
  /// SRS. Pour les réponses legacy (sans srs), la révision retombe sur "ré-à
  /// faire si faux" sans cadence.
  srs?: SrsState;
};

/// Échelle d'intervalles SM-2 simplifiée, en jours. Index = nombre de bonnes
/// réponses consécutives. Au-delà, on plafonne au dernier intervalle (180
/// jours = ~6 mois — au-delà l'utilité retombe sur "tu connais, point").
///   0 bonnes : 1 jour
///   1 bonne  : 3 jours
///   2 bonnes : 7 jours
///   3 bonnes : 21 jours
///   4 bonnes : 60 jours
///   5 bonnes+: 180 jours
/// Ladder serré au début (l'oubli est exponentiel sur les premières
/// répétitions), espacé ensuite (une fois ancré, l'oubli ralentit).
const SRS_INTERVALS_DAYS = [1, 3, 7, 21, 60, 180];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/// Calcule l'état SRS suivant à partir de l'état précédent et du résultat
/// de la nouvelle réponse. Pur — pas de side-effect, prend explicitement
/// le `now` pour faciliter les tests.
///
/// Cas faute : on reset le compteur consécutif et on plante l'intervalle à
/// 1 jour. La question revient demain — l'apprentissage repart de zéro mais
/// pas trop douloureusement (on évite "5 fois aujourd'hui").
export function srsNext(
  prev: SrsState | undefined,
  isCorrect: boolean,
  now: number,
): SrsState {
  if (!isCorrect) {
    return {
      consecutiveCorrect: 0,
      intervalDays: SRS_INTERVALS_DAYS[0],
      nextDueAt: now + SRS_INTERVALS_DAYS[0] * MS_PER_DAY,
    };
  }
  const prevConsec = prev?.consecutiveCorrect ?? 0;
  const newConsec = prevConsec + 1;
  const idx = Math.min(newConsec, SRS_INTERVALS_DAYS.length - 1);
  const intervalDays = SRS_INTERVALS_DAYS[idx];
  return {
    consecutiveCorrect: newConsec,
    intervalDays,
    nextDueAt: now + intervalDays * MS_PER_DAY,
  };
}

/// Helper : une question avec ce record est-elle dûe à la révision maintenant ?
///   1. Réponse fausse → dûe tout de suite (à rattraper), comme dans Réviser
///      (cf. review-buckets) — les deux compteurs doivent concorder.
///   2. Réponse juste avec SRS → dûe quand nextDueAt est passé.
///   3. Réponse juste sans SRS (legacy) → pas dûe.
export function isDue(record: AnswerRecord, now: number = Date.now()): boolean {
  if (!record.correct) return true;
  if (record.srs) return record.srs.nextDueAt <= now;
  return false;
}

export type Streak = {
  /// Nombre de jours consécutifs où l'utilisateur a joué au moins
  /// une question, en comptant aujourd'hui s'il a joué.
  days: number;
  /// YYYY-MM-DD du dernier jour joué (Europe/Paris).
  lastPlayedDay: string | null;
};

export type Prefs = {
  /// id du Theme préféré (cf. lib/types.ts Theme)
  favoriteTheme: string | null;
  /// quick = 5 questions mélangées, marathon = toutes, daily = question du jour
  favoriteMode: "daily" | "quick" | "marathon" | null;
};

export type Identity = {
  /// Pseudo affiché dans les défis et dans la greeting de la home.
  /// Optionnel : tant qu'il n'est pas posé, la home affiche "Bonjour !".
  pseudo: string | null;
};

export type SentChallenge = {
  id: string;
  createdAt: number;
  questionIds: string[];
  score: number;
};

export type ReceivedChallenge = {
  /// shortCode du défi.
  id: string;
  /// Pseudo du militant qui a créé le défi (snapshot).
  from: string;
  /// Epoch ms du moment où l'utilisateur a joué le défi. Sert au tri
  /// "plus récent d'abord" dans la liste des défis reçus.
  createdAt: number;
  /// IDs des questions du défi (= défi.questionIds parsé).
  questionIds: string[];
  /// Score du créateur sur ses propres questions (snapshot defi.creatorScore).
  opponentScore: number;
  /// Score de l'utilisateur sur ce défi. null = pas encore joué (placeholder
  /// pour de futurs flows ; aujourd'hui on n'insère qu'après submit donc
  /// jamais null en pratique).
  myScore: number | null;
  // ─── Métadonnées d'affichage (snapshot au moment du jeu) ───
  // Toutes optionnelles pour rétro-compat avec les anciens snapshots qui
  // n'avaient pas ces champs. Les chemins de lecture (ReceivedDefisList,
  // page Voir plus) dégradent proprement si absentes.
  /// Label thématique calculé ("Économie", "Questions diverses").
  themeLabel?: string;
  /// Slug HOME_THEMES.id pour la couleur de pastille. null = mixte.
  themeId?: string | null;
  /// Titre libre éventuel donné par le militant ("Pour ma sœur sceptique…").
  title?: string | null;
  /// Rang de niveau du créateur (1..10) au moment de la création du défi.
  creatorLevelRank?: number | null;
  /// Nombre total de questions du défi (= questionIds.length, dénormalisé
  /// pour ne pas le recalculer à chaque render UI).
  total?: number;
};

export type Challenges = {
  sent: SentChallenge[];
  received: ReceivedChallenge[];
};

/// Question bookmarkée — clé = questionId, valeur = ce record.
/// Pas de payload riche pour l'instant (juste l'horodatage) : si on veut
/// stocker des notes perso ou des tags plus tard, on étend ici.
export type FavoriteRecord = {
  /// epoch ms
  addedAt: number;
};

/// Badge débloqué — clé = badge id (cf. lib/gamification.ts).
/// `seen` passe à true quand l'utilisateur a vu la toast de célébration ;
/// les badges seen=false sont consommés par le système de toast au mount.
export type BadgeRecord = {
  /// epoch ms du déblocage
  unlockedAt: number;
  seen: boolean;
};

/// Compteurs gamification persistés. La plupart des stats sont dérivables
/// du reste de Progress (answers / streak), mais quelques-unes nécessitent
/// un état explicite parce qu'elles tracent des séries au-delà de l'état
/// courant : la plus longue série de bonnes réponses jamais atteinte, ou
/// la plus longue série de jours consécutifs (qui peut être > streak.days
/// courant si l'utilisateur a "raté" un jour).
export type GamificationMeta = {
  /// Série courante de bonnes réponses consécutives. Reset à 0 sur la
  /// première mauvaise réponse, incrémentée à chaque réponse correcte.
  correctStreakCurrent: number;
  /// Maximum jamais atteint, conservé pour les badges sniper/marksman
  /// même après une mauvaise réponse.
  correctStreakMax: number;
  /// Max jamais atteint pour streak.days (jours consécutifs joués).
  /// Toujours ≥ streak.days. Permet les badges habitué/fidèle/inébranlable
  /// de rester débloqués même si l'utilisateur casse sa série.
  daysStreakMax: number;
  /// Nombre lifetime de défis créés (créateur). Incrémenté dans
  /// addSentChallenge. Pas dérivable de challenges.sent qui peut être purgé.
  defisCreated: number;
  /// Nombre total de réponses reçues sur les défis créés par l'utilisateur.
  /// Source de vérité : serveur (cf. /api/me/defis-impact). Mis à jour
  /// par le watcher au mount d'AppShell ; mis à 0 par défaut. Choix
  /// éditorial : c'est cette métrique — et pas defisCreated — qui drive
  /// les badges Partage (ambassadeur, bouche-à-oreille), parce que recevoir
  /// une réponse est le signal qu'une conversation a eu lieu, alors que
  /// créer un défi est trivial.
  defisPlayedByOthers: number;
  /// Lifetime : nombre de défis reçus de quelqu'un d'autre que l'utilisateur
  /// a joué (= submit de réponse sur /d/[shortCode]). Symétrique de
  /// defisPlayedByOthers — récompense la viralité côté "destinataire actif"
  /// plutôt que côté émetteur. Incrémenté localement par DefiPlayClient
  /// après un POST de réponse réussi ; jamais décrémenté.
  defisReceivedPlayed: number;
  /// Compteur du nombre de questions répondues "aujourd'hui" (Europe/Paris).
  /// Utilisé pour la mission du jour et le badge marathonien. Reset
  /// automatiquement au passage d'un nouveau jour dans recordAnswer.
  todayPlayedDay: string | null;
  todayPlayedCount: number;
};

export const DEFAULT_GAMIF: GamificationMeta = {
  correctStreakCurrent: 0,
  correctStreakMax: 0,
  daysStreakMax: 0,
  defisCreated: 0,
  defisPlayedByOthers: 0,
  defisReceivedPlayed: 0,
  todayPlayedDay: null,
  todayPlayedCount: 0,
};

export type Progress = {
  version: number;
  /// Clé = questionId (customId Admin, ex "Q-IMM-001").
  answers: Record<string, AnswerRecord>;
  streak: Streak;
  prefs: Prefs;
  identity: Identity;
  challenges: Challenges;
  /// Clé = questionId. Empty par défaut. Synchronisé via UserSnapshot
  /// (rentre dans le même blob Progress que le reste, donc rien à câbler
  /// côté API). Coût en bytes négligeable (~50/entrée).
  favorites: Record<string, FavoriteRecord>;
  /// Badges débloqués. Clé = badge id du catalogue (cf. lib/gamification).
  /// La présence vaut "débloqué" ; les badges retirés du catalogue restent
  /// stockés sans dommage (juste ignorés à l'affichage).
  badges: Record<string, BadgeRecord>;
  /// Compteurs gamification (max streaks, défis créés…). Cf. GamificationMeta.
  gamif: GamificationMeta;
  /// Retraits datés (favori retiré, défi reçu masqué). La fusion entre
  /// appareils ne fait que des unions : sans cette trace, un favori retiré
  /// ici revenait depuis l'autre appareil, et un défi masqué revenait à
  /// chaque rechargement (réinjecté depuis /api/me/defis-played).
  /// Optionnel : absent des anciens snapshots. Purgé au-delà de
  /// TOMBSTONE_TTL_MS (cf. mergeProgress).
  tombstones?: Tombstones;
};

export type Tombstones = {
  /// questionId → date du retrait (ms).
  favorites: Record<string, number>;
  /// shortCode du défi reçu → date du masquage (ms).
  received: Record<string, number>;
};

/// Durée de conservation d'une trace de retrait : au-delà, un appareil
/// resté hors ligne plus longtemps pourrait faire revenir l'élément, ce qui
/// est acceptable (les défis sont eux-mêmes effacés du serveur après ~1 an).
export const TOMBSTONE_TTL_MS = 400 * 24 * 60 * 60 * 1000;

function withTombstone(p: Progress, kind: keyof Tombstones, id: string, at: number): Tombstones {
  const t = p.tombstones ?? { favorites: {}, received: {} };
  return { ...t, [kind]: { ...t[kind], [id]: at } };
}

export const DEFAULT_PROGRESS: Progress = {
  version: PROGRESS_VERSION,
  answers: {},
  streak: { days: 0, lastPlayedDay: null },
  prefs: { favoriteTheme: null, favoriteMode: null },
  identity: { pseudo: null },
  challenges: { sent: [], received: [] },
  favorites: {},
  badges: {},
  gamif: DEFAULT_GAMIF,
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/// YYYY-MM-DD en fuseau Europe/Paris. Fixe le calcul du streak sur
/// les frontières de jour locales, indépendamment du fuseau navigateur.
export function todayKey(now: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(now);
}

/// Série de jours EN COURS : `streak.days` n'est remis à zéro qu'à la
/// prochaine partie, si bien qu'un joueur absent depuis une semaine voyait
/// encore « 10 jours d'affilée ». Une série vit tant que le dernier jour
/// joué est aujourd'hui ou hier (jour de Paris) ; sinon elle vaut 0.
export function currentStreak(p: Progress, now: Date = new Date()): number {
  const last = p.streak.lastPlayedDay;
  if (!last) return 0;
  const today = todayKey(now);
  return last === today || last === previousDayKey(today) ? p.streak.days : 0;
}

/// Jour précédent en YYYY-MM-DD (Europe/Paris).
function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  // Construit à midi UTC pour éviter les bascules DST au moment du
  // décalage Europe/Paris.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return todayKey(dt);
}

export function loadProgress(): Progress {
  if (!isBrowser()) return DEFAULT_PROGRESS;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<Progress> & { version?: number };
    // Politique stricte : tout snapshot non-v3 est wipé proprement. La
    // migration douce v1→v2 a été retirée le 2026-05-21 quand on a refondu
    // la base de connaissances (ids/formats changés) — préserver les
    // anciens `answers` aurait référencé des questions disparues ou avec
    // un format incompatible. Le watcher gamification ré-évalue les
    // badges au prochain render à partir du Progress frais.
    if (parsed.version !== PROGRESS_VERSION) {
      return DEFAULT_PROGRESS;
    }
    return {
      version: PROGRESS_VERSION,
      answers: parsed.answers ?? {},
      streak: {
        days: parsed.streak?.days ?? 0,
        lastPlayedDay: parsed.streak?.lastPlayedDay ?? null,
      },
      prefs: {
        favoriteTheme: parsed.prefs?.favoriteTheme ?? null,
        favoriteMode: parsed.prefs?.favoriteMode ?? null,
      },
      identity: {
        pseudo: parsed.identity?.pseudo ?? null,
      },
      challenges: {
        sent: parsed.challenges?.sent ?? [],
        received: parsed.challenges?.received ?? [],
      },
      // Rétro-compat : les snapshots antérieurs à l'introduction des favoris
      // n'ont pas ce champ — on retombe sur {}.
      favorites: parsed.favorites ?? {},
      ...(parsed.tombstones && typeof parsed.tombstones === "object"
        ? {
            tombstones: {
              favorites: parsed.tombstones.favorites ?? {},
              received: parsed.tombstones.received ?? {},
            },
          }
        : {}),
      // v1 → v2 : badges + gamif absents, on injecte les défauts.
      badges: parsed.badges ?? {},
      gamif: {
        correctStreakCurrent:
          parsed.gamif?.correctStreakCurrent ?? DEFAULT_GAMIF.correctStreakCurrent,
        correctStreakMax:
          parsed.gamif?.correctStreakMax ?? DEFAULT_GAMIF.correctStreakMax,
        // Si on n'a pas l'info (v1), on retombe sur le streak courant —
        // c'est sous-estimé mais ça permet aux badges streak-historiques
        // d'être réévalués honnêtement par le watcher.
        daysStreakMax:
          parsed.gamif?.daysStreakMax ??
          Math.max(parsed.streak?.days ?? 0, DEFAULT_GAMIF.daysStreakMax),
        defisCreated:
          parsed.gamif?.defisCreated ??
          // Approximation v1 : compter les défis sent stockés (cap à 50
          // pour éviter une explosion improbable côté ancien snapshot).
          Math.min(50, parsed.challenges?.sent?.length ?? 0),
        // Server-tracked : 0 par défaut, sera rattrapé par le watcher au
        // prochain fetch /api/me/defis-impact.
        defisPlayedByOthers: parsed.gamif?.defisPlayedByOthers ?? 0,
        defisReceivedPlayed: parsed.gamif?.defisReceivedPlayed ?? 0,
        todayPlayedDay: parsed.gamif?.todayPlayedDay ?? null,
        todayPlayedCount: parsed.gamif?.todayPlayedCount ?? 0,
      },
    };
  } catch {
    // Storage corrompu : on repart à zéro plutôt que de planter le rendu.
    return DEFAULT_PROGRESS;
  }
}

export function saveProgress(p: Progress): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Quota dépassé / mode privé strict : on ignore. La session
    // continue de fonctionner avec l'état en mémoire.
  }
}

export function clearProgress(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* ignore */
  }
}

// ============================ Mutators ============================
// Toutes immutables : elles retournent un nouveau Progress, ne
// touchent pas à l'argument. Le caller persiste avec saveProgress.

export function recordAnswer(
  p: Progress,
  questionId: string,
  value: AnswerValue,
  correct: boolean,
  now: Date = new Date()
): Progress {
  // Première fois qu'on répond à cette question ? La gamif (séries de bonnes
  // réponses, compteur du jour) ne doit s'incrémenter que sur les vraies
  // entrées — une question rejouée pour corriger sa réponse ne doit pas
  // gonfler artificiellement la série.
  const isNewAnswer = !p.answers[questionId];
  const prevSrs = p.answers[questionId]?.srs;
  const nowMs = now.getTime();
  const next: Progress = {
    ...p,
    answers: {
      ...p.answers,
      [questionId]: {
        value,
        correct,
        ts: nowMs,
        // Recalcul SRS à chaque réponse : bonne réponse pousse l'intervalle
        // sur l'échelon supérieur, faute reset à 1 jour. Le ladder est dans
        // SRS_INTERVALS_DAYS (cf. srsNext). Sans ce calcul, "Réviser" se
        // limitait à "tout ce qui est faux", sans cadence d'oubli — donc
        // l'utilisateur re-rencontrait éternellement les mêmes erreurs
        // jusqu'à les corriger, sans bénéfice de la répétition espacée.
        srs: srsNext(prevSrs, correct, nowMs),
      },
    },
  };
  const withStreak = bumpStreakForToday(next, now);
  if (!isNewAnswer) return withStreak;
  return bumpGamifForAnswer(withStreak, correct, now);
}

/// Met à jour les compteurs gamif sur une nouvelle réponse : série de
/// bonnes réponses consécutives, compteur "questions du jour".
function bumpGamifForAnswer(
  p: Progress,
  correct: boolean,
  now: Date
): Progress {
  const today = todayKey(now);
  const sameDay = p.gamif.todayPlayedDay === today;
  const newCurrent = correct ? p.gamif.correctStreakCurrent + 1 : 0;
  return {
    ...p,
    gamif: {
      ...p.gamif,
      correctStreakCurrent: newCurrent,
      correctStreakMax: Math.max(p.gamif.correctStreakMax, newCurrent),
      todayPlayedDay: today,
      todayPlayedCount: sameDay ? p.gamif.todayPlayedCount + 1 : 1,
    },
  };
}

/// Si l'utilisateur joue aujourd'hui et n'a pas encore joué aujourd'hui,
/// incrémente le streak. Si hier était le dernier jour, +1 ; sinon
/// reset à 1. Met aussi à jour gamif.daysStreakMax pour préserver la
/// trace historique du record (survit aux "trous" dans la régularité).
function bumpStreakForToday(p: Progress, now: Date): Progress {
  const today = todayKey(now);
  const last = p.streak.lastPlayedDay;
  if (last === today) return p; // déjà compté aujourd'hui
  const expectedYesterday = previousDayKey(today);
  const continued = last === expectedYesterday;
  const newDays = continued ? p.streak.days + 1 : 1;
  return {
    ...p,
    streak: {
      days: newDays,
      lastPlayedDay: today,
    },
    gamif: {
      ...p.gamif,
      daysStreakMax: Math.max(p.gamif.daysStreakMax, newDays),
    },
  };
}

export function setFavoriteTheme(p: Progress, themeId: string | null): Progress {
  return { ...p, prefs: { ...p.prefs, favoriteTheme: themeId } };
}

export function setFavoriteMode(
  p: Progress,
  mode: Prefs["favoriteMode"]
): Progress {
  return { ...p, prefs: { ...p.prefs, favoriteMode: mode } };
}

export function setPseudo(p: Progress, pseudo: string | null): Progress {
  const trimmed = pseudo === null ? null : pseudo.trim().slice(0, 40) || null;
  return { ...p, identity: { ...p.identity, pseudo: trimmed } };
}

export function addSentChallenge(
  p: Progress,
  challenge: SentChallenge
): Progress {
  return {
    ...p,
    challenges: { ...p.challenges, sent: [challenge, ...p.challenges.sent] },
    gamif: {
      ...p.gamif,
      defisCreated: p.gamif.defisCreated + 1,
    },
  };
}

export function addReceivedChallenge(
  p: Progress,
  challenge: ReceivedChallenge
): Progress {
  return {
    ...p,
    challenges: {
      ...p.challenges,
      received: [challenge, ...p.challenges.received],
    },
  };
}

/// Ajoute (ou rafraîchit) un favori. Idempotent : re-toggler une question
/// déjà favorite met à jour son `addedAt`. Pour un retrait, utiliser
/// `removeFavorite`.
export function addFavorite(
  p: Progress,
  questionId: string,
  now: Date = new Date()
): Progress {
  return {
    ...p,
    favorites: {
      ...p.favorites,
      [questionId]: { addedAt: now.getTime() },
    },
  };
}

/// Retire un favori. Idempotent : noop si pas présent. Laisse une trace
/// datée pour que la fusion avec un autre appareil ne le fasse pas revenir.
export function removeFavorite(
  p: Progress,
  questionId: string,
  now: Date = new Date()
): Progress {
  if (!p.favorites[questionId]) return p;
  const next = { ...p.favorites };
  delete next[questionId];
  return {
    ...p,
    favorites: next,
    tombstones: withTombstone(p, "favorites", questionId, now.getTime()),
  };
}

/// Toggle un favori : ajoute si absent, retire si présent. Helper pratique
/// pour les boutons d'UI où on n'a pas besoin de distinguer add/remove.
export function toggleFavorite(
  p: Progress,
  questionId: string,
  now: Date = new Date()
): Progress {
  return p.favorites[questionId]
    ? removeFavorite(p, questionId, now)
    : addFavorite(p, questionId, now);
}

/// Marque un badge comme débloqué (idempotent : noop s'il est déjà présent).
/// Le watcher gamification est seule source d'appel — pas exposé hors lib.
export function unlockBadges(
  p: Progress,
  ids: string[],
  now: Date = new Date()
): Progress {
  if (ids.length === 0) return p;
  const next = { ...p.badges };
  let touched = false;
  for (const id of ids) {
    if (next[id]) continue;
    next[id] = { unlockedAt: now.getTime(), seen: false };
    touched = true;
  }
  if (!touched) return p;
  return { ...p, badges: next };
}

/// Retire un défi reçu de l'historique local. Soft-delete : on ne touche
/// PAS au compteur `defisReceivedPlayed` (lifetime, conserve les badges
/// déjà débloqués) — l'utilisateur peut "nettoyer son écran" sans perdre
/// ses récompenses. Noop si l'id n'est pas dans la liste.
export function removeReceivedDefi(
  p: Progress,
  id: string,
  now: Date = new Date()
): Progress {
  const exists = p.challenges.received.some((r) => r.id === id);
  if (!exists) return p;
  return {
    ...p,
    challenges: {
      ...p.challenges,
      received: p.challenges.received.filter((r) => r.id !== id),
    },
    // Masquage durable : ni la fusion avec un autre appareil ni la
    // réconciliation /api/me/defis-played ne le refont apparaître.
    tombstones: withTombstone(p, "received", id, now.getTime()),
  };
}

/// Vrai si ce défi reçu a été masqué par le joueur (cf. removeReceivedDefi).
export function isReceivedDefiHidden(p: Progress, id: string): boolean {
  return p.tombstones?.received[id] !== undefined;
}

/// Cap soft de la liste des défis reçus mémorisés localement. Au-delà,
/// on tronque les plus anciens. 200 couvre largement un usage humain
/// (un militant qui joue 1 défi/jour pendant 6 mois reste sous le seuil).
const RECEIVED_DEFIS_CAP = 200;

/// Enregistre qu'un défi reçu a été joué, avec sa méta complète. Source
/// d'appel unique : `DefiPlayClient` après un submit réussi (200 ou 409).
///
/// Dedup par `id` (shortCode) : si le même défi est rejoué après refresh
/// (cas 409), on met à jour l'entrée (score / playedAt) mais on ne
/// décompte pas le compteur. C'est le mécanisme qui empêche de tricher
/// sur les badges Partage destinataire en refresh-loopant.
///
/// La liste est tronquée à RECEIVED_DEFIS_CAP entrées (les plus récentes
/// gagnent) pour borner le blob Progress synchronisé.
export function recordReceivedDefiPlayed(
  p: Progress,
  entry: ReceivedChallenge
): Progress {
  // Défi masqué puis renvoyé (rechargement de la page de jeu, réponse 409) :
  // on le laisse masqué ; il a déjà été compté.
  if (isReceivedDefiHidden(p, entry.id)) return p;
  const existing = p.challenges.received.find((r) => r.id === entry.id);
  const others = p.challenges.received.filter((r) => r.id !== entry.id);
  // Récents d'abord ; cap soft.
  const received = [entry, ...others].slice(0, RECEIVED_DEFIS_CAP);
  // Le compteur lifetime n'incrémente qu'à la 1ère insertion d'un id.
  // Idempotent sur refresh ou re-submit involontaire.
  const defisReceivedPlayed = existing
    ? p.gamif.defisReceivedPlayed
    : p.gamif.defisReceivedPlayed + 1;
  return {
    ...p,
    challenges: { ...p.challenges, received },
    gamif: { ...p.gamif, defisReceivedPlayed },
  };
}

/// Met à jour le compteur des défis joués par des destinataires depuis le
/// serveur. Monotone — on ne décroît jamais (le serveur peut renvoyer une
/// valeur inférieure si une fenêtre de sync est désynchronisée ; on garde
/// l'historique). Idempotent : noop si la valeur ne change pas.
export function setDefisPlayedByOthers(
  p: Progress,
  count: number
): Progress {
  if (!Number.isFinite(count) || count < 0) return p;
  const next = Math.max(p.gamif.defisPlayedByOthers, Math.floor(count));
  if (next === p.gamif.defisPlayedByOthers) return p;
  return {
    ...p,
    gamif: { ...p.gamif, defisPlayedByOthers: next },
  };
}

/// Marque une liste de badges comme vus (toast dismissed). Utilisé par
/// l'UI quand l'utilisateur a fermé la notification d'unlock.
export function markBadgesSeen(p: Progress, ids: string[]): Progress {
  if (ids.length === 0) return p;
  const next = { ...p.badges };
  let touched = false;
  for (const id of ids) {
    const cur = next[id];
    if (!cur || cur.seen) continue;
    next[id] = { ...cur, seen: true };
    touched = true;
  }
  if (!touched) return p;
  return { ...p, badges: next };
}

// =============================== Selectors ===============================

export function answeredCount(p: Progress): number {
  return Object.keys(p.answers).length;
}

export function isFavorite(p: Progress, questionId: string): boolean {
  return !!p.favorites[questionId];
}

export function favoritesCount(p: Progress): number {
  return Object.keys(p.favorites).length;
}

/// Liste les questionIds favorites, plus récents d'abord (tri par addedAt
/// décroissant). Utile pour la page Favoris et le défi-favoris.
export function listFavorites(p: Progress): string[] {
  return Object.entries(p.favorites)
    .sort(([, a], [, b]) => b.addedAt - a.addedAt)
    .map(([id]) => id);
}

export function correctCount(p: Progress): number {
  let n = 0;
  for (const id in p.answers) if (p.answers[id].correct) n++;
  return n;
}

export function hasAnsweredToday(p: Progress, now: Date = new Date()): boolean {
  if (p.streak.lastPlayedDay !== todayKey(now)) return false;
  return Object.keys(p.answers).length > 0;
}

// ============================ Merge ============================
// Fusion locale ↔ serveur au moment du login. Stratégie volontairement
// simple et déterministe (pas d'UI de résolution de conflit) :
//   - answers : union par questionId ; pour les clés communes, on
//     garde la réponse avec le `ts` le plus récent
//   - streak : cf. mergeStreak (série du côté le plus récemment joué ; on
//     ne ressuscite pas une série cassée sur un autre appareil)
//   - prefs : prefer remote si non-null, sinon local (le serveur
//     incarne "le device principal")
//   - challenges : union par id, plus récent en tête

/// Fusion des séries de jours de deux appareils. On ne connaît que (nombre
/// de jours, dernier jour joué) de chaque côté, pas l'historique :
///   - même dernier jour → la plus longue ;
///   - l'autre côté a joué la veille du plus récent → sa série a été
///     prolongée (au moins ses jours + 1) ;
///   - sinon l'autre série est cassée → seule compte la plus récente.
/// (Avant : max des jours + dernier jour le plus récent, ce qui ressuscitait
/// une série cassée — 10 jours finis le 20/10 + 1 jour le 07/11 donnaient
/// « 10 jours au 07/11 », avec badge et XP indus.)
export function mergeStreak(a: Streak, b: Streak): Streak {
  if (!a.lastPlayedDay) return b;
  if (!b.lastPlayedDay) return a;
  const [recent, other] = a.lastPlayedDay >= b.lastPlayedDay ? [a, b] : [b, a];
  if (recent.lastPlayedDay === other.lastPlayedDay) {
    return { days: Math.max(a.days, b.days), lastPlayedDay: recent.lastPlayedDay };
  }
  if (other.lastPlayedDay === previousDayKey(recent.lastPlayedDay!)) {
    return { days: Math.max(recent.days, other.days + 1), lastPlayedDay: recent.lastPlayedDay };
  }
  return recent;
}

/// Compteur « joué aujourd'hui » : ne vaut que pour son jour. On garde le jour
/// le plus récent et uniquement les compteurs de CE jour (avant : max des deux
/// même s'ils portaient sur des jours différents → missions du jour validées
/// à tort).
function mergeTodayCount(
  a: GamificationMeta,
  b: GamificationMeta,
): Pick<GamificationMeta, "todayPlayedDay" | "todayPlayedCount"> {
  const day =
    a.todayPlayedDay && b.todayPlayedDay
      ? a.todayPlayedDay >= b.todayPlayedDay
        ? a.todayPlayedDay
        : b.todayPlayedDay
      : (a.todayPlayedDay ?? b.todayPlayedDay);
  const count = Math.max(
    a.todayPlayedDay === day ? a.todayPlayedCount : 0,
    b.todayPlayedDay === day ? b.todayPlayedCount : 0,
  );
  return { todayPlayedDay: day, todayPlayedCount: count };
}

export function mergeProgress(local: Progress, remote: Progress): Progress {
  if (local.version !== remote.version) {
    // Versions incompatibles : on garde la version locale, le
    // mécanisme de migration prendra le relais quand on l'écrira.
    return local;
  }

  const answers: Progress["answers"] = { ...local.answers };
  for (const [qid, a] of Object.entries(remote.answers)) {
    const existing = answers[qid];
    if (!existing || a.ts > existing.ts) answers[qid] = a;
  }

  const streak = mergeStreak(local.streak, remote.streak);

  const prefs: Prefs = {
    favoriteTheme: remote.prefs.favoriteTheme ?? local.prefs.favoriteTheme,
    favoriteMode: remote.prefs.favoriteMode ?? local.prefs.favoriteMode,
  };

  const sentById = new Map<string, SentChallenge>();
  for (const c of [...remote.challenges.sent, ...local.challenges.sent]) {
    const existing = sentById.get(c.id);
    if (!existing || c.createdAt > existing.createdAt) sentById.set(c.id, c);
  }
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const receivedById = new Map<string, ReceivedChallenge>();
  for (const c of [
    ...remote.challenges.received,
    ...local.challenges.received,
  ]) {
    if (tombstones?.received[c.id] !== undefined) continue;
    const existing = receivedById.get(c.id);
    if (!existing || c.createdAt > existing.createdAt) receivedById.set(c.id, c);
  }

  // Favoris : union par questionId. Pour les clés communes, on garde
  // l'entrée avec le `addedAt` le plus ancien (le moment où l'utilisateur
  // a marqué la question pour la première fois — ré-bookmark sur un autre
  // device ne réécrit pas cette date d'origine).
  //
  // Avec les retraits datés : un favori n'est gardé que s'il a été (re)mis
  // APRÈS son dernier retrait connu, et sa date d'origine est la plus
  // ancienne des dates postérieures à ce retrait.
  const favorites: Progress["favorites"] = {};
  for (const qid of new Set([...Object.keys(local.favorites), ...Object.keys(remote.favorites)])) {
    const removedAt = tombstones?.favorites[qid] ?? -Infinity;
    const live = [local.favorites[qid], remote.favorites[qid]].filter(
      (f): f is FavoriteRecord => !!f && f.addedAt > removedAt
    );
    if (live.length === 0) continue;
    favorites[qid] = live.reduce((a, b) => (b.addedAt < a.addedAt ? b : a));
  }

  // Badges : union par id. Si débloqué des deux côtés, on garde
  // l'unlockedAt le plus ancien (vérité historique du premier device qui
  // l'a obtenu). `seen` : on prend OR — si vu sur n'importe quel device,
  // pas la peine de re-toaster sur les autres.
  const badges: Progress["badges"] = { ...local.badges };
  for (const [id, b] of Object.entries(remote.badges)) {
    const existing = badges[id];
    if (!existing) {
      badges[id] = b;
    } else {
      badges[id] = {
        unlockedAt: Math.min(existing.unlockedAt, b.unlockedAt),
        seen: existing.seen || b.seen,
      };
    }
  }

  // Gamif : on garde les valeurs max (correctStreakMax, daysStreakMax,
  // defisCreated). Pour correctStreakCurrent et todayPlayedCount on garde
  // l'entrée la plus à jour (par date de jour Europe/Paris ou, à défaut,
  // par valeur max — c'est une approximation acceptable pour la sync
  // multi-device, sans valeur militante à se battre dessus).
  const gamif: GamificationMeta = {
    correctStreakCurrent: Math.max(
      local.gamif.correctStreakCurrent,
      remote.gamif.correctStreakCurrent
    ),
    correctStreakMax: Math.max(
      local.gamif.correctStreakMax,
      remote.gamif.correctStreakMax
    ),
    daysStreakMax: Math.max(
      local.gamif.daysStreakMax,
      remote.gamif.daysStreakMax
    ),
    defisCreated: Math.max(local.gamif.defisCreated, remote.gamif.defisCreated),
    defisPlayedByOthers: Math.max(
      local.gamif.defisPlayedByOthers,
      remote.gamif.defisPlayedByOthers
    ),
    defisReceivedPlayed: Math.max(
      local.gamif.defisReceivedPlayed,
      remote.gamif.defisReceivedPlayed
    ),
    ...mergeTodayCount(local.gamif, remote.gamif),
  };

  return {
    version: local.version,
    answers,
    streak,
    prefs,
    // On garde le pseudo local pour l'instant ; le caller le remplace
    // par le pseudo logged-in (cf. ProgressProvider).
    identity: { pseudo: local.identity.pseudo ?? remote.identity.pseudo },
    challenges: {
      sent: Array.from(sentById.values()).sort(
        (a, b) => b.createdAt - a.createdAt
      ),
      received: Array.from(receivedById.values()).sort(
        (a, b) => b.createdAt - a.createdAt
      ),
    },
    favorites,
    badges,
    gamif,
    ...(tombstones ? { tombstones } : {}),
  };
}

/// Union des retraits datés (le plus récent gagne), sans les traces plus
/// vieilles que TOMBSTONE_TTL_MS.
function mergeTombstones(
  a: Tombstones | undefined,
  b: Tombstones | undefined,
  now: number = Date.now()
): Tombstones | undefined {
  if (!a && !b) return undefined;
  const pick = (x: Record<string, number> = {}, y: Record<string, number> = {}) => {
    const out: Record<string, number> = {};
    for (const [k, v] of [...Object.entries(x), ...Object.entries(y)]) {
      if (now - v > TOMBSTONE_TTL_MS) continue;
      if (out[k] === undefined || v > out[k]) out[k] = v;
    }
    return out;
  };
  return {
    favorites: pick(a?.favorites, b?.favorites),
    received: pick(a?.received, b?.received),
  };
}

export function daysToVote(now: Date = new Date()): number {
  // Présidentielle T1 prévue dimanche 11 avril 2027 (date provisoire,
  // ajustable au fil du calendrier officiel). On compte les jours
  // pleins restants, sur le jour de Paris (le jour UTC décalait le
  // compte entre minuit et 1-2 h du matin).
  const target = Date.UTC(2027, 3, 11); // 0-indexed: mois 3 = avril
  const [y, m, d] = todayKey(now).split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  return Math.max(0, Math.ceil((target - today) / 86_400_000));
}
