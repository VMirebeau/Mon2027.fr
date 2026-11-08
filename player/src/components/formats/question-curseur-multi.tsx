"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { CurseurMultiQuestion } from "@/lib/types";
import {
  CommunityReadLine,
  type FormatProps,
  NBSP,
  RevealSection,
  ScoreChip,
} from "./format-shared";
import { QuestionShell } from "../question-shell";
import { anchorIdsFor } from "@/lib/curseur-anchors";
import { answerLevel, LEVEL_LABEL } from "@/lib/correctness";
import { curseurCommunityLine } from "@/lib/community-lines";
import { phaseAtLeast } from "@/lib/reveal-phase";
import { niceStepForSpan, roundToStep, stepDecimals } from "@/lib/step-rounding";

/** Positions : number = posé sur l'axe à cette valeur, null = encore au bac. */
type Positions = Record<string, number | null>;

/** Vue active en reveal — chaque mode affiche UNE seule couche sur l'axe. */
type RevealView = "mine" | "reality" | "others";

type CommonProps = FormatProps<CurseurMultiQuestion, Record<string, number>>;

/// Pas des pastilles : le type CurseurMultiQuestion n'a pas de pas, on le
/// dérive de la plage (~1 % de l'étendue, valeur ronde — cf.
/// lib/step-rounding). Le même pour le glisser, le clavier et l'envoi : plus
/// de positions comme 11.98263708750407 dans les réponses.
function curseurStep(q: CurseurMultiQuestion): number {
  return niceStepForSpan(q.range[1] - q.range[0]);
}

function snapToStep(q: CurseurMultiQuestion, v: number): number {
  return roundToStep(v, curseurStep(q), q.range[0], q.range[1]);
}

const PALETTE = ["#7BB069", "var(--coral)", "var(--plum)", "var(--teal)", "var(--yellow)"];

