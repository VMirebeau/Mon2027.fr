"use client";

import { useMemo, useState } from "react";
import { useProgress } from "./use-progress";
import { useQuestionFilter } from "./use-question-filter";
import { bucketize } from "./review-buckets";
import {
  type ReviewTab,
  type ReviewBuckets,
} from "@/components/review-tabs";
import type { Question } from "./types";

/// Vue partagée par Review (mobile) et ReviewDT (desktop).
///
/// Regroupe : sélection d'onglet, bucketize (todo/done/all), récupération
/// de l'onglet courant, et chaîne filtre/lazy.
///
/// Le state d'onglet est local au composant qui consomme le hook — il
/// n'est pas partagé entre les écrans mobile et desktop (seul un d'entre
/// eux est monté à un instant donné).
export function useReviewView(questions: Question[]) {
  const { progress, hydrated } = useProgress();
  const [tab, setTab] = useState<ReviewTab>("todo");

  const buckets: ReviewBuckets = useMemo(
    () => bucketize(questions, hydrated ? progress.answers : {}),
    [questions, progress.answers, hydrated],
  );

  const tabItems =
    tab === "todo" ? buckets.todo : tab === "done" ? buckets.done : buckets.all;

  const filter = useQuestionFilter(tabItems);

  return { tab, setTab, buckets, tabItems, filter, hydrated };
}
