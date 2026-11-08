"use client";

import type { ReactNode } from "react";

/// Empty state partagé entre review/favorites mobile + desktop.
///
/// Deux variantes :
///   - "block"  : bordure dashed, padding généreux, utilisé quand on bloque
///                un écran entier (rien à afficher, tab vide).
///   - "subtle" : bordure solide fine, padding compact, utilisé quand un
///                filtre vide la liste mais que le reste de l'écran a du sens.
///
/// `large` agrandit pour les écrans desktop. Tous les autres écarts (padding,
/// title font-size, max-width) découlent de ces deux switches.
///
/// `icon` est optionnel : composant favoris l'utilise pour l'étoile, review
/// reste sans icon.

export function EmptyHint({
  variant = "subtle",
  large = false,
  icon,
  title,
  children,
}: {
  variant?: "block" | "subtle";
  large?: boolean;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  const isBlock = variant === "block";
  return (
    <div
      style={{
        marginTop: isBlock ? (large ? 48 : 24) : large ? 24 : 16,
        padding: isBlock
          ? large
            ? "40px 32px"
            : "32px 24px"
          : large
            ? "24px 28px"
            : "20px 18px",
        background: "var(--cream-warm)",
        border: isBlock ? "1.5px dashed var(--rule)" : "1.5px solid var(--rule-soft)",
        borderRadius: isBlock ? (large ? 22 : 18) : 14,
        textAlign: title ? "center" : "left",
        maxWidth: large ? (isBlock ? 540 : 640) : undefined,
      }}
    >
      {icon ? <div style={{ margin: "0 auto 16px", display: "grid", placeItems: "center" }}>{icon}</div> : null}
      {title ? (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: large ? 22 : 18,
            letterSpacing: large ? "-0.02em" : "-0.015em",
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
      ) : null}
      <div
        style={{
          marginTop: title ? 8 : 0,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: large ? 14 : 13.5,
          color: "var(--ink-soft)",
          lineHeight: 1.5,
          textWrap: title ? "balance" : undefined,
          maxWidth: title && !large ? 320 : undefined,
          margin: title && !large ? "8px auto 0" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
