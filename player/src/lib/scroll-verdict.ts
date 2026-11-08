"use client";

/// Garde le verdict (pastille de score, bandeau « Bien vu / Pas cette fois »,
/// pastille de l'estimation) visible à la révélation.
///
/// Sur les formats longs (classement, catégorisation, pondéré, QCM long…), le
/// joueur a souvent défilé jusqu'en bas pour atteindre Valider : sans ça, le
/// verdict apparaissait hors de l'écran, ou sous les barres fixes du mobile
/// (barre d'action + languette du dossier).
///
/// Convention : l'élément qui porte LE verdict a l'attribut `data-verdict`.
/// Les marges de défilement (barres fixes, demi-panneau du dossier) sont
/// portées en CSS par `scroll-margin` sur `[data-verdict]` (globals.css), si
/// bien que `block: "nearest"` ne bouge rien quand le verdict est déjà
/// visible. Défilement doux, instantané si « Réduire les animations ».

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollVerdictIntoView(root?: ParentNode | null): void {
  if (typeof document === "undefined") return;
  const el = (root ?? document).querySelector<HTMLElement>("[data-verdict]");
  if (!el || typeof el.scrollIntoView !== "function") return;
  el.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}
