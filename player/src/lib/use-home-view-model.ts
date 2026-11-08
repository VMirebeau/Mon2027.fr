"use client";

import { useProgress } from "./use-progress";
import {
  answeredCount,
  correctCount,
  currentStreak,
  hasAnsweredToday,
  isDue,
} from "./progress";
import { bucketize } from "./review-buckets";
import type { Question } from "./types";
import { dailyHeroVariantFor } from "@/components/home-bits";

/// Agrégat dérivé du progress local et de la question du jour, utilisé
/// par les écrans Home mobile et desktop. Centralise les compteurs
/// (answered/correct/streak), l'état d'hydratation, et la variante du hero.
///
/// Pourquoi un hook plutôt qu'un helper : `useProgress` est lui-même un
/// hook, donc tout consommateur paie de toute façon un hook. En
/// regroupant ici, on garantit qu'aucun écran ne calcule différemment.
export function useHomeViewModel(
  dailyQuestion: Question | null,
  /// Catalogue publié. Fourni, le badge « N à revoir » est calculé exactement
  /// comme l'onglet « À revoir » de Réviser (bucketize sur les questions
  /// publiées) : sans lui, les réponses à des questions dépubliées gonflaient
  /// le badge de l'accueil par rapport à Réviser.
  questions?: Question[],
) {
  const { progress, hydrated } = useProgress();

  const answered = hydrated ? answeredCount(progress) : 0;
  const correct = hydrated ? correctCount(progress) : 0;
  const correctPct =
    answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const streak = hydrated ? currentStreak(progress) : 0;

  // hasData drive l'affichage du mode "Réviser" et le passage stats vs
  // accroche. Avant hydratation, on rend l'état "premier visiteur" pour
  // matcher le SSR (DEFAULT_PROGRESS = pas de réponses).
  const hasData = hydrated && answered > 0;

  const dailyRecord =
    dailyQuestion && hydrated ? progress.answers[dailyQuestion.id] : undefined;
  const heroState = dailyHeroVariantFor(
    Boolean(dailyRecord),
    dailyRecord?.correct ?? null,
  );

  const dailyAnsweredToday = hydrated ? hasAnsweredToday(progress) : false;

  // Compteur "à revoir" : depuis l'ajout de la répétition espacée (cf.
  // srsNext dans progress.ts), c'est le nombre de questions DUES maintenant
  // selon SRS — pas juste les fausses. Inclut donc les bonnes réponses
  // dont l'intervalle d'oubli est dépassé, ce qui matche ce que l'écran
  // Réviser affiche dans son onglet "À revoir". Pour les utilisateurs
  // legacy sans srs sur leurs réponses, isDue retombe sur "fausse = due,
  // juste = pas due" (comportement antérieur), donc pas de régression.
  const reviewCount = !hydrated
    ? 0
    : questions
      ? bucketize(questions, progress.answers).todo.length
      : Object.values(progress.answers).filter((a) => isDue(a)).length;
  // Variable `correct` conservée car réutilisée dans correctPct ci-dessus.
  void correct;

  return {
    hydrated,
    answered,
    correct,
    correctPct,
    streak,
    hasData,
    heroState,
    dailyAnsweredToday,
    reviewCount,
  };
}
