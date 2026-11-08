"use client";

/// Barre de filtre commune : input de recherche + chips de thèmes
/// multi-select + indicateur "X sur Y". Utilisée par Réviser et Favoris.
///
/// La prop `large` ajuste le padding/sizes pour les variantes desktop.

import type { RefObject } from "react";
import { ThemeBadge } from "./theme-badge";

export function FilterBar({
  search,
  setSearch,
  themesWithCounts,
  activeThemes,
  toggleTheme,
  clearThemes,
  totalShown,
  totalInBase,
  countLabelSuffix = "questions",
  large,
}: {
  search: string;
  setSearch: (s: string) => void;
  themesWithCounts: Array<{ theme: string; count: number }>;
  activeThemes: Set<string>;
  toggleTheme: (theme: string) => void;
  clearThemes: () => void;
  /// Nombre d'items dans la liste filtrée (visible après application des filtres).
  totalShown: number;
  /// Nombre d'items dans la liste de base (avant application des filtres).
  totalInBase: number;
  /// Mot affiché à la place de "questions" (ex: "favoris").
  countLabelSuffix?: string;
  large?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: large ? 28 : 14,
        display: "flex",
        flexDirection: "column",
        gap: large ? 14 : 10,
      }}
    >
      <SearchInput value={search} onChange={setSearch} large={large} />
      {themesWithCounts.length > 1 ? (
        <ThemeChips
          themes={themesWithCounts}
          active={activeThemes}
          onToggle={toggleTheme}
          onClear={clearThemes}
          large={large}
        />
      ) : null}
      {(search.trim() || activeThemes.size > 0) && totalShown !== totalInBase ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}
        >
          {totalShown} sur {totalInBase} {countLabelSuffix}
        </div>
      ) : null}
    </div>
  );
}

/// Exporté pour usage hors FilterBar (cf. screens/themes.tsx, où la
/// recherche surfait des questions directement sans les chips de filtre).
/// Sans cet export, le pattern visuel "input lentille à gauche + clear à
/// droite" devait être redessiné à chaque call site → divergence du look.
export function SearchInput({
  value,
  onChange,
  large,
  placeholder = "Rechercher…",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  large?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 14,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--ink-mute)",
          pointerEvents: "none",
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx={11} cy={11} r={8} />
          <line x1={21} y1={21} x2={16.65} y2={16.65} />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="soft-row"
        style={{
          /* .soft-row pose border + radius + transition. On surcharge le
             radius (sm = input dense). Le focus reprend la règle hover de
             .soft-row (border-color → ink). */
          width: "100%",
          borderRadius: "var(--radius-sm)",
          padding: large ? "12px 14px 12px 40px" : "10px 12px 10px 38px",
          fontFamily: "var(--font-body)",
          fontSize: large ? 15 : 14,
          color: "var(--ink)",
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--ink)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--rule-soft)";
        }}
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Effacer la recherche"
          style={{
            /* Cas particulier : position absolute centrée verticalement par
               translateY(-50%) — donc on n'utilise PAS .icon-btn (son
               :active scale casserait le centrage). Hover géré inline. */
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 28,
            height: 28,
            borderRadius: "var(--radius-pill)",
            background: "transparent",
            border: 0,
            color: "var(--ink-mute)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            transition: "background var(--t-base), color var(--t-base)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--hover-bg)";
            e.currentTarget.style.color = "var(--ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--ink-mute)";
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1={18} y1={6} x2={6} y2={18} />
            <line x1={6} y1={6} x2={18} y2={18} />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function ThemeChips({
  themes,
  active,
  onToggle,
  onClear,
  large,
}: {
  themes: Array<{ theme: string; count: number }>;
  active: Set<string>;
  onToggle: (theme: string) => void;
  onClear: () => void;
  large?: boolean;
}) {
  return (
    <div
      className={large ? undefined : "hide-scrollbar"}
      style={{
        display: "flex",
        gap: 6,
        flexWrap: large ? "wrap" : "nowrap",
        overflowX: large ? undefined : "auto",
        paddingBottom: large ? 0 : 4,
        alignItems: "center",
      }}
    >
      {themes.map(({ theme, count }) => {
        const on = active.has(theme);
        return (
          <ThemeBadge
            key={theme}
            label={theme}
            size="sm"
            interactive
            active={on}
            ariaPressed={on}
            onClick={() => onToggle(theme)}
            trailing={count}
          />
        );
      })}
      {active.size > 0 ? (
        <button
          type="button"
          onClick={onClear}
          style={{
            flexShrink: 0,
            background: "transparent",
            border: 0,
            padding: "5px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Tout
        </button>
      ) : null}
    </div>
  );
}

/// Sentinel d'infinite scroll + état "fin de liste". À placer en bas
/// de la liste, ref passée par useInfiniteList.
export function ListSentinel({
  sentinelRef,
  hasMore,
  totalCount,
  pageSize = 30,
  countLabelSuffix = "questions",
}: {
  sentinelRef: RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  totalCount: number;
  pageSize?: number;
  countLabelSuffix?: string;
}) {
  if (hasMore) {
    return (
      <div
        ref={sentinelRef}
        style={{
          padding: "20px 0",
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-mute)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Chargement…
      </div>
    );
  }
  if (totalCount > pageSize) {
    return (
      <div
        style={{
          padding: "16px 0 4px",
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-mute)",
          letterSpacing: "0.06em",
        }}
      >
        Fin de la liste · {totalCount} {countLabelSuffix}
      </div>
    );
  }
  return null;
}