export function CurseurMultiQuestionScreen({
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
  const perItemMean =
    liveStats && liveStats.hasRealData ? liveStats.perItemMean : undefined;
  /// Vue active du reveal — 3 onglets exclusifs (au lieu de l'ancien
  /// empilement réalité + ombre « Toi » + dots communauté qui surchargeait
  /// l'axe). Default « reality » : c'est le coeur du reveal, et l'utilisateur
  /// a vu ses propres placements 2 secondes plus tôt.
  const [revealView, setRevealView] = useState<RevealView>("reality");
  const isRevealing = revealPhase !== "ask";
  // Au démarrage, tous les items sont dans le bac (null). Si on est en
  // revealing avec une réponse lockée, on les place déjà sur l'axe.
  // Sinon, on tente la rehydration depuis le brouillon GameState (survit
  // au remount sur flip de breakpoint).
  const source = lockedAnswer ?? draft;
  /// Repères (~25 % des étiquettes) posés d'office à leur vraie position :
  /// le joueur se concentre sur l'ordre et les écarts relatifs plutôt que
  /// de deviner l'échelle à l'aveugle (cf. lib/curseur-anchors).
  const anchors = anchorIdsFor(q);
  const initial: Positions = Object.fromEntries(
    q.items.map((it) => [it.id, anchors.has(it.id) ? it.real : (source?.[it.id] ?? null)]),
  );
  const [positions, setPositions] = useState<Positions>(initial);

  /// Réponse / brouillon = placements du joueur seulement : les repères
  /// n'en font pas partie (ils fausseraient score et statistiques).
  /// Valeurs arrondies au pas (un brouillon réhydraté d'avant l'arrondi
  /// repasse par ici avant l'envoi).
  function withoutAnchors(p: Positions): Record<string, number> {
    const placed = onlyPlaced(p);
    for (const id of anchors) delete placed[id];
    for (const id of Object.keys(placed)) placed[id] = snapToStep(q, placed[id]);
    return placed;
  }

  function setPos(id: string, val: number | null) {
    if (isRevealing || anchors.has(id)) return;
    // Compute hors-updater (cf. note React 19 strict mode dans
    // question-pondere.tsx / question-categorisation.tsx). Toute position
    // (glisser, clavier) est arrondie au pas ici.
    const next = { ...positions, [id]: val === null ? null : snapToStep(q, val) };
    setPositions(next);
    onDraft?.(withoutAnchors(next));
  }
  const toPlace = q.items.filter((it) => !anchors.has(it.id));
  const allPlaced = toPlace.every((it) => typeof positions[it.id] === "number");
  const placedCount = toPlace.filter((it) => typeof positions[it.id] === "number").length;

  function submit() {
    if (!allPlaced) return;
    onSubmit(withoutAnchors(positions));
  }

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
        // Même sens de compteur partout (ce qui reste à faire).
        allPlaced ? "Valider" : `Encore ${toPlace.length - placedCount} à placer`
      }
      canSubmit={allPlaced}
      onSubmit={submit}
      onAbort={onAbort}
      onTerminate={onTerminate}
      hasAnyAnswer={hasAnyAnswer}
      onNext={onNext}
    >
      <div
        className="q-body-pad"
        style={{ paddingTop: isDesktop ? 14 : 10 }}
      >
        <div
          style={{
            marginBottom: isDesktop ? 6 : 10,
            fontFamily: "var(--font-mono)",
            fontSize: isDesktop ? 11 : 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {anchors.size > 0
            ? `Glisse chaque pastille sur l'échelle · ${anchors.size > 1 ? "repères en pointillé déjà placés" : "repère en pointillé déjà placé"}`
            : "Glisse chaque pastille sur l'échelle"}
          <span className="sr-only">
            {". "}Au clavier : Entrée sur une pastille pour la poser, puis
            flèches pour l&apos;ajuster, Suppr pour la remettre à placer.
          </span>
        </div>
        <AxisField
          q={q}
          anchors={anchors}
          positions={positions}
          setPos={setPos}
          isReveal={isRevealing}
          compact={!isDesktop}
          perItemMean={perItemMean}
          revealView={revealView}
        />
      </div>

      {isRevealing ? (
        <div
          className="q-reveal-pad"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <RevealViewSegment
            view={revealView}
            onChange={setRevealView}
            hasMine={q.items.some((it) => typeof positions[it.id] === "number")}
            hasOthers={!!perItemMean}
          />
          <RevealCol
            q={q}
            positions={onlyPlaced(positions)}
            communityLine={
              phaseAtLeast(revealPhase, "comparison")
                ? curseurCommunityLine(q, liveStats)
                : null
            }
          />
        </div>
      ) : null}
    </QuestionShell>
  );
}

function TrayChip({
  it,
  color,
  compact,
  collapsing,
  onPointerDown,
  onKeyPlace,
}: {
  it: CurseurMultiQuestion["items"][number];
  color: string;
  compact: boolean;
  collapsing?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  /// Clavier : Entrée / Espace pose la pastille au milieu de l'échelle (on
  /// l'ajuste ensuite aux flèches, cf. pastille d'axe).
  onKeyPlace?: () => void;
}) {
  return (
    <span
      data-tray-chip={it.id}
      data-curseur-focus={collapsing ? undefined : `tray:${it.id}`}
      onPointerDown={collapsing ? undefined : onPointerDown}
      role={collapsing ? undefined : "button"}
      tabIndex={collapsing ? undefined : 0}
      aria-hidden={collapsing ? true : undefined}
      aria-label={collapsing ? undefined : `Poser « ${it.label} » sur l'échelle`}
      onKeyDown={
        collapsing
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onKeyPlace?.();
              }
            }
      }
      className={collapsing ? undefined : "drag-chip"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: collapsing ? "0" : "6px 12px",
        maxWidth: collapsing ? 0 : 200,
        marginRight: collapsing ? -10 : 0,
        borderRadius: 99,
        background: color,
        color: "var(--ink)",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: compact ? 12 : 13,
        border: collapsing ? "0 solid var(--ink)" : "1.5px solid var(--ink)",
        cursor: collapsing ? "default" : "grab",
        whiteSpace: "nowrap",
        touchAction: "none",
        userSelect: "none",
        boxShadow: collapsing ? "none" : "0 1px 0 var(--ink)",
        opacity: collapsing ? 0 : 1,
        overflow: "hidden",
        pointerEvents: collapsing ? "none" : "auto",
        transition:
          "max-width 0.22s cubic-bezier(.2,.7,.2,1), opacity 0.18s ease, padding 0.22s cubic-bezier(.2,.7,.2,1), margin 0.22s cubic-bezier(.2,.7,.2,1), border-width 0.22s",
      }}
    >
      {it.label}
    </span>
  );
}

