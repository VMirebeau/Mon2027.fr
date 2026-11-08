"use client";

/// Composants UI partagés du mode "sélection PDF" entre Réviser mobile et
/// desktop : la pill "Sélectionner pour PDF" + la toolbar quand active, et
/// la sticky bar de bas d'écran "Exporter X questions". L'état vit dans le
/// hook `usePdfSelection`.

import type { CSSProperties } from "react";

export function PdfSelectToolbar({
  selectMode,
  selectedCount,
  visibleCount,
  onEnter,
  onExit,
  onSelectAllVisible,
  onClear,
  large = false,
}: {
  selectMode: boolean;
  selectedCount: number;
  visibleCount: number;
  onEnter: () => void;
  onExit: () => void;
  onSelectAllVisible: () => void;
  onClear: () => void;
  large?: boolean;
}) {
  // Pré-mode : on ne rend rien — l'entrée se fait via le bouton dans le
  // HomeHeader (cf. PdfHeaderButton + useExposePdfHeaderSelectAction).
  // `onEnter` reste dispo pour les call sites qui voudraient un trigger
  // inline (aucun actuellement, mais le contrat reste).
  if (!selectMode) {
    void onEnter;
    return null;
  }
  return (
    <div
      style={{
        marginTop: large ? 18 : 12,
        padding: large ? "12px 14px" : "10px 12px",
        background: "var(--yellow)",
        border: "1.5px solid var(--ink)",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        maxWidth: large ? 880 : undefined,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: large ? 13 : 12,
          color: "var(--ink)",
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
      </span>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={onSelectAllVisible} style={toolbarBtn}>
        Tout ({visibleCount})
      </button>
      <button type="button" onClick={onClear} style={toolbarBtn}>
        Aucune
      </button>
      <button
        type="button"
        onClick={onExit}
        style={{ ...toolbarBtn, color: "var(--ink-mute)" }}
      >
        Annuler
      </button>
    </div>
  );
}

const toolbarBtn: CSSProperties = {
  background: "transparent",
  border: 0,
  padding: "4px 6px",
  fontFamily: "var(--font-display)",
  fontWeight: 500,
  fontSize: 12.5,
  color: "var(--ink-soft)",
  textDecoration: "underline",
  textDecorationColor: "var(--rule)",
  textUnderlineOffset: 3,
  cursor: "pointer",
};

export function PdfSelectionFooter({
  selectedIds,
  onExit,
  large = false,
}: {
  selectedIds: string[];
  onExit: () => void;
  large?: boolean;
}) {
  const count = selectedIds.length;
  const capped = selectedIds.slice(0, 200);
  const href = `/livret?ids=${capped.join(",")}&from=review`;
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        padding: large
          ? "14px 24px calc(14px + env(safe-area-inset-bottom, 0px))"
          : "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
        background: "var(--cream-warm)",
        borderTop: "1.5px solid var(--ink)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        zIndex: 30,
      }}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          // Ferme le mode après l'ouverture du nouvel onglet — sinon la
          // page de retour montre encore les cases cochées sans signal.
          setTimeout(onExit, 0);
        }}
        style={{
          flex: large ? "0 1 480px" : 1,
          background: "var(--yellow)",
          color: "var(--ink)",
          border: "1.5px solid var(--ink)",
          borderRadius: 12,
          padding: large ? "14px 20px" : "12px 16px",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: large ? 15 : 14,
          textAlign: "center",
          textDecoration: "none",
          boxShadow: "3px 4px 0 var(--ink)",
        }}
      >
        Exporter {count} question{count > 1 ? "s" : ""} en PDF
      </a>
    </div>
  );
}

export function PdfSelectIcon({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        border: "1.5px solid var(--ink)",
        background: checked ? "var(--ink)" : "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--cream)",
        flexShrink: 0,
      }}
    >
      {checked ? (
        <svg
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
    </span>
  );
}
