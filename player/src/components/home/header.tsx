"use client";

/// HomeHeader — logo Mon2027 + UserMenu.
/// Rendu autonome : on n'utilise pas <AppHeader> de ui-bits pour rester fidèle
/// au design (taille du logo, espacement, options divider sur desktop).
/// Le cluster droit est volontairement compact : un seul bouton User qui
/// expose Mon compte / Mes stats / Mes favoris via un dropdown.

import { BrandIcon } from "../brand-icon";
import { PdfHeaderButton } from "../pdf-header-button";
import { UserMenu } from "../user-menu";
import type { NavTarget } from "@/lib/types";

export type HomeHeaderProps = {
  large?: boolean;
  /** Hairline en bas, utile sur desktop pour séparer du contenu. */
  divider?: boolean;
  /** Pour câbler les items du dropdown UserMenu (Mes favoris). */
  onNavigate?: (target: NavTarget) => void;
};

export function HomeHeader({
  large = false,
  divider = false,
  onNavigate,
}: HomeHeaderProps) {
  return (
    <div
      className="no-select"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: large ? "20px 32px" : "16px 20px",
        borderBottom: divider ? "1px solid var(--rule-soft)" : 0,
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--cream)",
      }}
    >
      <button
        type="button"
        onClick={() => onNavigate?.("home")}
        aria-label="Retour à l'accueil"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-display)",
          background: "transparent",
          border: 0,
          padding: 0,
          color: "var(--ink)",
          cursor: onNavigate ? "pointer" : "default",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            width: large ? 32 : 28,
            height: large ? 32 : 28,
          }}
          aria-hidden
        >
          <BrandIcon size={large ? 32 : 28} />
        </span>
        <span
          style={{
            fontWeight: 700,
            fontSize: large ? 19 : 17,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Mon<span style={{ color: "var(--coral)" }}>2027</span>
        </span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <PdfHeaderButton />
        <UserMenu onNavigate={onNavigate} />
      </div>
    </div>
  );
}

