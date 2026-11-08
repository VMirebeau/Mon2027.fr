import type React from "react";
import Image from "next/image";

/// Illustrations « sticker » brutalistes, une par thème : aplats encre +
/// crème, contour épais, ombre portée dure — même grammaire que les
/// `pop-card`. Fichiers statiques dans `public/illustrations/themes/`
/// (SVG générés par gpt-image-2.6 en sortie vectorielle native, puis
/// nettoyés), servis tels quels : `next/image` ne ré-encode jamais un
/// `.svg`.
///
/// Purement décoratives : `alt=""`, le libellé du thème porte le sens.
///
/// Liste explicite plutôt que dérivée de `THEMES` : un thème ajouté sans
/// illustration doit retomber sur « pas d'image », pas sur une image cassée.
const ILLUSTRATED = new Set([
  "immigration",
  "securite",
  "economie",
  "travail",
  "climat",
  "sante",
  "ecole",
  "logement",
  "institutions",
  "services-publics",
  "egalites",
  "numerique-ia",
  "international",
]);

export function ThemeIllustration({
  themeId,
  size,
  className,
  style,
}: {
  themeId: string;
  size: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!ILLUSTRATED.has(themeId)) return null;
  return (
    <Image
      src={`/illustrations/themes/${themeId}.svg`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={style}
    />
  );
}
