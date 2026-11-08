"use client";

import { useEffect, useSyncExternalStore } from "react";
import { dossierOf, type QuestionDossier } from "./question-dossier";
import type { Question } from "./types";

/// Dossiers des questions chargés à part (cf. lib/question-dossier.ts).
///
/// Un seul chargement par page, partagé par tous les écrans : lancé en tâche
/// de fond après l'affichage de l'accueil (DossierPrefetch), ou au plus tard
/// quand un dossier est demandé. Le navigateur garde la réponse en cache et
/// la revalide (304) tant que le contenu publié ne change pas.

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; dossiers: Record<string, QuestionDossier> }
  | { status: "error"; at: number };

let state: State = { status: "idle" };
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

/// Délai avant un nouvel essai automatique après un échec (réseau coupé).
const RETRY_AFTER_MS = 5_000;

export function prefetchDossiers(force = false): void {
  if (typeof window === "undefined") return;
  if (state.status === "loading" || state.status === "ready") return;
  if (!force && state.status === "error" && Date.now() - state.at < RETRY_AFTER_MS) return;
  setState({ status: "loading" });
  fetch("/api/catalogue/dossiers", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j: { dossiers?: Record<string, QuestionDossier> }) => {
      setState({ status: "ready", dossiers: j.dossiers ?? {} });
    })
    .catch(() => setState({ status: "error", at: Date.now() }));
}

export type DossierView = QuestionDossier & {
  /// "loading" : chargement en cours (afficher un état d'attente discret) ;
  /// "error" : échec (hors ligne…), `retry` relance.
  status: "ready" | "loading" | "error";
  retry: () => void;
};

const EMPTY: QuestionDossier = { why: "", explain: "", sources: [] };
const noop = () => {};
const retryNow = () => prefetchDossiers(true);

/// `q` complétée de son dossier (objet inchangé si elle l'avait déjà),
/// plus l'état du chargement.
export function useQuestionWithDossier(q: Question): {
  q: Question;
  status: DossierView["status"];
  retry: () => void;
} {
  const d = useQuestionDossier(q);
  if (!q.dossierDeferred) return { q, status: "ready", retry: d.retry };
  return {
    q: { ...q, why: d.why, explain: d.explain, miseEnPerspective: d.miseEnPerspective, sources: d.sources },
    status: d.status,
    retry: d.retry,
  };
}

/// Dossier à afficher pour `q`. Question complète (pages /q, /d, démos) :
/// renvoyé tel quel. Question allégée (`dossierDeferred`, page d'accueil) :
/// lu dans le chargement partagé.
export function useQuestionDossier(q: Question): DossierView {
  const deferred = q.dossierDeferred === true;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (deferred) prefetchDossiers();
  }, [deferred]);

  if (!deferred) return { ...dossierOf(q), status: "ready", retry: noop };
  if (snap.status === "ready") {
    // Une question publiée après le chargement n'y figure pas : dossier vide
    // plutôt qu'une attente sans fin (il sera là au prochain chargement).
    return { ...(snap.dossiers[q.id] ?? EMPTY), status: "ready", retry: noop };
  }
  return { ...EMPTY, status: snap.status === "error" ? "error" : "loading", retry: retryNow };
}
