"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { CategorisationQuestion } from "@/lib/types";
import { answerLevel, LEVEL_LABEL, scoreCategorisation } from "@/lib/correctness";
import { categorisationCommunityLine } from "@/lib/community-lines";
import { phaseAtLeast } from "@/lib/reveal-phase";
import {
  CommunityReadLine,
  CommunityStatsToggle,
  type FormatProps,
  RevealSection,
  ScoreChip,
} from "./format-shared";
import { QuestionShell } from "../question-shell";

type Placements = Record<string, string>; // itemId -> binId | "tray"
const TRAY = "__tray__";

type CommonProps = FormatProps<CategorisationQuestion, Placements>;

export function CategorisationQuestionScreen({
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
  onAbort,
  onTerminate,
  hasAnyAnswer,
  draft,
  onDraft,
}: CommonProps) {
  const isDesktop = useIsDesktop();
  const perItemBins =
    liveStats && liveStats.hasRealData ? liveStats.perItemBins : undefined;
  const isRevealing = revealPhase !== "ask";
  const [placements, setPlacements] = useState<Placements>(lockedAnswer ?? draft ?? {});
  const [activeId, setActiveId] = useState<string | null>(null);
  /// Alternative au glisser : « toucher la carte, puis la case ». Le glisser
  /// au doigt est fragile (pouce qui masque la cible, défilement, pastilles
  /// étroites) ; deux touchers successifs marchent partout, y compris au
  /// lecteur d'écran (bouton « Ranger ici » dans chaque case).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /// Horodatage de la dernière fin de glisser : le navigateur émet un
  /// `click` juste après le relâché, qui ne doit pas être lu comme un tap.
  const lastDragEndRef = useRef(0);

  /// Ordre des zones pour le clavier : bac « À classer » puis les cases.
  const zoneOrder = [TRAY, ...q.bins.map((b) => b.id)];
  const zoneLabel = (id: string) =>
    id === TRAY ? "À classer" : (q.bins.find((b) => b.id === id)?.label ?? id);
  const itemLabel = (id: string | number) =>
    q.items.find((it) => it.id === String(id))?.label ?? String(id);

  /// Clavier : les flèches sautent de zone en zone (au lieu de déplacer la
  /// carte de 25px comme le getter par défaut, inutilisable ici). On cale
  /// la carte au centre de la zone visée ; la détection de collision fait
  /// le reste.
  const zoneKeyboardCoordinates: KeyboardCoordinateGetter = (
    event,
    { active, context, currentCoordinates },
  ) => {
    const dir =
      event.code === "ArrowDown" || event.code === "ArrowRight"
        ? 1
        : event.code === "ArrowUp" || event.code === "ArrowLeft"
          ? -1
          : 0;
    if (dir === 0) return undefined;
    event.preventDefault();
    const current = String(context.over?.id ?? placements[String(active)] ?? TRAY);
    const idx = Math.max(0, zoneOrder.indexOf(current));
    const nextId = zoneOrder[Math.min(zoneOrder.length - 1, Math.max(0, idx + dir))];
    const rect = context.droppableRects.get(nextId);
    const own = context.collisionRect;
    if (!rect || !own) return currentCoordinates;
    return {
      x: rect.left + rect.width / 2 - own.width / 2,
      y: rect.top + rect.height / 2 - own.height / 2,
    };
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Délai tactile 250 ms (au lieu de 100) : un tap normal reste un tap
    // (sélection), un glisser démarre dès que le doigt bouge (PointerSensor).
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: zoneKeyboardCoordinates })
  );

  // Annonces lecteur d'écran en français (les défauts dnd-kit sont en
  // anglais et lisent des identifiants techniques).
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `« ${itemLabel(active.id)} » saisie. Flèches pour choisir une case, Espace ou Entrée pour déposer, Échap pour annuler.`,
    onDragOver: ({ active, over }) =>
      over
        ? `« ${itemLabel(active.id)} » au-dessus de « ${zoneLabel(String(over.id))} ».`
        : `« ${itemLabel(active.id)} » hors des cases.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `« ${itemLabel(active.id)} » placée dans « ${zoneLabel(String(over.id))} ».`
        : `« ${itemLabel(active.id)} » reposée à sa place.`,
    onDragCancel: ({ active }) =>
      `Déplacement annulé. « ${itemLabel(active.id)} » reste à sa place.`,
  };
  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable:
      "Pour classer cette carte : Espace ou Entrée pour la saisir, flèches pour passer d'une case à l'autre, Espace ou Entrée pour la déposer, Échap pour annuler.",
  };

  const allPlaced = q.items.every((it) => placements[it.id] !== undefined && placements[it.id] !== TRAY);

  function place(itemId: string, zoneId: string) {
    // Compute hors-updater (React 19 strict mode rejoue les updaters et
    // signale les setState parent comme "setState during render").
    const next = { ...placements, [itemId]: zoneId };
    setPlacements(next);
    onDraft?.(next);
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setSelectedId(null);
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    lastDragEndRef.current = performance.now();
    if (!e.over) return;
    place(String(e.active.id), String(e.over.id));
  }

  /// Tap sur une carte : la sélectionne (ou la désélectionne).
  function tapItem(itemId: string) {
    if (isRevealing) return;
    if (performance.now() - lastDragEndRef.current < 300) return;
    setSelectedId((cur) => (cur === itemId ? null : itemId));
  }
  /// Tap sur une zone avec une carte sélectionnée : la carte y va.
  function tapZone(zoneId: string) {
    if (isRevealing || !selectedId) return;
    if (performance.now() - lastDragEndRef.current < 300) return;
    place(selectedId, zoneId);
    setSelectedId(null);
  }

  const tray = q.items.filter((it) => placements[it.id] === undefined || placements[it.id] === TRAY);
  const remaining = tray.length;
  const selectedLabel = selectedId ? itemLabel(selectedId) : null;
  const selectedZone = selectedId ? (placements[selectedId] ?? TRAY) : null;

  return (
    <QuestionShell
      q={q}
      index={index}
      total={total}
      accent={accent}
      phase={revealPhase}
      isLast={isLast}
      lockedAnswer={lockedAnswer}
      validateLabel={
        // Même sens de compteur partout (ce qui reste à faire) : « Encore 3
        // à placer », comme le bac et les autres formats à pastilles.
        allPlaced ? "Valider" : `Encore ${remaining} à placer`
      }
      canSubmit={allPlaced}
      onSubmit={() => onSubmit(placements)}
      onAbort={onAbort}
      onTerminate={onTerminate}
      onNext={onNext}
      hasAnyAnswer={hasAnyAnswer}
    >
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          lastDragEndRef.current = performance.now();
        }}
        accessibility={{ announcements, screenReaderInstructions }}
      >
        <div
          className="q-body-pad"
          style={{ paddingTop: isDesktop ? 14 : 12 }}
        >
          {!isRevealing ? (
            <div
              // Région live toujours montée : la consigne change quand une
              // carte est sélectionnée, le lecteur d'écran l'annonce.
              aria-live="polite"
              style={{
                marginBottom: 14,
                fontFamily: "var(--font-mono)",
                fontSize: isDesktop ? 11 : 10,
                color: selectedLabel ? "var(--ink)" : "var(--ink-mute)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {selectedLabel
                ? `Touche la case où ranger « ${selectedLabel} »`
                : "Glisse chaque carte vers sa case, ou touche la carte, puis la case"}
            </div>
          ) : null}

          <TrayZone
            tray={tray}
            placements={placements}
            isReveal={isRevealing}
            q={q}
            mobile={!isDesktop}
            selectedId={selectedId}
            selectedLabel={selectedLabel}
            selectedZone={selectedZone}
            onTapItem={tapItem}
            onTapZone={tapZone}
          />

          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: isDesktop
                ? `repeat(${q.bins.length}, 1fr)`
                : "1fr",
              gap: isDesktop ? 14 : 12,
            }}
          >
            {q.bins.map((bin) => (
              <BinZone
                key={bin.id}
                bin={bin}
                items={q.items.filter((it) => placements[it.id] === bin.id)}
                placements={placements}
                isReveal={isRevealing}
                mobile={!isDesktop}
                selectedId={selectedId}
                selectedLabel={selectedLabel}
                selectedZone={selectedZone}
                onTapItem={tapItem}
                onTapZone={tapZone}
              />
            ))}
          </div>

          {isRevealing ? (
            <div
              style={{
                marginTop: isDesktop ? 22 : 16,
                padding: isDesktop ? 0 : "0 0 16px",
              }}
            >
              <RevealCol
                q={q}
                placements={placements}
                perItemBins={perItemBins}
                communityLine={
                  phaseAtLeast(revealPhase, "comparison")
                    ? categorisationCommunityLine(q, liveStats)
                    : null
                }
              />
            </div>
          ) : null}
        </div>

        <DragOverlay>
          {activeId ? <DragChip label={itemLabel(activeId)} /> : null}
        </DragOverlay>
      </DndContext>
    </QuestionShell>
  );
}

function RevealCol({
  q,
  placements,
  perItemBins,
  communityLine,
}: {
  q: CategorisationQuestion;
  placements: Placements;
  perItemBins?: Record<string, Record<string, number>>;
  /// Lecture collective par défaut (null sous le seuil de réponses).
  communityLine: string | null;
}) {
  const score = scoreCategorisation(placements, q);
  // Niveau unique (règle « N éléments sur M justes », lib/correctness).
  const level = answerLevel(q, placements);
  return (
    <div>
      <ScoreChip pop kind={level}>
        {LEVEL_LABEL[level]} · {score} / {q.items.length} bien classées
      </ScoreChip>
      {communityLine ? (
        <div style={{ marginTop: 10 }}>
          <CommunityReadLine text={communityLine} />
        </div>
      ) : null}
      <RevealSection title="Détail" tag="Réalité" style={{ marginTop: 18 }}>
        <CategorisationItemsList
          q={q}
          placements={placements}
          perItemBins={perItemBins}
        />
      </RevealSection>
    </div>
  );
}

function CategorisationItemsList({
  q,
  placements,
  perItemBins,
  compact = false,
}: {
  q: CategorisationQuestion;
  placements: Placements;
  perItemBins?: Record<string, Record<string, number>>;
  compact?: boolean;
}) {
  const [showStats, setShowStats] = useState(false);
  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: compact ? 12 : 14,
        }}
      >
        {q.items.map((it) => {
          const bin = q.bins.find((b) => b.id === it.correct);
          const userBinId = placements[it.id];
          const userWasRight = userBinId === it.correct;
          const dist = perItemBins?.[it.id];
          return (
            <CategorisationItemDetail
              key={it.id}
              label={it.label}
              correctBinLabel={bin?.label}
              note={it.note}
              userWasRight={userWasRight}
              dist={dist}
              bins={q.bins}
              correctBinId={it.correct}
              showStats={showStats}
              compact={compact}
            />
          );
        })}
      </div>
      <CommunityStatsToggle
        open={showStats}
        onToggle={() => setShowStats((v) => !v)}
        hasData={!!perItemBins}
      />
    </div>
  );
}

function CategorisationItemDetail({
  label,
  correctBinLabel,
  note,
  userWasRight,
  dist,
  bins,
  correctBinId,
  showStats,
  compact,
}: {
  label: string;
  correctBinLabel?: string;
  note?: string | null;
  userWasRight: boolean;
  dist?: Record<string, number>;
  bins: { id: string; label: string }[];
  correctBinId: string;
  showStats: boolean;
  compact: boolean;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: compact ? 13 : 13.5,
              fontWeight: 600,
            }}
          >
            {label}
          </span>
          {correctBinLabel ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--signal-good-ink)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              · {correctBinLabel}
            </span>
          ) : null}
        </div>
        <span
          aria-hidden
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: userWasRight ? "var(--signal-good-ink)" : "var(--signal-bad-ink)",
            flexShrink: 0,
          }}
        >
          {userWasRight ? "✓" : "✗"}
        </span>
        <span className="sr-only">
          {userWasRight ? "Bien vu." : "Pas cette fois."}
        </span>
      </div>
      {note ? (
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: compact ? 12 : 12.5,
            color: "var(--ink-soft)",
            lineHeight: 1.4,
            marginTop: 4,
          }}
        >
          {note}
        </div>
      ) : null}
      {showStats && dist ? (
        <CategorisationDistributionBars
          bins={bins}
          dist={dist}
          correctBinId={correctBinId}
          compact={compact}
        />
      ) : null}
    </div>
  );
}

function CategorisationDistributionBars({
  bins,
  dist,
  correctBinId,
  compact,
}: {
  bins: { id: string; label: string }[];
  dist: Record<string, number>;
  correctBinId: string;
  compact: boolean;
}) {
  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {bins.map((b) => {
        const pct = dist[b.id] ?? 0;
        const isCorrect = b.id === correctBinId;
        return (
          <div
            key={b.id}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <div
              className="mono"
              title={b.label}
              style={{
                fontSize: 9,
                color: isCorrect ? "var(--signal-good-ink)" : "var(--ink-mute)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                flex: "0 0 auto",
                width: compact ? 110 : 150,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {b.label}
            </div>
            <div
              style={{
                flex: 1,
                height: compact ? 4 : 5,
                background: "var(--cream-deep)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: pct + "%",
                  height: "100%",
                  background: isCorrect
                    ? "var(--signal-good)"
                    : "var(--ink-mute)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--ink)",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                minWidth: 30,
                textAlign: "right",
              }}
            >
              {pct}&nbsp;%
            </div>
          </div>
        );
      })}
    </div>
  );
}

/// Props communes du mode « toucher la carte, puis la case ».
type TapProps = {
  selectedId: string | null;
  selectedLabel: string | null;
  /// Zone où se trouve la carte sélectionnée (pas de « Ranger ici » dessus).
  selectedZone: string | null;
  onTapItem: (itemId: string) => void;
  onTapZone: (zoneId: string) => void;
};

/// Une zone accepte la carte sélectionnée si elle n'est pas déjà dedans.
function isTapTarget(zoneId: string, tap: TapProps, isReveal: boolean) {
  return !isReveal && !!tap.selectedId && tap.selectedZone !== zoneId;
}

/// Bouton « Ranger ici » affiché dans chaque zone cible quand une carte est
/// sélectionnée. Toute la zone est aussi touchable (onClick sur la zone) ;
/// ce bouton natif est la cible clavier / lecteur d'écran — pas de
/// role="button" sur la zone elle-même, qui contient d'autres cartes
/// actionnables (boutons imbriqués = enfants rendus muets).
function RangerIciButton({
  zoneId,
  zoneName,
  tap,
}: {
  zoneId: string;
  zoneName: string;
  tap: TapProps;
}) {
  return (
    <button
      type="button"
      className="mono"
      onClick={(e) => {
        e.stopPropagation();
        tap.onTapZone(zoneId);
      }}
      aria-label={`Ranger « ${tap.selectedLabel ?? ""} » dans « ${zoneName} »`}
      style={{
        appearance: "none",
        flexShrink: 0,
        minHeight: 32,
        padding: "6px 10px",
        borderRadius: 99,
        border: "1.5px solid var(--ink)",
        background: "var(--ink)",
        color: "var(--paper)",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      Ranger ici
    </button>
  );
}

function TrayZone({
  tray,
  placements,
  isReveal,
  q,
  mobile,
  ...tap
}: {
  tray: { id: string; label: string }[];
  placements: Placements;
  isReveal: boolean;
  q: CategorisationQuestion;
  mobile?: boolean;
} & TapProps) {
  const { isOver, setNodeRef } = useDroppable({ id: TRAY });
  const targetable = isTapTarget(TRAY, tap, isReveal);
  return (
    <div
      ref={setNodeRef}
      onClick={targetable ? () => tap.onTapZone(TRAY) : undefined}
      style={{
        padding: "12px 14px",
        background: isOver ? "var(--yellow)" : "var(--cream-warm)",
        border: isOver
          ? "2px solid var(--ink)"
          : targetable
            ? "1.5px dashed var(--ink)"
            : "1.5px solid var(--rule-soft)",
        cursor: targetable ? "pointer" : undefined,
        borderRadius: 14,
        minHeight: 64,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        marginTop: mobile ? 0 : 16,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ink-mute)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginRight: 4,
        }}
      >
        {/* « À classer » plutôt que « Bac » (jargon) ; compteur de ce qui
            reste, dans le même sens que le bouton « Encore N à placer ». */}
        À classer · {tray.length}
        <span className="sr-only"> sur {q.items.length}</span>
      </div>
      {targetable ? <RangerIciButton zoneId={TRAY} zoneName="À classer" tap={tap} /> : null}
      {tray.map((it) => (
        <DraggableChip
          key={it.id}
          id={it.id}
          label={it.label}
          isReveal={isReveal}
          placements={placements}
          selected={tap.selectedId === it.id}
          onTap={() => tap.onTapItem(it.id)}
        />
      ))}
      {tray.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}
        >
          ✓ Tout est classé
        </div>
      ) : null}
    </div>
  );
}

function BinZone({
  bin,
  items,
  placements,
  isReveal,
  mobile,
  ...tap
}: {
  bin: { id: string; label: string };
  items: { id: string; label: string; correct: string }[];
  placements: Placements;
  isReveal: boolean;
  mobile?: boolean;
} & TapProps) {
  const { isOver, setNodeRef } = useDroppable({ id: bin.id });
  const targetable = isTapTarget(bin.id, tap, isReveal);
  return (
    <div
      ref={setNodeRef}
      onClick={targetable ? () => tap.onTapZone(bin.id) : undefined}
      style={{
        background: isOver ? "var(--yellow)" : "var(--cream-warm)",
        border: isOver
          ? "2px solid var(--ink)"
          : targetable
            ? "1.5px dashed var(--ink)"
            : "1.5px solid var(--rule-soft)",
        cursor: targetable ? "pointer" : undefined,
        borderRadius: 18,
        padding: mobile ? "10px 12px" : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: mobile ? 80 : 120,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {/* minWidth 0 + césure : un intitulé de case long ne pousse plus la
            grille hors de l'écran à 375 px. */}
        <div
          className="display"
          style={{
            fontWeight: 600,
            fontSize: mobile ? 14 : 16,
            minWidth: 0,
            overflowWrap: "anywhere",
            lineHeight: 1.25,
          }}
        >
          {bin.label}
        </div>
        {targetable ? (
          <RangerIciButton zoneId={bin.id} zoneName={bin.label} tap={tap} />
        ) : (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-mute)",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}
          >
            {items.length}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          flex: 1,
          alignItems: "flex-start",
          alignContent: "flex-start",
        }}
      >
        {items.map((it) => (
          <DraggableChip
            key={it.id}
            id={it.id}
            label={it.label}
            isReveal={isReveal}
            placements={placements}
            placed
            wasCorrect={isReveal ? it.correct === placements[it.id] : undefined}
            selected={tap.selectedId === it.id}
            onTap={() => tap.onTapItem(it.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DraggableChip({
  id,
  label,
  isReveal,
  placed,
  wasCorrect,
  selected = false,
  onTap,
}: {
  id: string;
  label: string;
  isReveal: boolean;
  placements: Placements;
  placed?: boolean;
  wasCorrect?: boolean;
  /// Carte choisie en mode « toucher la carte, puis la case ».
  selected?: boolean;
  onTap?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: isReveal,
  });
  const bg = isReveal
    ? wasCorrect
      ? "rgba(74,143,92,0.14)"
      : "rgba(199,93,93,0.10)"
    : selected
      ? "var(--yellow)"
      : placed
        ? "var(--cream)"
        : "var(--cream-warm)";
  const borderColor = isReveal
    ? wasCorrect
      ? "rgba(74,143,92,0.5)"
      : "rgba(199,93,93,0.5)"
    : selected
      ? "var(--ink)"
      : "var(--rule)";
  return (
    <span
      ref={setNodeRef}
      {...(isReveal ? {} : attributes)}
      {...(isReveal ? {} : listeners)}
      className={isReveal ? undefined : "drag-chip"}
      aria-pressed={isReveal ? undefined : selected}
      aria-roledescription={isReveal ? undefined : "carte déplaçable"}
      onClick={
        isReveal
          ? undefined
          : (e) => {
              // Ne pas laisser le tap remonter à la zone parente (qui
              // rangerait la carte sélectionnée ici).
              e.stopPropagation();
              onTap?.();
            }
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: bg,
        color: "var(--ink)",
        border: "1.5px solid " + borderColor,
        borderRadius: 16,
        padding: "6px 12px",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 12.5,
        lineHeight: 1.25,
        cursor: isReveal ? "default" : isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.3 : 1,
        // Retour à la ligne autorisé : les étiquettes longues débordaient
        // de l'écran à 375 px en `nowrap`.
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        maxWidth: "100%",
        textAlign: "left",
        userSelect: "none",
        touchAction: "none",
        transition: "background 0.2s",
      }}
    >
      {label}
      {isReveal ? (
        <>
          <span
            aria-hidden
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: wasCorrect ? "var(--signal-good-ink)" : "var(--signal-bad-ink)",
              letterSpacing: "0.04em",
            }}
          >
            {wasCorrect ? "✓" : "✗"}
          </span>
          <span className="sr-only">
            {wasCorrect ? "(bien classée)" : "(pas cette case)"}
          </span>
        </>
      ) : null}
    </span>
  );
}

function DragChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "var(--yellow)",
        color: "var(--ink)",
        border: "1.5px solid var(--ink)",
        borderRadius: 99,
        padding: "6px 12px",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 12.5,
        lineHeight: 1.25,
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        maxWidth: "min(320px, 80vw)",
        boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
        cursor: "grabbing",
      }}
    >
      {label}
    </span>
  );
}
