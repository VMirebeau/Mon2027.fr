"use client";

import { useMemo } from "react";
import { AppFooter } from "./app-nav";
import { EmptyHint } from "../empty-hint";
import { FavoriteToggle } from "../favorite-toggle";
import { FilterBar, ListSentinel } from "../filter-bar";
import { ThemeBadge } from "../theme-badge";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { useExposePdfHeaderDirectAction } from "@/lib/use-pdf-shell";
import { useQuestionFilter } from "@/lib/use-question-filter";
import { useProgress } from "@/lib/use-progress";
import { listFavorites } from "@/lib/progress";
import type { NavTarget, Question } from "@/lib/types";

/// Page Favoris desktop. Layout dt-page/dt-content. Liste en colonne unique
/// large pour préserver la lisibilité (les questions sont longues). Actions
/// globales (défi sur favoris, export PDF) en placeholders.
export function FavoritesDT({
  questions,
  onPlay,
  onDefiFromFavorites,
  onNavigate,
}: {
  questions: Question[];
  onPlay: (q: Question) => void;
  /// Lance le wizard de défi directement sur A2bis (multi-select favoris).
  onDefiFromFavorites?: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  const { progress, hydrated } = useProgress();
  // Memoize : cf. screens/favorites.tsx pour la rationale (Map de 400 entrées
  // sinon reconstruite à chaque render).
  const byId = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );
  const favs = useMemo(() => {
    const ids = hydrated ? listFavorites(progress) : [];
    return ids
      .map((id) => byId.get(id))
      .filter((q): q is Question => q !== undefined);
  }, [byId, hydrated, progress]);
  const canDefi = favs.length >= 1 && !!onDefiFromFavorites;

  // Publie l'action export PDF au header (cf. screens/favorites.tsx).
  const exportHref = `/livret?ids=${favs.slice(0, 200).map((q) => q.id).join(",")}&from=favorites`;
  useExposePdfHeaderDirectAction(exportHref, favs.length);

  return (
    <>
      <div className="dt-page">
        <div className="dt-content" style={{ paddingTop: 32, paddingBottom: 48 }}>
          <header style={{ maxWidth: 720 }}>
            <div
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
                marginBottom: 12,
              }}
            >
              Tes questions marquées
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(40px, 5vw, 64px)",
                lineHeight: 1,
                letterSpacing: "-0.035em",
                margin: 0,
                textWrap: "balance",
              }}
            >
              Favoris{" "}
              <span style={{ color: "var(--coral)" }}>
                {favs.length > 0 ? `· ${favs.length}` : ""}
              </span>
            </h1>
            <p
              style={{
                marginTop: 20,
                fontSize: 18,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
                maxWidth: 640,
                textWrap: "balance",
              }}
            >
              {favs.length === 0
                ? "Les questions qui te parlent, mises de côté pour les relire, les rejouer ou en faire un défi sur mesure."
                : "Tu peux rejouer une question (clic sur la carte), la retirer (étoile), ou défier un proche sur ta sélection."}
            </p>
          </header>

          {favs.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {canDefi ? (
                <DefiCta onClick={onDefiFromFavorites!} count={favs.length} />
              ) : null}
              <FavoritesList favs={favs} onPlay={onPlay} />
            </>
          )}
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}

function EmptyState() {
  return (
    <EmptyHint
      variant="block"
      large
      title="Pas encore de favoris."
      icon={
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "var(--yellow)",
            border: "1.5px solid var(--ink)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg
            width={32}
            height={32}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
      }
    >
      Pendant une partie, clique sur l&apos;étoile en haut de l&apos;écran pour garder une question ici.
    </EmptyHint>
  );
}

