"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { answerLevel, LEVEL_LABEL, scoreClassement } from "@/lib/correctness";
import { classementCommunityLine } from "@/lib/community-lines";
import { phaseAtLeast } from "@/lib/reveal-phase";
import type { ClassementQuestion } from "@/lib/types";
import {
  CommunityReadLine,
  CommunityStatsToggle,
  type FormatProps,
  RevealSection,
  ScoreChip,
} from "./format-shared";
import { QuestionShell } from "../question-shell";

type CommonProps = FormatProps<ClassementQuestion, string[]>;

/** Shuffle deterministically from question id, so the same player sees the
 * same initial order across re-renders but different questions don't all
 * happen to start identical. */
function deterministicShuffle<T>(list: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const cp = [...list];
  for (let i = cp.length - 1; i > 0; i--) {
    h = (h * 9301 + 49297) % 233280;
    const j = h % (i + 1);
    [cp[i], cp[j]] = [cp[j], cp[i]];
  }
  return cp;
}

function useRanking(
  q: ClassementQuestion,
  locked: string[] | null,
  draft: string[] | null | undefined,
  onDraft: ((v: string[]) => void) | undefined
) {
  /// Priorité d'hydration : locked (en reveal) > draft (rescue post-remount,
  /// si l'utilisateur avait déjà réordonné) > shuffle déterministique par
  /// q.id. Le shuffle est stable pour le même q.id, donc sans draft, après
  /// remount on retombe sur la même séquence initiale — mais on perd les
  /// déplacements de l'utilisateur, d'où le draft.
  const initial = useMemo(
    () =>
      locked ??
      (draft && draft.length === q.correctOrder.length ? draft : null) ??
      deterministicShuffle(q.correctOrder, q.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.id, q.correctOrder, locked]
  );
  const [order, setOrder] = useState<string[]>(initial);
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Compute hors-updater (cf. note React 19 strict mode dans
    // question-pondere.tsx). `order` est l'état committé courant — l'event
    // handler tourne après le commit, donc pas de stale state pour un
    // drag-end isolé.
    const oldIdx = order.indexOf(String(active.id));
    const newIdx = order.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    onDraft?.(next);
  }
  return { order, handleDragEnd };
}

export function ClassementQuestionScreen({
  q,
  index,
  total,
  accent,
  onSubmit,
  revealPhase = "ask",
  lockedAnswer = null,
  liveStats,
  onNext,
  isLast = false,
  onTerminate,
  onAbort,
  hasAnyAnswer,
  draft,
  onDraft,
}: CommonProps) {
  const isDesktop = useIsDesktop();
  const isRevealing = revealPhase !== "ask";
  const { order, handleDragEnd } = useRanking(q, lockedAnswer, draft ?? null, onDraft);
  const perItemPositions =
    liveStats && liveStats.hasRealData ? liveStats.perItemPositions : undefined;
  /// `showStats` : la ligne « X % l'ont mis en position N » par item
  /// reste cachée par défaut. Le joueur la déplie via CommunityStatsToggle
  /// (toujours visible en reveal, même sans données). Cohérent avec QCM,
  /// Catégorisation, etc.
  const [showStats, setShowStats] = useState(false);
  /// Lecture collective par défaut (« En moyenne, les joueurs placent bien
  /// 1,8 élément sur 5… »), sous le verdict, dès la phase comparaison. Rien
  /// sous le seuil de réponses.
  const communityLine = phaseAtLeast(revealPhase, "comparison")
    ? classementCommunityLine(q, liveStats)
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
    // Clavier : Espace/Entrée sur la poignée saisit l'élément, flèches
    // haut/bas le déplacent d'un rang (sortableKeyboardCoordinates), Espace/
    // Entrée dépose, Échap annule. Sans lui, le format était injouable sans
    // souris ni doigt.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Annonces lecteur d'écran en français (dnd-kit les lit dans sa région
  // live) — les défauts sont en anglais et parlent d'« id ».
  const n = order.length;
  const labelOf = (id: string | number) =>
    q.items.find((x) => x.id === String(id))?.label ?? String(id);
  const rankOf = (id: string | number) => order.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `« ${labelOf(active.id)} » saisi, rang ${rankOf(active.id)} sur ${n}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `« ${labelOf(active.id)} » passe au rang ${rankOf(over.id)} sur ${n}.`
        : `« ${labelOf(active.id)} » n'est plus dans la liste.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `« ${labelOf(active.id)} » déposé au rang ${rankOf(over.id)} sur ${n}.`
        : `« ${labelOf(active.id)} » déposé.`,
    onDragCancel: ({ active }) =>
      `Déplacement annulé. « ${labelOf(active.id)} » reste au rang ${rankOf(active.id)}.`,
  };
  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable:
      "Pour réordonner : Espace ou Entrée pour saisir l'élément, flèches haut et bas pour le déplacer, Espace ou Entrée pour le déposer, Échap pour annuler. Le rang 1 est en haut.",
  };

  return (
    <QuestionShell
      q={q}
      index={index}
      total={total}
      accent={accent}
      phase={revealPhase}
      isLast={isLast}
      lockedAnswer={lockedAnswer}
      validateLabel="Valider"
      canSubmit
      onSubmit={() => onSubmit(order)}
      onAbort={onAbort}
      onTerminate={onTerminate}
      onNext={onNext}
      hasAnyAnswer={hasAnyAnswer}
    >
      <div
        className="q-body-pad"
        style={{ paddingTop: isDesktop ? 14 : 18 }}
      >
        {!isRevealing ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: isDesktop ? 11 : 10,
              color: "var(--ink-mute)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: isDesktop ? 20 : 10,
              paddingLeft: isDesktop ? 0 : 4,
            }}
          >
            {/* Consigne neutre : l'ancien « Du plus important → au moins
                important » contredisait les énoncés qui demandent un autre
                critère (du plus bas au plus haut, du plus ancien…). C'est
                l'énoncé qui dit le critère ; ici, seulement le geste. */}
            Glisse <span aria-hidden>≡</span> pour réordonner · 1 = en haut
          </div>
        ) : null}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={isRevealing ? undefined : handleDragEnd}
          accessibility={{ announcements, screenReaderInstructions }}
        >
          <SortableContext
            items={order}
            strategy={verticalListSortingStrategy}
            disabled={isRevealing}
          >
            <RankingList
              q={q}
              order={order}
              isReveal={isRevealing}
              compact={!isDesktop}
              perItemPositions={perItemPositions}
              showStats={showStats}
            />
          </SortableContext>
        </DndContext>
      </div>

      {isRevealing ? (
        <div
          className="q-reveal-pad"
          style={{
            paddingTop: isDesktop ? 22 : 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          {isDesktop ? (
            <DesktopRevealAnswer q={q} order={order} communityLine={communityLine} />
          ) : (
            <>
              <ClassementVerdictChip q={q} order={order} />
              <CommunityReadLine text={communityLine} />
            </>
          )}
          <CommunityStatsToggle
            open={showStats}
            onToggle={() => setShowStats((v) => !v)}
            hasData={!!perItemPositions}
            marginTop={0}
          />
        </div>
      ) : null}
    </QuestionShell>
  );
}

