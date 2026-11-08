"use client";

/// Icônes SVG inline, source unique de vérité.
///
/// Avant ce fichier, les mêmes pictos (Star, Send, Check, Eye, Bell, Clock,
/// Arrow, Sparkle) étaient redéfinis dans `defi-bits.DI` et `home-bits.HomeIcon`
/// avec un viewBox identique → 8 SVG dupliqués. Cette redéfinition vit ici,
/// et les deux ensembles (`DI`, `HomeIcon`) re-exportent depuis ce module.
///
/// Style monoline, viewBox 24, `currentColor`. Taille pilotée par prop `size`,
/// stroke-width par défaut adapté à la taille de l'icône.

import type React from "react";

type Props = { size?: number; strokeWidth?: number };

function svg(
  size: number,
  strokeWidth: number,
  children: React.ReactNode,
  fill?: boolean,
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// ============================================================================
// Pictos atomiques — réutilisables sans dépendance à un contexte (defi/home/…).
// ============================================================================

export function StarIcon({ size = 16, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  );
}

export function SendIcon({ size = 16, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <path d="M14.5 9.5 22 2" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </>,
  );
}

export function CheckIcon({ size = 14, strokeWidth = 2.6 }: Props) {
  return svg(size, strokeWidth, <path d="m5 12 5 5L20 7" />);
}

export function XIcon({ size = 14, strokeWidth = 2.6 }: Props) {
  return svg(size, strokeWidth, <path d="M6 6l12 12M18 6 6 18" />);
}

export function EyeIcon({ size = 14, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
      <circle cx={12} cy={12} r={3} />
    </>,
  );
}

export function BellIcon({ size = 14, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>,
  );
}

export function ClockIcon({ size = 12, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <circle cx={12} cy={12} r={10} />
      <polyline points="12 6 12 12 16 14" />
    </>,
  );
}

export function ArrowRightIcon({ size = 16, strokeWidth = 2.2 }: Props) {
  return svg(size, strokeWidth, <path d="M5 12h14M13 5l7 7-7 7" />);
}

export function SparkleIcon({ size = 14, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <path d="m12 6-2 4-4 2 4 2 2 4 2-4 4-2-4-2-2-4Z" />,
  );
}

/// Soleil — métaphore "du jour", déjà utilisée par bottom-tab-bar.tsx pour
/// le tab "Du jour". Promu en icône partagée pour le CTA "Explorer la
/// question du jour" de la page résultats (auparavant DI.Sparkle, dont la
/// forme losange n'évoquait pas la périodicité quotidienne).
export function SunIcon({ size = 14, strokeWidth = 1.8 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>,
  );
}

export function ChevDownIcon({ size = 14, strokeWidth = 2 }: Props) {
  return svg(size, strokeWidth, <polyline points="6 9 12 15 18 9" />);
}

export function RefreshIcon({ size = 14, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>,
  );
}

export function CopyIcon({ size = 16, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <rect x={9} y={9} width={13} height={13} rx={2} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
  );
}

export function ShareIcon({ size = 16, strokeWidth = 2 }: Props) {
  return svg(
    size,
    strokeWidth,
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1={12} y1={2} x2={12} y2={15} />
    </>,
  );
}

export function BackIcon({ size = 16, strokeWidth = 2 }: Props) {
  return svg(size, strokeWidth, <path d="m15 6-6 6 6 6" />);
}

export function TrashIcon({ size = 14, strokeWidth = 1.8 }: Props) {
  return svg(
    size,
    strokeWidth,
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6" />,
  );
}

export function DotsIcon({ size = 16 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx={6} cy={12} r={1.6} />
      <circle cx={12} cy={12} r={1.6} />
      <circle cx={18} cy={12} r={1.6} />
    </svg>
  );
}