function FavoritesList({
  favs,
  onPlay,
}: {
  favs: Question[];
  onPlay: (q: Question) => void;
}) {
  const filter = useQuestionFilter(favs);
  // En desktop on est plus tolérant que mobile car les chips ne squizzent
  // pas la lecture — seuil à 6.
  const showFilterBar = favs.length > 6;
  const list = showFilterBar ? filter.filtered : favs;
  return (
    <div style={{ maxWidth: 880 }}>
      {showFilterBar ? (
        <div style={{ marginTop: 40 }}>
          <FilterBar
            search={filter.search}
            setSearch={filter.setSearch}
            themesWithCounts={filter.themesWithCounts}
            activeThemes={filter.activeThemes}
            toggleTheme={filter.toggleTheme}
            clearThemes={filter.clearThemes}
            totalShown={filter.filtered.length}
            totalInBase={favs.length}
            countLabelSuffix="favoris"
            large
          />
        </div>
      ) : null}
      {list.length === 0 ? (
        <FilteredEmpty />
      ) : (
        <LazyFavoritesList items={list} onPlay={onPlay} largeOffset={!showFilterBar} />
      )}
    </div>
  );
}

function LazyFavoritesList({
  items,
  onPlay,
  largeOffset,
}: {
  items: Question[];
  onPlay: (q: Question) => void;
  /// Top margin plus important quand pas de FilterBar au-dessus (sinon le
  /// gap visuel entre hero/CTA et liste est trop tassé).
  largeOffset?: boolean;
}) {
  const { visible, sentinelRef, hasMore } = useInfiniteList(items);
  return (
    <div
      style={{
        marginTop: largeOffset ? 40 : 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {visible.map((q) => (
        <FavoriteRow key={q.id} q={q} onPlay={() => onPlay(q)} />
      ))}
      <ListSentinel
        sentinelRef={sentinelRef}
        hasMore={hasMore}
        totalCount={items.length}
        countLabelSuffix="favoris"
      />
    </div>
  );
}

function FilteredEmpty() {
  return (
    <EmptyHint variant="subtle" large>
      Aucun favori ne correspond. Essaie d&apos;élargir.
    </EmptyHint>
  );
}

function FavoriteRow({ q, onPlay }: { q: Question; onPlay: () => void }) {
  return (
    <div
      style={{
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 16,
        padding: "18px 18px 18px 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        transition: "border-color 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--rule)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--rule-soft)";
      }}
    >
      <button
        type="button"
        onClick={onPlay}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: 0,
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <ThemeBadge label={q.theme} size="sm" />
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 17,
            lineHeight: 1.3,
            color: "var(--ink)",
          }}
        >
          {q.question}
        </div>
      </button>
      <FavoriteToggle questionId={q.id} size="md" />
    </div>
  );
}

function DefiCta({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 40,
        maxWidth: 880,
        width: "100%",
        background: "var(--yellow)",
        color: "var(--ink)",
        border: "1.5px solid var(--ink)",
        borderRadius: 22,
        padding: "24px 28px",
        boxShadow: "4px 6px 0 var(--ink)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 20,
        alignItems: "center",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        textAlign: "left",
        transition: "transform 0.18s cubic-bezier(.2,.7,.2,1), box-shadow 0.18s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translate(-2px, -2px)";
        e.currentTarget.style.boxShadow = "6px 8px 0 var(--ink)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translate(0, 0)";
        e.currentTarget.style.boxShadow = "4px 6px 0 var(--ink)";
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "var(--ink)",
          color: "var(--yellow)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
        aria-hidden
      >
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 9.5 22 2" />
          <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
        </svg>
      </span>
      <div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          Défier sur tes favoris
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-body)",
            fontWeight: 400,
            fontSize: 14,
            color: "var(--ink-soft)",
            lineHeight: 1.4,
          }}
        >
          {count === 1
            ? "Envoie cette question en défi à un·e proche."
            : `Choisis jusqu'à 10 questions parmi tes ${count} favoris et envoie le défi à un·e proche.`}
        </div>
      </div>
      <span
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-soft)",
          whiteSpace: "nowrap",
        }}
      >
        Choisir →
      </span>
    </button>
  );
}