/// Pastille de verdict : niveau unique (answerLevel, règle « N éléments sur
/// M justes ») + nombre d'éléments bien placés.
function ClassementVerdictChip({ q, order }: { q: ClassementQuestion; order: string[] }) {
  const level = answerLevel(q, order);
  return (
    <ScoreChip pop kind={level}>
      {LEVEL_LABEL[level]} · {scoreClassement(order, q.correctOrder)}/{q.correctOrder.length}{" "}
      bien placés
    </ScoreChip>
  );
}

function DesktopRevealAnswer({
  q,
  order,
  communityLine,
}: {
  q: ClassementQuestion;
  order: string[];
  communityLine: string | null;
}) {
  return (
    <div style={{ alignSelf: "stretch" }}>
      <ClassementVerdictChip q={q} order={order} />
      {communityLine ? (
        <div style={{ marginTop: 10 }}>
          <CommunityReadLine text={communityLine} />
        </div>
      ) : null}
      <RevealSection
        title="Le classement réel"
        tag="Réalité"
        style={{ marginTop: 18 }}
      >
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {q.correctOrder.map((id, i) => {
            const item = q.items.find((x) => x.id === id);
            if (!item) return null;
            return (
              <li
                key={id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-mute)",
                    width: 14,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}.
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 13.5,
                    flex: 1,
                    lineHeight: 1.3,
                  }}
                >
                  {item.label}
                </span>
                {item.figure ? (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-soft)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {item.figure}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </RevealSection>
    </div>
  );
}

function RankingList({
  q,
  order,
  isReveal,
  compact,
  perItemPositions,
  showStats,
}: {
  q: ClassementQuestion;
  order: string[];
  isReveal: boolean;
  compact: boolean;
  perItemPositions?: Record<string, Record<string, number>>;
  showStats: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }}>
      {order.map((id, i) => {
        const item = q.items.find((x) => x.id === id);
        if (!item) return null;
        const correctPos = q.correctOrder.indexOf(id);
        const off = i - correctPos;
        // Position la plus fréquente choisie par les joueurs pour cet item.
        let topPos: number | undefined;
        let topPct: number | undefined;
        const dist = perItemPositions?.[id];
        if (dist) {
          let best = -1;
          let bestKey: string | undefined;
          for (const [k, v] of Object.entries(dist)) {
            if (v > best) {
              best = v;
              bestKey = k;
            }
          }
          if (bestKey !== undefined) {
            topPos = parseInt(bestKey, 10);
            topPct = best;
          }
        }
        return (
          <RankingRow
            key={id}
            id={id}
            position={i}
            label={item.label}
            figure={item.figure}
            isReveal={isReveal}
            wellPlaced={off === 0}
            off={off}
            compact={compact}
            correctPos={correctPos}
            communityTopPos={topPos}
            communityTopPct={topPct}
            showStats={showStats}
          />
        );
      })}
    </div>
  );
}

