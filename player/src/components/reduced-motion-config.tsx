"use client";

import { MotionConfig } from "framer-motion";

/// Respect de « Réduire les animations » (prefers-reduced-motion) pour tout
/// ce qui passe par framer-motion : soulignement magique de la nav, toasts
/// de badge, etc. `reducedMotion="user"` coupe les transformations animées
/// (déplacements, échelles) et garde les fondus. Les animations CSS sont
/// neutralisées de leur côté par la règle globale de globals.css.
///
/// Composant client dédié : layout.tsx est un composant serveur, il ne peut
/// pas porter directement le contexte React de MotionConfig.
export function ReducedMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
