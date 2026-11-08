"use client";

import { useEffect, useState } from "react";
import type { Question } from "./types";

/// Cache module-level des réponses stats, indexées par questionId. Évite
/// de re-fetch le même endpoint sur :
///   - un flip desktop/mobile (le runner DT démonte, le mobile remonte)
///   - un re-mount React strict-mode en dev
///   - une question rejouée (continuer · 5 nouvelles puis retomber sur la même)
///
/// Le cache vit pour la durée de la session (page non-rechargée). Volontairement
/// pas de TTL : les stats agrégées bougent lentement à l'échelle d'une session.
/// Si on a besoin de plus de fraîcheur, ajouter un Ctrl-R reload.
const statsCache = new Map<string, StatsResponse>();
const inflightRequests = new Map<string, Promise<StatsResponse | null>>();

export type StatsResponse =
  | { hasRealData: false; count: number }
  | {
      hasRealData: true;
      count: number;
      // estimation
      mean?: number;
      pctClose?: number;
      pctOff?: number;
      // ab/qcm
      distribution?: Record<string, number>;
      // vraifaux
      pctTrue?: number;
      pctFalse?: number;
      // vraifaux_multi : par énoncé, % vrai/faux
      perStatement?: Record<string, { pctTrue: number; pctFalse: number }>;
      // curseur_multi : par item, moyenne communauté
      perItemMean?: Record<string, number>;
      // categorisation : par item, distribution % par bin id
      perItemBins?: Record<string, Record<string, number>>;
      // classement : par item id, distribution % par position (clé = position 0..N-1)
      perItemPositions?: Record<string, Record<string, number>>;
      // pondere : par catégorie, allocation moyenne %
      perCategoryMean?: Record<string, number>;
    };

/** Fetches anonymous community stats for a question. Returns null while loading.
 *
 *  Dédup via le cache module-level + inflight tracking : deux mounts
 *  concurrents pour le même questionId (typique au resize desktop↔mobile)
 *  ne déclenchent qu'un seul fetch réseau. */
export function useQuestionStats(questionId: string): StatsResponse | null {
  // Cache lu à chaque render (lecture pure, pas un side-effect) : si une autre
  // instance du hook a déjà fetché ce questionId, on le retourne direct sans
  // passer par un setState d'init. Ça évite aussi le lint
  // `react-hooks/set-state-in-effect` qui complained quand on faisait
  // `setStats(cached)` dans l'effet.
  const cached = statsCache.get(questionId) ?? null;

  // `fetched` ne sert qu'à forcer un re-render quand un fetch en cours se
  // termine — sa valeur réelle ne sert pas (on relit `cached` au render
  // suivant et il sera peuplé). Stocker `questionId` permet d'ignorer une
  // résolution arrivée après changement d'id.
  const [fetched, setFetched] = useState<{ id: string } | null>(null);

  useEffect(() => {
    // Cache hit : la valeur est déjà disponible via `cached`. Rien à faire.
    if (statsCache.has(questionId)) return;

    let cancelled = false;
    // Inflight : une autre requête sur le même id est en cours, on la réutilise.
    let promise = inflightRequests.get(questionId);
    if (!promise) {
      promise = fetch(`/api/stats?questionId=${encodeURIComponent(questionId)}`)
        .then((r) => (r.ok ? (r.json() as Promise<StatsResponse>) : null))
        .catch(() => null)
        .then((s) => {
          inflightRequests.delete(questionId);
          if (s) statsCache.set(questionId, s);
          return s;
        });
      inflightRequests.set(questionId, promise);
    }
    promise.then((s) => {
      if (!cancelled && s) setFetched({ id: questionId });
    });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  // `fetched` est utilisé indirectement : sa mise à jour déclenche un re-render
  // qui re-lit `cached` ci-dessus avec la valeur fraîchement mise en cache.
  void fetched;
  return cached;
}

/** Fire-and-forget anonymous answer submission. No await needed.
 * For new composite formats (classement, vraifaux_multi, curseur_multi,
 * categorisation, pondere), value is the JSON-serializable answer object
 * — the backend stores it as-is (column `Answer.value` is a String). */
export function submitAnswer(
  questionId: string,
  value: number | boolean | 0 | 1 | string[] | Record<string, unknown>
) {
  fetch("/api/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, value }),
  }).catch(() => {
    /* swallowed — collection is best-effort */
  });
}

/** Returns a question with live community stats merged in, falling back to
 * the synthetic placeholder values in data.ts when stats are unavailable or
 * below the threshold. */
export function mergeStats(q: Question, stats: StatsResponse | null): Question {
  if (!stats || !stats.hasRealData) return q;

  if (q.format === "estimation") {
    return {
      ...q,
      avgUser: stats.mean ?? q.avgUser,
      pctClose: stats.pctClose ?? q.pctClose,
      pctOff: stats.pctOff ?? q.pctOff,
    };
  }

  if (q.format === "ab") {
    const dist = stats.distribution;
    if (!dist) return q;
    const correctKey = String(q.correctIndex);
    const wrongKey = String(1 - q.correctIndex);
    const wrongPct = dist[wrongKey] ?? 0;
    const wrongLabel = q.choices[1 - q.correctIndex].label;
    return {
      ...q,
      avgUserText: `${wrongPct} % ont choisi « ${wrongLabel} »`,
      pctClose: dist[correctKey] ?? q.pctClose,
      pctOff: dist[wrongKey] ?? q.pctOff,
    };
  }

  if (q.format === "vraifaux") {
    if (stats.pctTrue === undefined || stats.pctFalse === undefined) return q;
    const correctPct = q.correctAnswer ? stats.pctTrue : stats.pctFalse;
    const wrongPct = q.correctAnswer ? stats.pctFalse : stats.pctTrue;
    return {
      ...q,
      avgUserText: `${wrongPct} % pensent que c'est ${
        q.correctAnswer ? "faux" : "vrai"
      }`,
      pctClose: correctPct,
      pctOff: wrongPct,
    };
  }

  // New composite formats — community stats not yet aggregated client-side.
  return q;
}
