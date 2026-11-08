"use client";

/// Badge thème harmonisé — composant unique pour TOUS les libellés
/// "thème" affichés en mode pill court (≠ cartes Découvrir qui sont des
/// surfaces pleines, et ≠ rail Question qui assume une variante affirmée
/// — cf. variant "solid"). Centralise pastille couleur + label + sizing
/// pour éviter qu'on diverge à 5 endroits différents (Review chips,
/// recap cards, favoris, search results, etc.).
///
/// Trois tailles : "xs" (inline dans une row dense), "sm" (default, recap
/// cards, filter chips), "md" (en-tête de section). La taille pilote padding,
/// font-size, et le diamètre du dot.
///
/// Deux variants visuels :
///   - "soft" (défaut) : fond crème neutre + bordure très light + dot coloré
///     devant. Lecture rapide en liste, ne sature pas l'œil.
///   - "solid" : fond couleur du thème (palette franche) + dot ink devant.
///     Réservé aux contextes "foyer unique" (rail Question desktop, header
///     d'une page dédiée). À utiliser avec parcimonie — cf. notice dans
///     docs/design (ou DESIGN.md si présent).
///
/// `interactive` : si true, ajoute un cursor + hover/active subtils
/// (utilisé par les chips de filtre Review qui sont cliquables).
/// `active` : pour les filter-chips multi-select, override les couleurs
/// pour un état sélectionné fort (ink fill, contrasté).

import type { CSSProperties } from "react";
import { themeColor } from "@/lib/theme-colors";

export type ThemeBadgeSize = "xs" | "sm" | "md";
export type ThemeBadgeVariant = "soft" | "solid";

const SIZE: Record<
  ThemeBadgeSize,
  { padX: number; padY: number; gap: number; font: number; dot: number; radius: number }
> = {
  xs: { padX: 8, padY: 3, gap: 5, font: 10, dot: 7, radius: 999 },
  sm: { padX: 10, padY: 4, gap: 6, font: 10.5, dot: 8, radius: 999 },
  md: { padX: 12, padY: 5, gap: 7, font: 11.5, dot: 9, radius: 999 },
};

export type ThemeBadgeProps = {
  label: string;
  size?: ThemeBadgeSize;
  variant?: ThemeBadgeVariant;
  /// Quand utilisé en bouton cliquable (chip de filtre). Ajoute un
  /// cursor pointer + hover de la bordure. Rend en <button> ; sans
  /// interactive, rend en <span> non focusable.
  interactive?: boolean;
  /// Pour les chips de filtre multi-select : état "actif", force ink fill +
  /// dot inversé. Couvre 95% des besoins d'override sans exposer plus de
  /// props.
  active?: boolean;
  /// Optionnel : enfant rendu APRÈS le label (typiquement un compteur
  /// "47", ou un sous-libellé "à jouer"). On le wrappe avec une couleur
  /// atténuée pour rester secondaire au label.
  trailing?: React.ReactNode;
  /// Callback si interactive=true. Ignoré sinon.
  onClick?: () => void;
  /// aria-pressed pour les chips de filtre multi-select.
  ariaPressed?: boolean;
  /// Override de style — usage rare (ex. forcer flexShrink dans une grille).
  style?: CSSProperties;
};

export function ThemeBadge({
  label,
  size = "sm",
  variant = "soft",
  interactive = false,
  active = false,
  trailing,
  onClick,
  ariaPressed,
  style,
}: ThemeBadgeProps) {
  const s = SIZE[size];
  const color = themeColor(label);
  // ── Décide les couleurs en cascade : actif > solid > soft ─────────────
  let background: string;
  let textColor: string;
  let borderColor: string;
  let dotColor: string;
  let trailingColor: string;
  if (active) {
    background = "var(--ink)";
    textColor = "var(--cream-warm)";
    borderColor = "var(--ink)";
    dotColor = color;
    trailingColor = "var(--yellow)";
  } else if (variant === "solid") {
    background = color;
    textColor = "var(--ink)";
    borderColor = "var(--ink)";
    dotColor = "var(--ink)";
    trailingColor = "var(--ink-soft)";
  } else {
    background = "rgba(0,0,0,0.04)";
    textColor = "var(--ink-soft)";
    borderColor = "rgba(0,0,0,0.08)";
    dotColor = color;
    trailingColor = "var(--ink-mute)";
  }
  const Tag = interactive ? "button" : "span";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      aria-pressed={ariaPressed}
      suppressHydrationWarning
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        padding: `${s.padY}px ${s.padX}px ${s.padY}px ${s.padX - 2}px`,
        background,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: s.radius,
        fontFamily: "var(--font-mono)",
        fontSize: s.font,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        lineHeight: 1.1,
        cursor: interactive ? "pointer" : "default",
        // Évite que la pastille flotte par dessus le contenu si le parent
        // a un `overflow: hidden`.
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: interactive
          ? "background var(--t-base), border-color var(--t-base), color var(--t-base)"
          : undefined,
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          width: s.dot,
          height: s.dot,
          borderRadius: 999,
          background: dotColor,
          flexShrink: 0,
        }}
      />
      {label}
      {trailing != null ? (
        <span style={{ color: trailingColor, fontWeight: 500, marginLeft: 2 }}>
          {trailing}
        </span>
      ) : null}
    </Tag>
  );
}
