"use client";

import { useCallback, useMemo } from "react";
import { AppFooter } from "./app-nav";
import { EmptyHint } from "../empty-hint";
import { FilterBar, ListSentinel } from "../filter-bar";
import { PdfSelectToolbar, PdfSelectionFooter } from "../pdf-selection-bar";
import { ReviewTabs, type ReviewTab as Tab } from "../review-tabs";
import { QuestionRow } from "../screens/review";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { useExposePdfHeaderSelectAction, usePdfShell } from "@/lib/use-pdf-shell";
import { useReviewView } from "@/lib/use-review-view";
import type { NavTarget, Question } from "@/lib/types";

/// Page Réviser desktop. Layout dt-page/dt-content + AppNav.
/// "review" est l'item actif dans la nav.
///
/// Filtre (recherche + thèmes) + lazy loading mutualisés avec la version
/// mobile via useReviewView / useInfiniteList exposés depuis screens/review.tsx.
export function ReviewDT({
  questions,
  onPlay,
  onNavigate,
}: {
  questions: Question[];
  onPlay: (q: Question) => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  const { tab, setTab, buckets, tabItems, filter } = useReviewView(questions);
  const { selection: sel } = usePdfShell();
  // Cache le bouton PDF du header quand il n'y a rien à réviser — sinon
  // l'icône d'export reste affichée alors qu'un mode sélection serait vide.
  useExposePdfHeaderSelectAction(sel.enterSelectMode, tabItems.length > 0);
  const visibleIds = useMemo(
    () => filter.filtered.map((q) => q.id),
    [filter.filtered],
  );
  const selectAllVisible = useCallback(
    () => sel.selectAll(visibleIds),
    [sel, visibleIds],
  );

  const lede =
    buckets.all.length === 0
      ? "Tu n'as pas encore joué de question. Lance-en une depuis Découvrir, et tu pourras revenir ici la fixer en tête."
      : "Les questions reviennent à intervalles croissants (d'abord à 1 jour, puis 3, 7, 21…), pour qu'elles s'ancrent vraiment plutôt que de filer.";

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
              Fixer les chiffres en tête
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
              Réviser
              {tabItems.length > 0 ? (
                <span style={{ color: "var(--coral)" }}>
                  {" · "}
                  {tabItems.length}
                </span>
              ) : null}
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
              {lede}
            </p>
          </header>

          {buckets.all.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <ReviewTabs tab={tab} setTab={setTab} buckets={buckets} large />
              {tabItems.length === 0 ? (
                <TabEmpty tab={tab} />
              ) : (
                <>
                  <div style={{ maxWidth: 880 }}>
                    <FilterBar
                      search={filter.search}
                      setSearch={filter.setSearch}
                      themesWithCounts={filter.themesWithCounts}
                      activeThemes={filter.activeThemes}
                      toggleTheme={filter.toggleTheme}
                      clearThemes={filter.clearThemes}
                      totalShown={filter.filtered.length}
                      totalInBase={tabItems.length}
                      large
                    />
                  </div>
                  <div style={{ maxWidth: 880 }}>
                    <PdfSelectToolbar
                      selectMode={sel.selectMode}
                      selectedCount={sel.selected.size}
                      visibleCount={visibleIds.length}
                      onEnter={sel.enterSelectMode}
                      onExit={sel.exitSelectMode}
                      onSelectAllVisible={selectAllVisible}
                      onClear={sel.clear}
                      large
                    />
                  </div>
                  {filter.filtered.length === 0 ? (
                    <FilteredEmpty />
                  ) : (
                    <LazyDTList
                      items={filter.filtered}
                      tab={tab}
                      onPlay={onPlay}
                      selectMode={sel.selectMode}
                      selected={sel.selected}
                      onToggleSelect={sel.toggle}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {sel.selectMode && sel.selected.size > 0 ? (
        <PdfSelectionFooter
          selectedIds={[...sel.selected]}
          onExit={sel.exitSelectMode}
          large
        />
      ) : null}
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}


function EmptyState() {
  return (
    <EmptyHint variant="block" large title="Pas encore de quoi réviser.">
      Joue d&apos;abord quelques questions, puis reviens ici pour les ancrer
      au bon rythme.
    </EmptyHint>
  );
}

function TabEmpty({ tab }: { tab: Tab }) {
  const msg =
    tab === "todo"
      ? "Rien à revoir pour l'instant. Reviens quand les premières questions auront eu le temps de filer un peu, ou réponds-en de nouvelles."
      : tab === "done"
        ? "Rien de programmé pour l'instant. Chaque bonne réponse est programmée pour revenir te tester plus tard (dans 3 jours, puis 7, puis 21…)."
        : "Aucune question à revoir pour l'instant.";
  return (
    <EmptyHint variant="subtle" large>
      {msg}
    </EmptyHint>
  );
}

function FilteredEmpty() {
  return (
    <EmptyHint variant="subtle" large>
      Aucune question ne correspond à tes filtres. Essaie d&apos;élargir.
    </EmptyHint>
  );
}

function LazyDTList({
  items,
  tab,
  onPlay,
  selectMode,
  selected,
  onToggleSelect,
}: {
  items: Question[];
  tab: Tab;
  onPlay: (q: Question) => void;
  selectMode?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const { visible, sentinelRef, hasMore } = useInfiniteList(items);
  return (
    <div
      style={{
        marginTop: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 880,
        paddingBottom: selectMode ? 100 : 0,
      }}
    >
      {visible.map((q) => (
        <QuestionRow
          key={q.id}
          q={q}
          tab={tab}
          onPlay={() => onPlay(q)}
          large
          selectable={selectMode}
          selected={selected?.has(q.id)}
          onToggleSelect={onToggleSelect ? () => onToggleSelect(q.id) : undefined}
        />
      ))}
      <ListSentinel
        sentinelRef={sentinelRef}
        hasMore={hasMore}
        totalCount={items.length}
      />
    </div>
  );
}
