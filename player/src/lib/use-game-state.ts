"use client";

import { useEffect, useRef, useState } from "react";
import type { Answer, Question } from "./types";
import {
  mergeStats,
  submitAnswer,
  useQuestionStats,
  type StatsResponse,
} from "./stats-hook";
import { isCorrect } from "./correctness";
import { themeColor } from "./theme-colors";
import { useProgress } from "./use-progress";
import { usePreviewMode } from "./preview-mode";
import { PHASE_DELAYS, type RevealPhase } from "./reveal-phase";

/** Tout l'état d'une partie + les actions pour le piloter. Exposé tel quel
 *  aux deux runners (mobile / desktop), qui sont alors purement présentationnels.
 *  Vit dans un parent stable (GameSession) pour survivre au flip du breakpoint. */
export type GameState = {
  q: Question;
  idx: number;
  total: number;
  accent: string;
  phase: RevealPhase;
  isRevealing: boolean;
  isLast: boolean;
  answers: Answer[];
  liveStats: StatsResponse | null;
  /// Brouillon de réponse en cours (avant Valider) pour la question courante,
  /// indexé par `idx`. Vit dans GameSession (parent stable du runner) pour
  /// survivre aux remontages déclenchés par le flip de breakpoint : sans ça,
  /// le `pick`/`val`/`alloc` local d'un format se réinitialise à null/default
  /// quand l'utilisateur redimensionne la fenêtre entre mobile et desktop.
  draft: Answer;
  /// Met à jour le brouillon de la question courante. Les formats l'appellent
  /// à chaque changement utilisateur (toggle A/B, déplacement slider, drop
  /// d'une pastille, etc.) en parallèle de leur setState local.
  setDraft: (value: Answer) => void;
  submit: (value: Answer) => void;
  next: () => void;
  /// Termine la partie immédiatement, en sortant via `onDone` avec les
  /// réponses partielles. Les questions non répondues restent à `null`
  /// dans le tableau — c'est au Recap de gérer ces cases pour montrer
  /// "X questions répondues sur N".
  terminate: () => void;
};

export function useGameState({
  questions,
  onDone,
  initialIdx = 0,
  initialAnswers,
  onProgress,
}: {
  questions: Question[];
  onDone: (answers: Answer[]) => void;
  /// Reprise de session : index de départ (sinon 0). Cf. lib/active-session.
  initialIdx?: number;
  /// Reprise de session : réponses déjà données (parallèle à `questions`).
  /// Si fourni mais de mauvaise cardinalité, on retombe sur un tableau vide.
  initialAnswers?: Answer[];
  /// Notifié à chaque changement d'état persistable (index courant + réponses),
  /// y compris au montage. Branché par AppShell sur la persistance localStorage
  /// pour permettre la reprise après reload. Doit être stable (useCallback).
  onProgress?: (idx: number, answers: Answer[]) => void;
}): GameState {
  const [idx, setIdx] = useState(initialIdx);
  const [answers, setAnswers] = useState<Answer[]>(() =>
    initialAnswers && initialAnswers.length === questions.length
      ? initialAnswers
      : Array(questions.length).fill(null)
  );
  /// Reprise après rechargement sur une question DÉJÀ répondue : on la
  /// rouvre révélée (dossier visible) au lieu de la reproposer — sinon le
  /// joueur pouvait répondre une seconde fois (réponse dupliquée dans les
  /// statistiques, répétition espacée qui avançait deux fois).
  const [phase, setPhase] = useState<RevealPhase>(() =>
    answers[initialIdx] != null ? "dossier" : "ask",
  );
  /// Brouillons par index de question. Même cardinalité que `answers` ;
  /// nettoyé pour la question courante quand `next()` est appelé (le state
  /// devient ramasse-miettes au prochain GC) — on garde le slot à `null`.
  const [drafts, setDrafts] = useState<Answer[]>(() =>
    Array(questions.length).fill(null)
  );
  const submittedRef = useRef<Set<number>>(
    new Set(answers.flatMap((a, i) => (a != null ? [i] : []))),
  );
  const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { progress, recordAnswer } = useProgress();
  const preview = usePreviewMode();

  const rawQ = questions[idx];
  const liveStats = useQuestionStats(rawQ.id);
  const q = mergeStats(rawQ, liveStats);
  /// Accent visuel de la question courante = couleur du thème (chip thème,
  /// barre de progression chrono, fond actif dans la sidebar desktop, etc.).
  /// Avant on cyclait [jaune, coral, teal, …] sur idx — joli mais désynchro
  /// avec les cards Découvrir et la chip de thème (Sécurité tombait sur
  /// jaune si elle était la 1ère question). Source unique : theme-colors.ts.
  const accent = themeColor(q.theme);
  const isRevealing = phase !== "ask";

  function clearPhaseTimers() {
    phaseTimersRef.current.forEach(clearTimeout);
    phaseTimersRef.current = [];
  }

  useEffect(() => {
    return () => clearPhaseTimers();
  }, []);

  // Scroll to top on every new question (including the first one).
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [idx]);

  // Persistance de la progression pour la reprise après reload : on notifie le
  // parent à chaque changement d'index ou de réponses (et au montage, ce qui
  // grave la session dès la 1re question). Le parent (AppShell) décide quoi
  // persister selon le contexte (série/thème/défi). Cf. lib/active-session.
  useEffect(() => {
    onProgress?.(idx, answers);
  }, [idx, answers, onProgress]);

  function schedulePhase(target: Exclude<RevealPhase, "ask">) {
    phaseTimersRef.current.push(
      setTimeout(() => setPhase(target), PHASE_DELAYS[target])
    );
  }

  function submit(value: Answer) {
    if (submittedRef.current.has(idx)) return;
    submittedRef.current.add(idx);
    setAnswers((prev) => {
      const cp = [...prev];
      cp[idx] = value;
      return cp;
    });
    // Aperçu contributeur : on joue, mais rien n'est compté ni enregistré.
    if (value !== null && !preview) {
      // `Answer` (cf. lib/types) couvre déjà l'union complète des shapes par
      // format. Plus de cast `as` nécessaire : recordAnswer accepte AnswerValue
      // qui est compatible. submitAnswer (côté serveur) attend une union
      // proche mais sans `null` — value !== null garanti par la guard.
      // Statistiques communautaires : seulement la PREMIÈRE réponse du joueur
      // à cette question. Une révision ou un rejeu (après avoir vu la bonne
      // réponse) tirait les pourcentages vers « juste ».
      if (!progress.answers[q.id]) submitAnswer(q.id, value);
      recordAnswer(q.id, value, isCorrect(q, value));
    }
    clearPhaseTimers();
    schedulePhase("verdict");
    schedulePhase("truth");
    schedulePhase("comparison");
    schedulePhase("dossier");
  }

  function next() {
    clearPhaseTimers();
    if (idx + 1 >= questions.length) {
      onDone(answers);
      return;
    }
    setIdx(idx + 1);
    setPhase("ask");
  }

  function terminate() {
    clearPhaseTimers();
    onDone(answers);
  }

  function setDraft(value: Answer) {
    setDrafts((prev) => {
      const cp = [...prev];
      cp[idx] = value;
      return cp;
    });
  }

  return {
    q,
    idx,
    total: questions.length,
    accent,
    phase,
    isRevealing,
    isLast: idx === questions.length - 1,
    answers,
    liveStats,
    draft: drafts[idx],
    setDraft,
    submit,
    next,
    terminate,
  };
}