function RankingRow({
  id,
  position,
  label,
  figure,
  isReveal,
  wellPlaced,
  off,
  compact,
  correctPos,
  communityTopPos,
  communityTopPct,
  showStats,
}: {
  id: string;
  position: number;
  label: string;
  figure?: string;
  isReveal: boolean;
  wellPlaced: boolean;
  off: number;
  compact: boolean;
  correctPos: number;
  communityTopPos?: number;
  communityTopPct?: number;
  /// Gate l'affichage de la stat communauté (« X % l'ont mis en
  /// position N »). Pilotée par le CommunityStatsToggle du Body parent.
  showStats: boolean;
}) {
  // Seule la poignée ≡ active le glisser (setActivatorNodeRef + listeners
  // posés sur elle) : avant, toute la ligne avait touch-action:none et
  // bloquait le défilement de la page au doigt sur mobile.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isReveal });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: isReveal
      ? wellPlaced
        ? "rgba(74,143,92,0.10)"
        : Math.abs(off) === 1
          ? "rgba(216,154,62,0.10)"
          : "rgba(199,93,93,0.08)"
      : "var(--cream-warm)",
    border: isReveal
      ? wellPlaced
        ? "1.5px solid rgba(74,143,92,0.4)"
        : Math.abs(off) === 1
          ? "1.5px solid rgba(216,154,62,0.4)"
          : "1.5px solid rgba(199,93,93,0.4)"
      : "1.5px solid var(--rule-soft)",
    borderRadius: 14,
    padding: compact ? "10px 10px 10px 12px" : "14px 14px 14px 16px",
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? "0 8px 18px rgba(0,0,0,0.12)" : "none",
    zIndex: isDragging ? 10 : 1,
    position: "relative",
    userSelect: "none",
  };

  // Écart lisible : `off` = rang joué − rang réel. Positif → l'élément est
  // trop bas dans la liste du joueur. « 2 places trop bas » plutôt que
  // « +2 », qui ne disait ni le sens ni l'unité.
  const offAbs = Math.abs(off);
  const offLabel = wellPlaced
    ? "Bien placé"
    : `${offAbs} place${offAbs > 1 ? "s" : ""} trop ${off > 0 ? "bas" : "haut"}`;

  return (
    <div ref={setNodeRef} style={style}>
      {!isReveal ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="rank-handle"
          {...attributes}
          {...listeners}
          aria-roledescription="élément déplaçable"
          aria-label={`Déplacer « ${label} », rang ${position + 1}`}
          style={{
            // Déborde dans le padding de la ligne : cible 44px sans
            // grossir la ligne.
            margin: compact ? "-10px -4px -10px -8px" : "-14px -2px -14px -10px",
          }}
        >
          <span
            aria-hidden
            style={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <span style={{ width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
            <span style={{ width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
            <span style={{ width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
          </span>
        </button>
      ) : null}
      <div
        className="display"
        style={{
          fontWeight: 700,
          fontSize: compact ? 18 : 22,
          width: compact ? 26 : 32,
          color: isReveal
            ? wellPlaced
              ? "var(--signal-good-ink)"
              : "var(--ink-soft)"
            : "var(--ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {position + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="display"
          style={{
            fontWeight: 600,
            fontSize: compact ? 14 : 16,
            lineHeight: 1.2,
          }}
        >
          {label}
        </div>
        {isReveal && (figure || !wellPlaced) ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-mute)",
              marginTop: 3,
              letterSpacing: "0.04em",
            }}
          >
            {/* La bonne place en clair (le mobile n'affiche pas l'ordre réel
                complet) ; le chiffre réel quand il existe. */}
            {!wellPlaced ? (
              <>
                Bonne place :{" "}
                <strong style={{ color: "var(--ink)" }}>{correctPos + 1}</strong>
              </>
            ) : null}
            {!wellPlaced && figure ? " · " : null}
            {figure ? <>Réel : {figure}</> : null}
          </div>
        ) : null}
        {isReveal && showStats && communityTopPos !== undefined && communityTopPct !== undefined ? (
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--ink-mute)",
              marginTop: 3,
              letterSpacing: "0.04em",
            }}
          >
            <strong
              style={{
                color: communityTopPos === correctPos ? "var(--signal-good-ink)" : "var(--ink)",
                fontSize: 11,
              }}
            >
              {communityTopPct}&nbsp;%
            </strong>{" "}
            des joueurs l&apos;ont mis au rang {communityTopPos + 1}
          </div>
        ) : null}
      </div>
      {isReveal ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            color: wellPlaced
              ? "var(--signal-good-ink)"
              : Math.abs(off) === 1
                ? "var(--signal-mid-ink)"
                : "var(--signal-bad-ink)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {offLabel}
        </div>
      ) : null}
    </div>
  );
}
