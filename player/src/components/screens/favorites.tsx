"use client";

import { useMemo } from "react";
import { EmptyHint } from "../empty-hint";
import { FavoriteToggle } from "../favorite-toggle";
import { FilterBar, ListSentinel } from "../filter-bar";
import { DifficultyChip } from "../formats/format-shared";
import { ThemeBadge } from "../theme-badge";
import { ScreenHeader } from "../screen-header";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { useExposePdfHeaderDirectAction } from "@/lib/use-pdf-shell";
import { useQuestionFilter } from "@/lib/use-question-filter";
import { useProgress } from "@/lib/use-progress";
import { listFavorites } from "@/lib/progress";
import type { NavTarget, Question } from "@/lib/types";

/// Page Favoris (mobile) — liste des questions marquées par l'utilisateur.
/// Quand vide, on rend une accroche pour expliquer comment en créer.
/// Quand 3+ favoris, on affiche un CTA "Défier sur ces favoris" en haut.
export function Favorites({
  questions,
  onPlay,
  onDefiFromFavorites,
  onHome,
  onNavigate,
}: {
  /// Toutes les questions publiées (pour matcher les ids de favoris).
  questions: Question[];
  /// Lance une partie avec une seule question (clic sur une carte favori).
  onPlay: (q: Question) => void;
  /// Lance le wizard de défi directement sur l'étape A2bis (multi-select
  /// favoris pré-sélectionnés). Court-circuite A1.
  onDefiFromFavorites?: () => void;
  /// Conservé pour rester compat avec AppShell. Cf. Account pour la rationale :
  /// HomeHeader + BottomTabBar suffisent à naviguer, plus de back arrow.
  onHome?: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  void onHome;
  const { progress, hydrated } = useProgress();
  // Memoize : la Map est sensible à la taille de `questions` (~400 entrées),
  // sans memoization elle se reconstruit à chaque render (par exemple à
  // chaque toggle ★ qui change `progress`).
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
  // 1 favori suffit pour défier (sélection hand-picked, plus besoin du
  // minimum 3 hérité du défi par thème).
  const canDefi = favs.length >= 1 && !!onDefiFromFavorites;

  // Publie l'action "export PDF de tous les favoris" au bouton du HomeHeader.
  // Cap à 200 ids (cf. /livret/page.tsx). Pas d'affichage si 0 favori.
  const exportHref = `/livret?ids=${favs.slice(0, 200).map((q) => q.id).join(",")}&from=favorites`;
  useExposePdfHeaderDirectAction(exportHref, favs.length);

  void onNavigate;

  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <div style={{ padding: "0 16px 24px" }}>
        <ScreenHeader
          eyebrow="Mes favoris"
          title={
            <>
              Favoris
              {favs.length > 0 ? (
                <span style={{ color: "var(--coral)" }}> · {favs.length}</span>
              ) : null}
            </>
          }
          subtitle={
            favs.length === 0
              ? "Les questions qui te parlent, mises de côté pour les relire, les rejouer ou en faire un défi."
              : "Rejoue une question, retire-la via l'étoile, ou défie un proche sur ta sélection."
          }
        />
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
  // Pas de filter bar pour les petites listes — l'overhead visuel ne se
  // justifie qu'au-dessus d'un seuil où parcourir devient pénible.
  const showFilterBar = favs.length > 8;
  const list = showFilterBar ? filter.filtered : favs;
  return (
    <div
      style={{
        marginTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}
      >
        {favs.length} question{favs.length > 1 ? "s" : ""} marquée
        {favs.length > 1 ? "s" : ""}
      </div>

      {showFilterBar ? (
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
        />
      ) : null}

      {list.length === 0 ? (
        <FilteredEmpty />
      ) : (
        <LazyFavoritesList items={list} onPlay={onPlay} />
      )}
    </div>
  );
}

function LazyFavoritesList({
  items,
  onPlay,
}: {
  items: Question[];
  onPlay: (q: Question) => void;
}) {
  const { visible, sentinelRef, hasMore } = useInfiniteList(items);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginTop: 6,
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
    <EmptyHint variant="subtle">
      Aucun favori ne correspond. Essaie d&apos;élargir.
    </EmptyHint>
  );
}

function DefiCta({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 16,
        width: "100%",
        background: "var(--yellow)",
        color: "var(--ink)",
        border: "1.5px solid var(--ink)",
        borderRadius: 18,
        padding: "16px 18px",
        boxShadow: "3px 4px 0 var(--ink)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "var(--ink)",
          color: "var(--yellow)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
        aria-hidden
      >
        <svg
          width={18}
          height={18}
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}
        >
          Défier sur tes favoris
        </div>
        <div
          style={{
            marginTop: 3,
            fontFamily: "var(--font-body)",
            fontWeight: 400,
            fontSize: 12.5,
            color: "var(--ink-soft)",
            lineHeight: 1.35,
          }}
        >
          {count === 1
            ? "Envoie cette question en défi à un·e proche."
            : `Choisis jusqu'à 10 questions parmi tes ${count} favoris et envoie le défi.`}
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "32px 24px",
        background: "var(--cream-warm)",
        border: "1.5px dashed var(--rule)",
        borderRadius: 18,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "var(--yellow)",
          border: "1.5px solid var(--ink)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 16px",
        }}
      >
        <svg
          width={28}
          height={28}
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
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
        }}
      >
        Pas encore de favoris.
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 14,
          color: "var(--ink-soft)",
          lineHeight: 1.5,
          textWrap: "balance",
          maxWidth: 320,
          margin: "8px auto 0",
        }}
      >
        Pendant que tu joues, touche l&apos;étoile en haut du dossier pour
        garder une question ici.
      </div>
    </div>
  );
}

function FavoriteRow({
  q,
  onPlay,
}: {
  q: Question;
  onPlay: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 14,
        padding: "14px 14px 14px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
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
        <div
          style={{
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <ThemeBadge label={q.theme} size="xs" />
          <DifficultyChip difficulte={q.difficulte} />
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 14,
            lineHeight: 1.3,
            color: "var(--ink)",
          }}
        >
          {q.question}
        </div>
      </button>
      <FavoriteToggle questionId={q.id} size="sm" />
    </div>
  );
}