function DropIndicator() {
  return (
    <span
      aria-hidden
      style={{
        width: 3,
        height: 28,
        background: "var(--ink)",
        borderRadius: 99,
        flexShrink: 0,
        boxShadow: "0 0 0 2px rgba(255,200,69,0.5)",
        transition: "all 0.12s ease",
      }}
    />
  );
}

/** Calcule 5-7 graduations entières (ou avec décimale si la plage est étroite)
 *  sur l'intervalle [min, max] pour l'axe. */
function axisTicks(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  const targetCount = 6;
  let step = span / targetCount;
  for (const s of niceSteps) {
    if (s >= step) {
      step = s;
      break;
    }
  }
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(2)));
  }
  return ticks;
}

/** Format compact d'une valeur (entier si possible, sinon `digits`
 *  décimales au plus — 1 par défaut, davantage quand le pas l'exige). */
function formatTickValue(v: number, digits = 1): string {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(digits))).replace(".", ",");
}

/** Écart joueur − réalité, lisible : « +12 pts », « −3 ans », « pile ».
 *  Avant : « +12 » sans unité et « · » pour un placement exact (illisible).
 *  Précision alignée sur l'échelle (1 décimale sur les petites plages, sinon
 *  entier). Une unité « % » devient « pts » : l'écart entre deux
 *  pourcentages est en points, pas en pourcentage. Les unités longues
 *  (« milliards d'euros ») restent dans la colonne Réalité pour tenir à
 *  375 px. */
function formatDelta(delta: number, span: number, unit?: string | null): string {
  const digits = span <= 20 ? 1 : 0;
  const rounded = Number(delta.toFixed(digits));
  if (rounded === 0) return "pile";
  const abs = Math.abs(rounded).toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
  });
  const u = unit === "%" ? "pts" : unit && unit.length <= 5 ? unit : "";
  return `${rounded > 0 ? "+" : "−"}${abs}${u ? NBSP + u : ""}`;
}

function onlyPlaced(positions: Positions): Record<string, number> {
  const out: Record<string, number> = {};
  Object.entries(positions).forEach(([k, v]) => {
    if (typeof v === "number") out[k] = v;
  });
  return out;
}

