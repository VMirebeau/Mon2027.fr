"use client";

/// Bouton étoile pour marquer/démarquer une question en favori.
///
/// Lit/écrit useProgress directement — pas de props de data, juste le
/// questionId. Optimistic immédiat (le toggle modifie le store, donc le
/// composant se re-render avec le nouvel état tout de suite, sans attente
/// réseau). La sync server-side (UserSnapshot) se fait en background via
/// ProgressProvider.
///
/// Tailles : "sm" (16px, pour les lignes denses) et "md" (20px, par défaut).
/// L'aria-label change selon l'état pour le screenreader.

import { isFavorite } from "@/lib/progress";
import { useProgress } from "@/lib/use-progress";

type Size = "sm" | "md";

export function FavoriteToggle({
  questionId,
  size = "md",
  /** Permet de passer une couleur custom pour l'étoile remplie. Default
   *  jaune (cohérent avec le badge favoris du header). */
  filledColor = "var(--yellow-deep)",
  /** Couleur de l'étoile vide. Default --ink-mute (cohérent avec les fonds
   *  cream-warm). Sur fond coloré (cards Réviser thématiques), surcharger
   *  avec --ink-soft pour rester visible. */
  unfilledColor,
  /** Optionnel : surcharge le aria-label (par défaut on génère selon état). */
  ariaLabel,
}: {
  questionId: string;
  size?: Size;
  filledColor?: string;
  unfilledColor?: string;
  ariaLabel?: string;
}) {
  const { progress, hydrated, toggleFavorite } = useProgress();
  // Avant hydratation : on rend l'état non-favori pour matcher le SSR
  // (DEFAULT_PROGRESS = favoris vide). Le re-render post-hydratation
  // affichera l'étoile pleine si la question est effectivement favorite.
  const filled = hydrated && isFavorite(progress, questionId);

  const px = size === "sm" ? 16 : 20;
  const padding = size === "sm" ? 6 : 8;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(questionId);
      }}
      aria-pressed={filled}
      aria-label={
        ariaLabel ??
        (filled ? "Retirer des favoris" : "Ajouter aux favoris")
      }
      suppressHydrationWarning
      className={`icon-btn${filled ? " icon-btn--on" : ""}`}
      style={{
        padding,
        /* La couleur "filled" (jaune deep) doit primer sur le hover de
           .icon-btn (qui force --ink). On override en inline. Pour l'état
           vide, n'override que si une couleur custom est demandée. */
        color: filled ? filledColor : unfilledColor,
      }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 1.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
