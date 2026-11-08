/// Persistance locale de la SESSION DE JEU EN COURS (≠ progress.ts qui stocke
/// l'historique des réponses). Objectif : si l'utilisateur recharge la page
/// — ou ferme/rouvre l'onglet — au milieu d'une série de 5 questions, d'un
/// thème, ou de la création d'un défi, on le ramène exactement où il en était
/// (même question, réponses déjà données préservées) plutôt que de le laisser
/// sur la question courante isolée (route `/q/[slug]`).
///
/// Stockage : localStorage, clé `mon2027:active-session`. Marche que
/// l'utilisateur soit connecté ou non (purement client, même appareil). La
/// reprise cross-appareil nécessiterait une persistance serveur — hors scope.
///
/// Cycle de vie :
///   - écrite à chaque changement d'état du jeu (idx / réponses), cf. AppShell
///     `persistActiveSession` branché sur GameSession.onProgress
///   - lue au montage d'AppShell (restauration) et par la route `/q/[slug]`
///     (redirection vers la reprise quand le slug courant = question en cours)
///   - effacée à la fin de la session (onDone) ou au démarrage d'une nouvelle
///
/// On stocke des SLUGS (pas des ids) pour réutiliser le résolveur
/// `findQuestionBySlug` déjà en place et rester cohérent avec le mécanisme
/// `?qs=` de replay. Si le catalogue change côté admin et qu'un slug ne
/// résout plus, la restauration abandonne proprement (cf. AppShell).

import { findQuestionBySlug } from "./question-slug";
import type { Answer, NavTarget, Question } from "./types";

export const ACTIVE_SESSION_KEY = "mon2027:active-session";
/// Bump à incrémenter si la shape change — un snapshot d'une autre version est
/// ignoré + effacé au prochain accès (pas de migration douce, comme progress).
export const ACTIVE_SESSION_VERSION = 1;

/// "series" = série de 5 / thème (lancée depuis Découvrir/Thèmes/Réviser).
/// "challenge" = les 5 questions jouées pendant la création d'un défi.
export type ActiveSessionMode = "series" | "challenge";

/// Contexte défi minimal à re-hydrater pour reconstruire `defiInProgress`.
/// `picked` n'est pas stocké : on le reconstitue depuis les slugs résolus.
export type ActiveSessionDefi = {
  source: "theme" | "favoris";
  themeId: string | null;
};

export type ActiveSession = {
  version: number;
  mode: ActiveSessionMode;
  /// Slugs des questions de la session, dans l'ordre de jeu.
  slugs: string[];
  /// Index de la question courante (0-based) au moment de la sauvegarde.
  idx: number;
  /// Réponses déjà données, parallèle à `slugs` (null = pas encore répondu).
  answers: Answer[];
  /// Item de nav à re-surligner à la restauration (themes / challenge / …).
  activeMode: NavTarget;
  /// Présent uniquement quand mode === "challenge".
  defi?: ActiveSessionDefi;
  /// epoch ms — utile pour un éventuel TTL futur / debug.
  updatedAt: number;
};

/// Lecture défensive : renvoie null si absent, illisible, ou version périmée
/// (et purge dans ce dernier cas). Aucune exception ne remonte au caller.
export function loadActiveSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveSession> | null;
    if (
      !parsed ||
      parsed.version !== ACTIVE_SESSION_VERSION ||
      !Array.isArray(parsed.slugs) ||
      parsed.slugs.length === 0 ||
      !Array.isArray(parsed.answers) ||
      typeof parsed.idx !== "number"
    ) {
      clearActiveSession();
      return null;
    }
    return parsed as ActiveSession;
  } catch {
    clearActiveSession();
    return null;
  }
}

/// Écrit le snapshot. `updatedAt` est posé ici pour que le caller n'ait pas à
/// gérer l'horloge. Silencieuse en cas d'échec (quota, mode privé…).
export function saveActiveSession(
  session: Omit<ActiveSession, "version" | "updatedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ActiveSession = {
      ...session,
      version: ACTIVE_SESSION_VERSION,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota / privacy mode : on ignore, la reprise est best-effort */
  }
}

/// Résout une session sauvegardée contre le catalogue publié courant.
///
/// Tout ou rien : si UN slug ne résout plus (question dépubliée ou slug
/// changé côté admin), ou si les réponses ne sont plus alignées sur les
/// slugs, on renvoie null et l'appelant purge la session puis repart de
/// l'accueil. Pourquoi pas « sauter » les questions introuvables : il
/// faudrait recaler l'index et les réponses, et un défi en cours perdrait
/// une question (le défi créé n'aurait plus le même nombre de questions que
/// celui annoncé). Les réponses déjà données restent de toute façon
/// enregistrées dans la progression : la purge ne coûte que la reprise.
export function resolveActiveSession(
  saved: Pick<ActiveSession, "slugs" | "idx" | "answers">,
  questions: Question[],
): { questions: Question[]; idx: number } | null {
  if (saved.slugs.length === 0) return null;
  if (saved.answers.length !== saved.slugs.length) return null;
  const resolved: Question[] = [];
  for (const s of saved.slugs) {
    const q = findQuestionBySlug(questions, s);
    if (!q) return null;
    resolved.push(q);
  }
  // Index borné défensivement à la plage valide.
  const idx = Number.isFinite(saved.idx)
    ? Math.min(Math.max(Math.trunc(saved.idx), 0), resolved.length - 1)
    : 0;
  return { questions: resolved, idx };
}

export function clearActiveSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
