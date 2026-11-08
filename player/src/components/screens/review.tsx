"use client";

/// Page Réviser (mobile) — 3 sous-modes :
/// - À retravailler : questions où l'utilisateur a eu faux. Click → rejoue.
/// - Mes réussites  : questions où il a eu juste. Click → rejoue (consult).
/// - Tout revoir    : toutes les questions répondues, ordre récent → ancien.
///
/// Au-dessus de 30 items, filtre via recherche + chips de thèmes, rendu par
/// paquets de 30 via IntersectionObserver. Hooks et composants mutualisés
/// avec Favoris (cf. lib/use-question-filter, components/filter-bar).

import { useCallback, useMemo } from "react";
import { EmptyHint } from "../empty-hint";
import { FavoriteToggle } from "../favorite-toggle";
import { FilterBar, ListSentinel } from "../filter-bar";
import { DifficultyChip } from "../formats/format-shared";
import { ThemeBadge } from "../theme-badge";
import {
  PdfSelectIcon,
  PdfSelectToolbar,
  PdfSelectionFooter,
} from "../pdf-selection-bar";
import { ReviewTabs, type ReviewTab as Tab } from "../review-tabs";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { useExposePdfHeaderSelectAction, usePdfShell } from "@/lib/use-pdf-shell";
import { useReviewView } from "@/lib/use-review-view";
import type { NavTarget, Question } from "@/lib/types";

export function Review({
  questions,
  onPlay,
  onNavigate,
}: {
  questions: Question[];
  onPlay: (q: Question) => void;
  /// Conservé pour rester compat avec AppShell ; le HomeHeader est désormais
  /// rendu par AppShell (persistant entre scènes), pas par l'écran.
  onNavigate?: (target: NavTarget) => void;
}) {
  void onNavigate;
  const { tab, setTab, buckets, tabItems, filter } = useReviewView(questions);

  const { selection: sel } = usePdfShell();
  // Pas d'item à réviser → on cache le bouton PDF du header : il aurait
  // pointé vers un mode sélection vide. Cf. EmptyState rendu plus bas.
  useExposePdfHeaderSelectAction(sel.enterSelectMode, tabItems.length > 0);
  const visibleIds = useMemo(
    () => filter.filtered.map((q) => q.id),
    [filter.filtered],
  );
  const selectAllVisible = useCallback(
    () => sel.selectAll(visibleIds),
    [sel, visibleIds],
  );

  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <div style={{ padding: "0 16px 24px" }}>
        <ReviewTabs tab={tab} setTab={setTab} buckets={buckets} />

        {tabItems.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <>
            <FilterBar
              search={filter.search}
              setSearch={filter.setSearch}
              themesWithCounts={filter.themesWithCounts}
              activeThemes={filter.activeThemes}
              toggleTheme={filter.toggleTheme}
              clearThemes={filter.clearThemes}
              totalShown={filter.filtered.length}
              totalInBase={tabItems.length}
            />
            <PdfSelectToolbar
              selectMode={sel.selectMode}
              selectedCount={sel.selected.size}
              visibleCount={visibleIds.length}
              onEnter={sel.enterSelectMode}
              onExit={sel.exitSelectMode}
              onSelectAllVisible={selectAllVisible}
              onClear={sel.clear}
            />
            <LazyQuestionList
              items={filter.filtered}
              tab={tab}
              onPlay={onPlay}
              selectMode={sel.selectMode}
              selected={sel.selected}
              onToggleSelect={sel.toggle}
            />
          </>
        )}
      </div>
      {sel.selectMode && sel.selected.size > 0 ? (
        <PdfSelectionFooter
          selectedIds={[...sel.selected]}
          onExit={sel.exitSelectMode}
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// UI — Lazy list
// ============================================================================

function LazyQuestionList({
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

  if (items.length === 0) {
    return <FilteredEmpty />;
  }

  return (
    <div
      style={{
        marginTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        paddingBottom: selectMode ? 80 : 0,
      }}
    >
      {visible.map((q) => (
        <QuestionRow
          key={q.id}
          q={q}
          tab={tab}
          onPlay={() => onPlay(q)}
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


function FilteredEmpty() {
  return (
    <EmptyHint variant="subtle">
      Aucune question ne correspond. Essaie d&apos;élargir tes filtres.
    </EmptyHint>
  );
}

// ============================================================================
// UI — Empty states (tab-level)
// ============================================================================

function EmptyState({ tab }: { tab: Tab }) {
  const copy =
    tab === "todo"
      ? {
          title: "Rien à revoir aujourd'hui.",
          body: "Les questions reviennent à intervalles croissants. Reviens demain, ou joues-en de nouvelles depuis Découvrir.",
        }
      : tab === "done"
        ? {
            title: "Rien de programmé pour l'instant.",
            body: "Chaque bonne réponse est programmée pour revenir te tester plus tard (dans 3 jours, puis 7, puis 21…). Elle apparaîtra ici en attendant.",
          }
        : {
            title: "Tu n'as pas encore joué.",
            body: "Lance une partie depuis Découvrir ou la Question du jour, et tu retrouveras tes questions ici pour les revoir.",
          };
  return (
    <EmptyHint variant="block" title={copy.title}>
      {copy.body}
    </EmptyHint>
  );
}

// ============================================================================
// UI — Row (exporté pour réutilisation desktop)
// ============================================================================

export function QuestionRow({
  q,
  tab,
  onPlay,
  large,
  selectable,
  selected,
  onToggleSelect,
}: {
  q: Question;
  tab: Tab;
  onPlay: () => void;
  large?: boolean;
  /// Mode sélection PDF : remplace le tap-pour-jouer par un toggle de sélection
  /// et l'étoile favori par une checkbox. Quand undefined, comportement normal.
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  /// Tous les rows partagent le même fond cream-warm + border soft-card.
  /// Le thème est signifié par une chip colorée en eyebrow (même chip que
  /// la page question, via `ThemeChip` de format-shared). Le wrapper est
  /// rendu en `.soft-card` pour avoir le même hover lift -1px + border ink
  /// que les autres cards cliquables (ModeCard, card défi envoyé). Sans
  /// `<button>` interne : tout le row est la zone de clic, l'étoile favori
  /// stopPropagation pour conserver son propre toggle.
  /// Le statut todo/done est porté par les tabs au-dessus.
  void tab;
  const action = selectable && onToggleSelect ? onToggleSelect : onPlay;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={action}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          action();
        }
      }}
      className="soft-card"
      style={{
        borderRadius: "var(--radius-md)",
        padding: large ? "16px 18px" : "14px 16px",
        display: "flex",
        alignItems: large ? "center" : "flex-start",
        gap: large ? 14 : 10,
        background: selectable && selected ? "var(--cream-deep)" : undefined,
        borderColor: selectable && selected ? "var(--ink)" : undefined,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            marginBottom: large ? 8 : 6,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {/* Variant "soft" : on est dans une liste dense, la couleur du
              thème reste visible (pastille) sans saturer l'œil avec 30+
              pills pleins. Cf. components/theme-badge.tsx. */}
          <ThemeBadge label={q.theme} size="sm" />
          <DifficultyChip difficulte={q.difficulte} />
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: large ? 17 : 14,
            lineHeight: 1.3,
            color: "var(--ink)",
          }}
        >
          {q.question}
        </div>
      </div>
      {selectable ? (
        <PdfSelectIcon checked={!!selected} />
      ) : (
        <FavoriteToggle questionId={q.id} size={large ? "md" : "sm"} />
      )}
    </div>
  );
}
