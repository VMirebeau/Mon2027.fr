"use client";

/// Pictogrammes pour les badges. Chaque BadgeIconKind (cf. lib/gamification)
/// est mappé sur un SVG line-art monochrome, cohérent avec le reste de l'app
/// (cf. icons.tsx, brand-icon.tsx).
///
/// On évite les emojis : ils rendent différemment d'un OS à l'autre et
/// cassent la cohérence visuelle militante/sobre de l'app.

import type { BadgeIconKind } from "@/lib/gamification";

export function BadgeIcon({
  kind,
  size = 24,
}: {
  kind: BadgeIconKind;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (kind) {
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
        </svg>
      );
    case "compass":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <polygon points="14.5 9.5 11 13 8 16 11.5 12.5 14.5 9.5" />
          <polygon points="14.5 9.5 16 8 12.5 11.5 11 13 14.5 9.5" />
        </svg>
      );
    case "library":
      return (
        <svg {...common}>
          <path d="M4 5h4v15H4zM10 7h4v13h-4zM16 5l4 1-3 14-4-1z" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "shuffle":
      return (
        <svg {...common}>
          <path d="M16 3l5 5-5 5M21 8h-5a4 4 0 0 0-4 4M3 8h3a4 4 0 0 1 4 4M16 21l5-5-5-5M21 16h-5a4 4 0 0 1-4-4" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <path d="M8 4h8v6a4 4 0 1 1-8 0zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3M9 18h6l1 3H8z" />
          <path d="M10 14h4l-.5 4h-3z" />
        </svg>
      );
    case "fire":
      return (
        <svg {...common}>
          <path d="M12 3s5 4 5 9a5 5 0 1 1-10 0 6 6 0 0 1 2-4c0 2 1 3 1 3s-1-4 2-8z" />
          <path d="M12 14a3 3 0 0 0-2 3 2 2 0 0 0 4 0c0-1-1-2-2-3z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" />
          <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "marathon":
      return (
        <svg {...common}>
          <circle cx="10" cy="5" r="2" />
          <path d="M9 10l-3 4 2 3M11 10l3 2 3-1M11 14l1 3 4 2" />
        </svg>
      );
    case "share":
      return (
        <svg {...common}>
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M8.6 10.6L15.4 7.4M8.6 13.4l6.8 3.2" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3 20v-1a5 5 0 0 1 12 0v1M14 20v-1a4 4 0 0 1 7 0v1" />
        </svg>
      );
    case "megaphone":
      return (
        <svg {...common}>
          <path d="M3 10v4l11 5V5zM14 9h3a3 3 0 0 1 0 6h-3M7 15v3a2 2 0 0 0 4 0v-1" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <polygon points="12 3 14.6 8.9 21 9.7 16.4 14 17.6 20.4 12 17.3 6.4 20.4 7.6 14 3 9.7 9.4 8.9" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-6-4-6 4z" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="8" cy="14" r="4" />
          <path d="M11 13l9-9M16 9l3 3" />
        </svg>
      );
    case "scale":
      return (
        <svg {...common}>
          <path d="M12 3v18M6 21h12M5 9h7l-3.5-5zM12 9h7l-3.5-5z" />
          <path d="M3 14a3 3 0 0 0 6 0M15 14a3 3 0 0 0 6 0" />
        </svg>
      );
    case "owl":
      return (
        <svg {...common}>
          <path d="M5 5l3 3M19 5l-3 3" />
          <circle cx="9" cy="11" r="3" />
          <circle cx="15" cy="11" r="3" />
          <circle cx="9" cy="11" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" />
          <path d="M11.5 14l.5 1 .5-1M8 16v3M16 16v3" />
        </svg>
      );
  }
}
