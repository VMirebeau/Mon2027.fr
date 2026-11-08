/// Composant logo factorisé "Mon2027" — icône squircle + texte.
///
/// Source unique pour le bandeau de marque utilisé en B1 (page de défi
/// reçu), en C (résultats), et partout où on a besoin de l'identité
/// hors AppNav. Avant ce fichier, le même JSX `<BrandIcon /> Mon<span>2027</span>`
/// était dupliqué dans 4 endroits avec des tailles/couleurs un peu différentes,
/// ce qui rendait toute évolution du logo bruyante (ex. : ajouter un espace
/// entre Mon et 2027 → 4 modifications).
///
/// La prop `href` rend le logo cliquable — utile sur les pages standalone
/// (`/d/[code]`, `/q/[slug]`) où il n'y a pas de nav app : le logo joue
/// alors le rôle d'ancre vers la home, comportement attendu sur tout site.

import Link from "next/link";
import { BrandIcon } from "./brand-icon";

type Size = "sm" | "md" | "lg";

const PRESETS: Record<
  Size,
  { icon: number; text: number; gap: number; muted: boolean }
> = {
  // Même marque que l'en-tête principal (HomeHeader) à toutes les tailles :
  // texte ink, « 2027 » coral. L'ancien ton ink-mute du `sm` donnait une
  // troisième variante du logo.
  // sm : bandeau des pages de défi (mobile) et pied de page des résultats.
  sm: { icon: 24, text: 15, gap: 8, muted: false },
  // md : taille de l'en-tête principal mobile.
  md: { icon: 28, text: 17, gap: 8, muted: false },
  // lg : header desktop de B1 — assez voyant pour ancrer l'identité.
  lg: { icon: 40, text: 22, gap: 12, muted: false },
};

export function BrandMark({
  size = "sm",
  href,
}: {
  size?: Size;
  /// Si fourni, wrappe le logo dans un `<Link>` Next.js. Sur la page de
  /// défi reçu, on passe `href="/"` pour que cliquer ramène à la home.
  href?: string;
}) {
  const p = PRESETS[size];
  const body = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: p.gap,
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: p.text,
        color: p.muted ? "var(--ink-mute)" : "var(--ink)",
        letterSpacing: "-0.015em",
      }}
    >
      <span
        aria-hidden
        style={{ display: "inline-flex", width: p.icon, height: p.icon }}
      >
        <BrandIcon size={p.icon} />
      </span>
      {/* Texte groupé dans un span : posé à nu dans le conteneur flex,
          « Mon » et « 2027 » devenaient deux éléments flex séparés par le
          `gap` — d'où le « Mon 2027 » avec une espace sur les pages de défi. */}
      <span>
        Mon<span style={{ color: "var(--coral)" }}>2027</span>
      </span>
    </span>
  );
  if (href) {
    return (
      <Link
        href={href}
        style={{ textDecoration: "none", color: "inherit" }}
        aria-label="Mon2027, accueil"
      >
        {body}
      </Link>
    );
  }
  return body;
}
