"use client";

/// Barrel re-export pour les atomes de la home. Le code des composants vit
/// dans `home/` (header / daily-hero / modes-grid / section-head / footer).
/// Cette indirection préserve l'API publique historique (consumers importent
/// depuis `home-bits`) tout en gardant chaque composant dans son propre
/// fichier ≤ 400 lignes.
///
/// `HomeIcon` reste défini ici parce que c'est un alias léger des icônes
/// centralisées (cf. `components/icons.tsx`) et que beaucoup de composants
/// dans `home/` y font référence — le mettre ici évite une circulaire.

import {
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  RefreshIcon,
  SendIcon,
  SparkleIcon,
  StarIcon,
} from "./icons";

type IconProps = { size?: number; className?: string };

export const HomeIcon = {
  Star: ({ size = 18 }: IconProps) => <StarIcon size={size} />,
  Bell: ({ size = 18 }: IconProps) => <BellIcon size={size} />,
  Arrow: ({ size = 16 }: IconProps) => <ArrowRightIcon size={size} />,
  Replay: ({ size = 22 }: IconProps) => <RefreshIcon size={size} />,
  Send: ({ size = 22 }: IconProps) => <SendIcon size={size} />,
  Check: ({ size = 16 }: IconProps) => <CheckIcon size={size} />,
  Eye: ({ size = 15 }: IconProps) => <EyeIcon size={size} />,
  Clock: ({ size = 13 }: IconProps) => <ClockIcon size={size} />,
  Sparkles: ({ size = 14 }: IconProps) => <SparkleIcon size={size} />,
  /// Stats : pictogramme barres — usage : header user-menu, pas dans defi.
  Stats: ({ size = 18 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M7 16V11" />
      <path d="M12 16V8" />
      <path d="M17 16V13" />
    </svg>
  ),
  /// Shuffle : flèches croisées — usage : carte "5 questions mélangées".
  Shuffle: ({ size = 22 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="M4 4l5 5" />
    </svg>
  ),
};

// Re-exports des composants déplacés dans home/.
export { HomeHeader, type HomeHeaderProps } from "./home/header";
export {
  DailyHero,
  type DailyHeroProps,
  type DailyHeroVariant,
  dailyHeroVariantFor,
} from "./home/daily-hero";
export {
  ModeCard,
  type ModeAccent,
  type ModeCardProps,
  ModesGrid,
  type ModesGridPick,
  type ModesGridProps,
} from "./home/modes-grid";
export { SectionHead } from "./home/section-head";
export {
  HomeFooter,
  type HomeFooterStats,
  SecondaryLinks,
} from "./home/footer";