/// Segmented control 3-états exclusifs pour le reveal. Remplace l'ancien
/// `CommunityStatsToggle` qui empilait la couche « autres joueurs » par-dessus
/// la couche « Toi + Réalité » déjà chargée. Chaque badge affiche UNE seule
/// couche sur l'axe — la comparaison numérique vit dans le tableau dessous
/// (colonnes Réalité + Toi conservées).
function RevealViewSegment({
  view,
  onChange,
  hasMine,
  hasOthers,
}: {
  view: RevealView;
  onChange: (v: RevealView) => void;
  /// L'utilisateur a placé au moins une pastille — sinon l'onglet « Mes
  /// réponses » n'affiche rien et on le grise.
  hasMine: boolean;
  /// `perItemMean` dispo — sinon on grise l'onglet communauté avec la même
  /// affordance que les autres formats (la feature reste découvrable).
  hasOthers: boolean;
}) {
  const options: {
    value: RevealView;
    label: string;
    disabled: boolean;
  }[] = [
    { value: "mine", label: "Mes réponses", disabled: !hasMine },
    { value: "reality", label: "Réalité", disabled: false },
    { value: "others", label: "Autres joueurs", disabled: !hasOthers },
  ];
  return (
    <div
      role="tablist"
      aria-label="Vue du reveal"
      style={{
        display: "inline-flex",
        alignSelf: "flex-start",
        gap: 3,
        padding: 3,
        background: "var(--cream-warm)",
        border: "1px solid var(--rule)",
        borderRadius: 99,
        flexWrap: "wrap",
      }}
    >
      {options.map((opt) => {
        const active = view === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className="mono"
            style={{
              appearance: "none",
              border: "none",
              background: active ? "var(--ink)" : "transparent",
              color: opt.disabled
                ? "var(--ink-mute)"
                : active
                  ? "var(--paper)"
                  : "var(--ink-soft)",
              padding: "6px 12px",
              borderRadius: 99,
              fontSize: 10.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: opt.disabled ? "not-allowed" : "pointer",
              opacity: opt.disabled ? 0.5 : 1,
              transition: "background 0.18s, color 0.18s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function RevealCol({
  q,
  positions,
  communityLine,
}: {
  q: CurseurMultiQuestion;
  positions: Record<string, number>;
  /// Lecture collective par défaut (null sous le seuil de réponses).
  communityLine: string | null;
}) {
  // Niveau unique (écart moyen < 10 % bon, < 30 % moyen, repères exclus —
  // lib/correctness).
  const level = answerLevel(q, positions);
  const anchors = anchorIdsFor(q);
  return (
    <div>
      <ScoreChip pop kind={level}>
        {LEVEL_LABEL[level]}
      </ScoreChip>
      {communityLine ? (
        <div style={{ marginTop: 10 }}>
          <CommunityReadLine text={communityLine} />
        </div>
      ) : null}
      <RevealSection title="Valeurs réelles" style={{ marginTop: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginBottom: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 8 }} />
          <span style={{ flex: 1 }} />
          <span style={{ width: 96, textAlign: "right" }}>Réalité</span>
          <span style={{ width: 76, textAlign: "right" }}>Ton écart</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.items.map((it, i) => {
            const isAnchor = anchors.has(it.id);
            const userVal = positions[it.id] ?? 0;
            const userPlaced = typeof positions[it.id] === "number";
            const delta = userVal - it.real;
            const color = it.color ?? PALETTE[i % PALETTE.length];
            const unit = q.unit;
            return (
              <div key={it.id}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: color,
                      transform: "translateY(-1px)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: 13.5,
                      flex: 1,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {it.label}
                  </span>
                  <span
                    style={{
                      width: 96,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: 15,
                        color: "var(--ink)",
                        letterSpacing: "-0.01em",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {it.real.toLocaleString("fr-FR")}
                    </span>
                    {unit ? (
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: 12,
                          color: "var(--ink-soft)",
                          marginLeft: 4,
                        }}
                      >
                        {unit}
                      </span>
                    ) : null}
                  </span>
                  <span
                    style={{
                      width: 76,
                      flexShrink: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: isAnchor || !userPlaced
                        ? "var(--ink-mute)"
                        : Math.abs(delta) <= (q.range[1] - q.range[0]) * 0.05
                          ? "var(--signal-good-ink)"
                          : Math.abs(delta) <= (q.range[1] - q.range[0]) * 0.2
                            ? "var(--signal-mid-ink)"
                            : "var(--signal-bad-ink)",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      textAlign: "right",
                    }}
                  >
                    {isAnchor
                      ? "repère"
                      : !userPlaced
                        ? "–"
                        : formatDelta(delta, q.range[1] - q.range[0], unit)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </RevealSection>
    </div>
  );
}

// ============================================================================
// AxisField — bac à pastilles en haut + axe en bas. Drag fluide entre les deux.
// ============================================================================

function AxisField({
  q,
  anchors,
  positions,
  setPos,
  isReveal,
  compact,
  perItemMean,
  revealView,
}: {
  q: CurseurMultiQuestion;
  /// Étiquettes posées d'office (non déplaçables, style distinct).
  anchors: ReadonlySet<string>;
  positions: Positions;
  setPos: (id: string, val: number | null) => void;
  isReveal: boolean;
  compact: boolean;
  perItemMean?: Record<string, number>;
  /// Quelle couche afficher en reveal — pilote l'axe entier. Ignoré quand
  /// `isReveal === false` (le bac + l'axe affichent les placements user).
  revealView: RevealView;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<
    Map<string, "top-far" | "top" | "center" | "bottom" | "bottom-far">
  >(new Map());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<"tray" | "axis" | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [trayOrder, setTrayOrder] = useState<string[]>(() => q.items.map((it) => it.id));
  const [hoverInsertIdx, setHoverInsertIdx] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /// Après une action clavier qui fait passer une pastille du bac à l'axe
  /// (ou l'inverse), l'élément focalisé est démonté : on note la cible
  /// (`tray:<id>` / `axis:<id>`) et on la focalise au rendu suivant.
  const pendingFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target || !rootRef.current) return;
    const el = Array.from(
      rootRef.current.querySelectorAll<HTMLElement>("[data-curseur-focus]")
    ).find((node) => node.getAttribute("data-curseur-focus") === target);
    if (el) {
      el.focus();
      pendingFocusRef.current = null;
    }
  });

  const span = q.range[1] - q.range[0];
  /// Pas clavier = pas de l'échelle (~1 % de la plage, valeur ronde). Maj +
  /// flèche = ×10.
  const kbStep = curseurStep(q);
  /// Décimales affichées sur les pastilles : au moins 1, plus si le pas
  /// l'exige (0,05 → 2).
  const valueDigits = Math.max(1, stepDecimals(kbStep));
  const unitSuffix = q.unit ? " " + q.unit : "";
  const clampSnap = (v: number) => snapToStep(q, v);
  /// Clavier sur le bac : pose la pastille au milieu de l'échelle.
  function keyPlace(id: string) {
    if (isReveal) return;
    pendingFocusRef.current = `axis:${id}`;
    setPos(id, clampSnap(q.range[0] + span / 2));
  }
  /// Clavier sur une pastille d'axe (role="slider") : flèches = ±1 pas,
  /// Maj+flèche / Page = ±10 pas, Début/Fin = bornes, Suppr/Retour arrière
  /// = remettre dans le bac.
  function axisKeyDown(id: string, current: number, e: React.KeyboardEvent) {
    if (isReveal) return;
    const big = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = current + kbStep * big;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = current - kbStep * big;
        break;
      case "PageUp":
        next = current + kbStep * 10;
        break;
      case "PageDown":
        next = current - kbStep * 10;
        break;
      case "Home":
        next = q.range[0];
        break;
      case "End":
        next = q.range[1];
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        pendingFocusRef.current = `tray:${id}`;
        setPos(id, null);
        return;
      default:
        return;
    }
    e.preventDefault();
    setPos(id, clampSnap(next));
  }

  const computeTrayInsertIdx = useCallback(
    (clientX: number, clientY: number, draggedId: string): number | null => {
      const tray = trayRef.current;
      if (!tray) return null;
      const trayRect = tray.getBoundingClientRect();
      const PAD = 16;
      if (
        clientX < trayRect.left - PAD ||
        clientX > trayRect.right + PAD ||
        clientY < trayRect.top - PAD ||
        clientY > trayRect.bottom + PAD
      ) {
        return null;
      }
      const chips = Array.from(
        tray.querySelectorAll<HTMLElement>("[data-tray-chip]")
      ).filter((el) => el.getAttribute("data-tray-chip") !== draggedId);
      let idx = 0;
      for (const chip of chips) {
        const r = chip.getBoundingClientRect();
        if (clientX > r.left + r.width / 2) idx++;
      }
      return idx;
    },
    []
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragId) return;
      setPointerPos({ x: clientX, y: clientY });
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const insideTrackY = clientY >= r.top - 20 && clientY <= r.bottom + 20;

      setHoverInsertIdx(computeTrayInsertIdx(clientX, clientY, dragId));

      if (dragSource === "axis") {
        if (insideTrackY) {
          const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
          const val = q.range[0] + pct * (q.range[1] - q.range[0]);
          setPos(dragId, val);
        } else {
          setDragSource("tray");
          setPos(dragId, null);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragId, dragSource, q.range, computeTrayInsertIdx]
  );

  const handleUp = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragId) {
        setDragId(null);
        setDragSource(null);
        setPointerPos(null);
        setHoverInsertIdx(null);
        return;
      }
      const insertIdx = computeTrayInsertIdx(clientX, clientY, dragId);
      if (insertIdx !== null) {
        setPos(dragId, null);
        setTrayOrder((prev) => {
          const without = prev.filter((id) => id !== dragId);
          const clamped = Math.max(0, Math.min(insertIdx, without.length));
          return [
            ...without.slice(0, clamped),
            dragId,
            ...without.slice(clamped),
          ];
        });
      } else {
        const el = trackRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          const insideTrackY = clientY >= r.top - 20 && clientY <= r.bottom + 20;
          if (insideTrackY) {
            const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
            const val = q.range[0] + pct * (q.range[1] - q.range[0]);
            setPos(dragId, val);
          } else if (dragSource === "axis") {
            setPos(dragId, null);
          }
        }
      }
      setDragId(null);
      setDragSource(null);
      setPointerPos(null);
      setHoverInsertIdx(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragId, dragSource, q.range, computeTrayInsertIdx]
  );

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      handleUp(e.clientX, e.clientY);
    };
    const onCancel = () => {
      setDragId(null);
      setDragSource(null);
      setPointerPos(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dragId, handleMove, handleUp]);

  function pctOf(val: number) {
    return ((val - q.range[0]) / (q.range[1] - q.range[0])) * 100;
  }

  const trayItems = trayOrder
    .map((id) => q.items.find((it) => it.id === id))
    .filter((it): it is CurseurMultiQuestion["items"][number] =>
      it !== undefined && positions[it.id] === null
    );
  const onAxis = q.items.filter((it) => typeof positions[it.id] === "number");

  /// Renvoie la valeur à afficher pour `it` sur l'axe, selon la phase et la
  /// vue active du reveal. `null` = pas de donnée pour cette pastille dans
  /// cette vue (ex. Mes réponses + item non placé, ou Autres joueurs sans
  /// `perItemMean`) → on ne rend pas la pastille.
  function viewValueFor(
    it: CurseurMultiQuestion["items"][number]
  ): number | null {
    // Repère : même position pour tous (moi, réalité, autres joueurs).
    if (anchors.has(it.id)) return it.real;
    if (!isReveal) {
      const v = positions[it.id];
      return typeof v === "number" ? v : null;
    }
    if (revealView === "mine") {
      const v = positions[it.id];
      return typeof v === "number" ? v : null;
    }
    if (revealView === "reality") return it.real;
    const avg = perItemMean?.[it.id];
    return typeof avg === "number" && Number.isFinite(avg) ? avg : null;
  }

  const renderItemsOnAxis = (isReveal ? q.items : onAxis).filter(
    (it) => viewValueFor(it) !== null
  );

  function colorOf(it: CurseurMultiQuestion["items"][number]): string {
    if (it.color) return it.color;
    const stableIdx = q.items.findIndex((x) => x.id === it.id);
    return PALETTE[stableIdx % PALETTE.length];
  }

  function startDrag(id: string, e: React.PointerEvent) {
    if (isReveal) return;
    e.preventDefault();
    setDragId(id);
    setDragSource(positions[id] === null ? "tray" : "axis");
    setPointerPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <div ref={rootRef} style={{ padding: compact ? "8px 0 8px" : "16px 0 16px" }}>
      {!isReveal ? (
        <div
          ref={trayRef}
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background:
              dragId !== null && hoverInsertIdx !== null
                ? "rgba(255,200,69,0.16)"
                : "var(--cream-warm)",
            border:
              dragId !== null && hoverInsertIdx !== null
                ? "1.5px dashed var(--ink)"
                : "1.5px dashed var(--rule)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            minHeight: 52,
            transition: "background 0.15s ease, border-color 0.15s ease",
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
            {/* Compteur de ce qui reste (même sens que « Encore N à placer »). */}
            À placer ·{" "}
            {q.items.filter((it) => positions[it.id] === null && it.id !== dragId).length}
          </div>
          {(() => {
            const visibleChips = trayItems.filter((it) => it.id !== dragId);
            const nodes: React.ReactNode[] = [];
            const insertActive =
              dragId !== null && hoverInsertIdx !== null;
            visibleChips.forEach((it, visibleIdx) => {
              if (insertActive && hoverInsertIdx === visibleIdx) {
                nodes.push(<DropIndicator key={`ind-${visibleIdx}`} />);
              }
              const color = colorOf(it);
              nodes.push(
                <TrayChip
                  key={it.id}
                  it={it}
                  color={color}
                  compact={compact}
                  onPointerDown={(e) => startDrag(it.id, e)}
                  onKeyPlace={() => keyPlace(it.id)}
                />
              );
            });
            if (insertActive && hoverInsertIdx === visibleChips.length) {
              nodes.push(<DropIndicator key="ind-end" />);
            }
            if (dragId !== null) {
              const draggedIt = trayItems.find((it) => it.id === dragId);
              if (draggedIt) {
                nodes.push(
                  <TrayChip
                    key={draggedIt.id}
                    it={draggedIt}
                    color={colorOf(draggedIt)}
                    compact={compact}
                    collapsing
                    onPointerDown={() => {}}
                  />
                );
              }
            }
            return nodes;
          })()}
          {(() => {
            const visibleCount = trayItems.filter((it) => it.id !== dragId).length;
            if (visibleCount > 0) return null;
            return (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ink-mute)",
                  letterSpacing: "0.04em",
                }}
              >
                {dragId !== null
                  ? "↓ Pose sur l'échelle ou dans le bac"
                  : "✓ Toutes les pastilles sont placées"}
              </span>
            );
          })()}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-soft)",
          letterSpacing: "0.04em",
          gap: 12,
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {q.labelMin ?? q.range[0]}
          {q.labelMin && !compact ? (
            <span style={{ marginLeft: 6, color: "var(--ink-mute)", fontSize: 10 }}>
              ({q.range[0]}
              {q.unit ? " " + q.unit : ""})
            </span>
          ) : null}
        </span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
          {q.labelMax && !compact ? (
            <span style={{ marginRight: 6, color: "var(--ink-mute)", fontSize: 10 }}>
              ({q.range[1]}
              {q.unit ? " " + q.unit : ""})
            </span>
          ) : null}
          {q.labelMax ?? q.range[1]}
        </span>
      </div>

      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: compact ? 110 : 130,
          background: "var(--cream-warm)",
          border: "1.5px solid var(--rule-soft)",
          borderRadius: 18,
          padding: "0 14px",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            top: "50%",
            height: 1.5,
            background: "var(--rule)",
            transform: "translateY(-50%)",
          }}
        />
        {axisTicks(q.range[0], q.range[1]).map((tick) => {
          const pct = ((tick - q.range[0]) / (q.range[1] - q.range[0])) * 100;
          return (
            <div
              key={`tick-${tick}`}
              style={{
                position: "absolute",
                left: `calc(14px + ${pct}% - ${pct * 0.28}px)`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ width: 1, height: 7, background: "var(--rule)" }} />
              <div
                style={{
                  marginTop: 26,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--ink-mute)",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.02em",
                }}
              >
                {tick}
              </div>
            </div>
          );
        })}
        {(() => {
          type Slot = "top-far" | "top" | "center" | "bottom" | "bottom-far";
          const SLOT_ORDER: Slot[] = [
            "top-far",
            "bottom-far",
            "top",
            "bottom",
            "center",
          ];
          let slots: Map<string, Slot>;
          if (dragId === null) {
            const COLLISION_PCT = 14;
            slots = new Map<string, Slot>();
            const sorted = renderItemsOnAxis
              .map((it) => {
                const v = viewValueFor(it);
                return v !== null ? { id: it.id, pct: pctOf(v) } : null;
              })
              .filter((x): x is { id: string; pct: number } => x !== null)
              .sort((a, b) => a.pct - b.pct);

            const clusters: { id: string; pct: number }[][] = [];
            let cur: { id: string; pct: number }[] = [];
            for (const x of sorted) {
              if (
                cur.length === 0 ||
                x.pct - cur[cur.length - 1].pct < COLLISION_PCT
              ) {
                cur.push(x);
              } else {
                clusters.push(cur);
                cur = [x];
              }
            }
            if (cur.length) clusters.push(cur);

            for (const cluster of clusters) {
              if (cluster.length === 1) {
                slots.set(cluster[0].id, "center");
              } else {
                cluster.forEach((x, idx) => {
                  slots.set(x.id, SLOT_ORDER[idx % SLOT_ORDER.length]);
                });
              }
            }
            slotsRef.current = slots;
          } else {
            slots = new Map(slotsRef.current);
            if (!slots.has(dragId)) slots.set(dragId, "center");
            slots.set(dragId, "center");
          }
          const topFor = (id: string): string => {
            const s = slots.get(id) ?? "center";
            if (s === "top-far") return "calc(50% - 40px)";
            if (s === "top") return "calc(50% - 20px)";
            if (s === "bottom") return "calc(50% + 20px)";
            if (s === "bottom-far") return "calc(50% + 40px)";
            return "50%";
          };
          return renderItemsOnAxis.map((it) => {
            const displayVal = viewValueFor(it);
            if (displayVal === null) return null;
            const displayPct = pctOf(displayVal);
            const color = colorOf(it);
            const isDragging = dragId === it.id;
            const top = topFor(it.id);
            const isAnchor = anchors.has(it.id);
            const locked = isReveal || isAnchor;

            return (
              <div
                key={it.id}
                className="curseur-axis-badge"
                data-anchor={isAnchor || undefined}
                onPointerDown={locked ? undefined : (e) => startDrag(it.id, e)}
                // Pastille posée = curseur clavier (role slider) en phase
                // ask : atteignable au Tab, ajustable aux flèches, valeur
                // lue avec l'unité. Un repère n'est qu'une étiquette fixe.
                {...(isReveal
                  ? {}
                  : isAnchor
                    ? {
                        role: "img",
                        "aria-label": `Repère déjà placé : ${it.label}, ${formatTickValue(displayVal, valueDigits)}${unitSuffix}`,
                      }
                    : {
                      role: "slider",
                      tabIndex: 0,
                      "aria-label": it.label,
                      "aria-valuemin": q.range[0],
                      "aria-valuemax": q.range[1],
                      "aria-valuenow": Number(displayVal.toFixed(4)),
                      "aria-valuetext": `${formatTickValue(displayVal, valueDigits)}${unitSuffix}`,
                      "data-curseur-focus": `axis:${it.id}`,
                      onKeyDown: (e: React.KeyboardEvent) =>
                        axisKeyDown(it.id, displayVal, e),
                    })}
                style={{
                  position: "absolute",
                  left: `calc(14px + ${displayPct}% - ${displayPct * 0.28}px)`,
                  top,
                  transform: "translate(-50%, -50%)",
                  padding: "5px 11px",
                  borderRadius: 99,
                  background: color,
                  color: "var(--ink)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: compact ? 11.5 : 13,
                  border: `1.5px ${isAnchor ? "dashed" : "solid"} var(--ink)`,
                  cursor: locked ? "default" : isDragging ? "grabbing" : "grab",
                  whiteSpace: "nowrap",
                  touchAction: "none",
                  userSelect: "none",
                  boxShadow: isDragging
                    ? "0 4px 12px rgba(0,0,0,0.18)"
                    : isAnchor
                      ? "none"
                      : "0 1px 0 var(--ink)",
                  zIndex: isDragging ? 5 : 1,
                  /// Sur l'axe en reveal, la transition `left 0.7s` anime aussi le
                  /// switch d'onglet (Mes réponses → Réalité → Autres joueurs) :
                  /// les pastilles glissent d'une position à l'autre, ce qui rend
                  /// la comparaison entre vues visuellement lisible.
                  transition: isReveal
                    ? "left 0.7s cubic-bezier(.2,.7,.2,1), box-shadow 0.18s, z-index 0s"
                    : "box-shadow 0.18s, z-index 0s",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{it.label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--ink-soft)",
                    fontVariantNumeric: "tabular-nums",
                    opacity: 0.85,
                  }}
                >
                  · {formatTickValue(displayVal, valueDigits)}
                </span>
              </div>
            );
          });
        })()}
      </div>
      {compact && q.unit ? (
        <div
          style={{
            marginTop: 6,
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}
        >
          {q.unit}
        </div>
      ) : null}
      {pointerPos && dragId && dragSource === "tray" ? (() => {
        const it = q.items.find((x) => x.id === dragId);
        if (!it) return null;
        const color = colorOf(it);
        return (
          <div
            style={{
              position: "fixed",
              left: pointerPos.x,
              top: pointerPos.y,
              transform: "translate(-50%, -50%)",
              padding: "6px 12px",
              borderRadius: 99,
              background: color,
              color: "var(--ink)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              border: "1.5px solid var(--ink)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              zIndex: 1000,
              whiteSpace: "nowrap",
            }}
          >
            {it.label}
          </div>
        );
      })() : null}
    </div>
  );
}
