"use client";

/// Bouton d'export PDF contextuel rendu dans les barres de nav globales
/// (mobile HomeHeader, desktop AppNav). Apparaît seulement quand une scène
/// a publié une action (`useExposePdfHeader…Action`). Cf. use-pdf-shell.tsx.
///
/// Visuel volontairement aligné sur UserMenu : pas de cercle, juste l'icône
/// — un cercle ferait baisser visuellement l'autre côté du header. État
/// "actif" (mode sélection allumé) signalé par le fond jaune, même couleur
/// que la toolbar "X sélectionné" et le footer "Exporter X questions" pour
/// que le joueur perçoive les trois zones comme un seul flux engagé.

import type { CSSProperties } from "react";
import { usePdfShellSafe } from "@/lib/use-pdf-shell";

export function PdfHeaderButton() {
  const shell = usePdfShellSafe();
  const action = shell?.headerAction ?? null;
  if (!action) return null;

  const isActive = action.kind === "select" && (shell?.selection.selectMode ?? false);

  // Plain icon style — aligné sur UserMenu (sans cercle). L'état actif
  // s'exprime via une pastille jaune sous l'icône, pas un cercle de bordure
  // (qui ferait conflit visuel avec UserMenu et avec FavoriteToggle).
  const base: CSSProperties = {
    width: 36,
    height: 36,
    display: "grid",
    placeItems: "center",
    background: isActive ? "var(--yellow)" : "transparent",
    border: 0,
    borderRadius: isActive ? 10 : 0,
    color: "var(--ink)",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
    transition: "background 120ms ease, border-radius 120ms ease",
  };

  const icon = (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 12 15 15" />
    </svg>
  );

  if (action.kind === "direct") {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Exporter ${action.count} questions en PDF`}
        title={`Exporter en PDF (${action.count})`}
        style={{ ...base, textDecoration: "none" }}
      >
        {icon}
      </a>
    );
  }

  // kind === "select" — toggle entrée/sortie du mode sélection. Avant, le
  // bouton appelait toujours `enterSelectMode` qui resettait la sélection
  // en cours ; mauvaise UX (tap accidentel = perte du travail). Désormais
  // tap = entrée si off, exit si on.
  const handleClick = () => {
    if (isActive) {
      shell?.selection.exitSelectMode();
    } else {
      action.onClick();
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isActive}
      aria-label={
        isActive
          ? "Quitter le mode sélection PDF"
          : "Sélectionner des questions pour PDF"
      }
      title={isActive ? "Mode sélection actif, taper pour quitter" : "Sélectionner pour PDF"}
      style={base}
    >
      {icon}
    </button>
  );
}
