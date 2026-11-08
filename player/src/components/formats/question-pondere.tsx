"use client";

import { useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { PondereQuestion } from "@/lib/types";
import { answerLevel, LEVEL_LABEL, scorePondere } from "@/lib/correctness";
import { pondereCommunityLine } from "@/lib/community-lines";
import { phaseAtLeast } from "@/lib/reveal-phase";
import {
  CommunityReadLine,
  type FormatProps,
  RevealSection,
  ScoreChip,
} from "./format-shared";
import { QuestionShell } from "../question-shell";

type Alloc = Record<string, number>;

type CommonProps = FormatProps<PondereQuestion, Alloc>;

/// « 1 pt » / « 12 pts ».
function pts(n: number): string {
  return `${n} pt${Math.abs(n) > 1 ? "s" : ""}`;
}

/// Écart joueur − réalité en clair : « +12 pts de trop », « 8 pts
/// manquants », « pile ». Avant : « écart +12 », sans sens ni unité.
function diffLabel(diff: number): string {
  if (diff === 0) return "pile";
  return diff > 0 ? `+${pts(diff)} de trop` : `${pts(-diff)} manquant${-diff > 1 ? "s" : ""}`;
}

/// Couleur de texte de l'écart (teintes foncées *-ink, ≥ 4,5:1).
function diffColor(diff: number): string {
  return Math.abs(diff) <= 5
    ? "var(--signal-good-ink)"
    : Math.abs(diff) <= 15
      ? "var(--signal-mid-ink)"
      : "var(--signal-bad-ink)";
}

export function PondereQuestionScreen({
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
  const initialAlloc: Alloc =
    lockedAnswer ?? draft ?? Object.fromEntries(q.categories.map((c) => [c.id, 0]));
  const [alloc, setAlloc] = useState<Alloc>(initialAlloc);
  const perCategoryMean =
    liveStats && liveStats.hasRealData ? liveStats.perCategoryMean : undefined;

  const totalUsed = Object.values(alloc).reduce((a, b) => a + b, 0);
  const remaining = q.pool - totalUsed;
  const canSubmit = totalUsed === q.pool;

  /** Affecte directement une valeur à la catégorie, en respectant la
   *  contrainte de somme : on clamp au max disponible (pool - somme_des_autres).
   *  Cela rend impossible le dépassement de 100 quoi que l'utilisateur fasse. */
  function setVal(catId: string, newVal: number) {
    if (isRevealing) return;
    // Compute hors-updater pour pouvoir notifier `onDraft` sans déclencher
    // un setState parent depuis l'intérieur d'un updater (React 19 strict
    // mode rejoue les updaters et signale tout side-effect comme "setState
    // during render"). L'event handler tourne sur l'état déjà commité,
    // donc `alloc` est à jour pour un seul slider à la fois.
    const otherTotal = Object.entries(alloc).reduce(
      (acc, [k, v]) => acc + (k === catId ? 0 : v),
      0,
    );
    const maxAllowed = q.pool - otherTotal;
    const clamped = Math.max(0, Math.min(maxAllowed, Math.round(newVal)));
    const next = { ...alloc, [catId]: clamped };
    setAlloc(next);
    onDraft?.(next);
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
        // « 35 pts » seul était obscur : on dit ce qu'il reste à faire.
        canSubmit
          ? "Valider"
          : remaining > 0
            ? `Encore ${pts(remaining)} à répartir`
            : `${pts(-remaining)} en trop`
      }
      canSubmit={canSubmit}
      onSubmit={() => onSubmit(alloc)}
      onAbort={onAbort}
      onTerminate={onTerminate}
      onNext={onNext}
      hasAnyAnswer={hasAnyAnswer}
    >
      <div
        className="q-body-pad"
        style={{ paddingTop: isDesktop ? 14 : 10 }}
      >
        {!isRevealing ? (
          <>
            <div
              style={{
                marginBottom: 12,
                fontFamily: "var(--font-mono)",
                fontSize: isDesktop ? 11 : 10,
                color: "var(--ink-mute)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {q.step > 1
                ? `Par tranches de ${q.step} points · total à atteindre : ${q.pool}`
                : `Total à atteindre : ${q.pool} points`}
            </div>
            <PondereStatusBanner totalUsed={totalUsed} pool={q.pool} />
          </>
        ) : null}

        <div
          style={{
            marginTop: isRevealing ? 0 : 16,
            display: "flex",
            flexDirection: "column",
            gap: isDesktop ? 12 : 10,
          }}
        >
          {q.categories.map((cat) => (
            <PondereRow
              key={cat.id}
              cat={cat}
              value={alloc[cat.id] ?? 0}
              setVal={setVal}
              otherTotal={totalUsed - (alloc[cat.id] ?? 0)}
              step={q.step}
              pool={q.pool}
              isReveal={isRevealing}
              compact={!isDesktop}
              communityMean={perCategoryMean?.[cat.id]}
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
            <PondereRevealCol
              q={q}
              alloc={alloc}
              perCategoryMean={perCategoryMean}
              communityLine={
                phaseAtLeast(revealPhase, "comparison")
                  ? pondereCommunityLine(q, liveStats)
                  : null
              }
            />
          </div>
        ) : null}
      </div>
    </QuestionShell>
  );
}

function PondereRevealCol({
  q,
  alloc,
  perCategoryMean,
  communityLine,
}: {
  q: PondereQuestion;
  alloc: Alloc;
  perCategoryMean?: Record<string, number>;
  /// Lecture collective par défaut (null sous le seuil de réponses).
  communityLine: string | null;
}) {
  const pct = scorePondere(alloc, q);
  // Niveau unique (≥ 85 % du pool bon, ≥ 65 % moyen, lib/correctness).
  const level = answerLevel(q, alloc);
  return (
    <div>
      <ScoreChip pop kind={level}>
        {LEVEL_LABEL[level]} · {Math.round(pct)} / {q.pool} bien répartis
      </ScoreChip>
      {communityLine ? (
        <div style={{ marginTop: 10 }}>
          <CommunityReadLine text={communityLine} />
        </div>
      ) : null}
      <RevealSection title="Écart par catégorie" tag="Réalité" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.categories.map((c) => {
            const userVal = alloc[c.id] ?? 0;
            const diff = userVal - c.real;
            const avg = perCategoryMean?.[c.id];
            return (
              <div key={c.id}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: c.color,
                      transform: "translateY(-1px)",
                    }}
                  />
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, flex: 1 }}>
                    {c.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: diffColor(diff),
                      letterSpacing: "0.04em",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {diffLabel(diff)}
                  </span>
                </div>
                {typeof avg === "number" ? (
                  <div
                    className="mono"
                    style={{
                      marginLeft: 18,
                      marginTop: 2,
                      fontSize: 10,
                      color: "var(--ink-mute)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Toi {userVal} · Joueurs {avg.toFixed(0)} · Réel {c.real}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </RevealSection>
    </div>
  );
}

function PondereRow({
  cat,
  value,
  setVal,
  otherTotal,
  step,
  pool,
  isReveal,
  compact,
  communityMean,
}: {
  cat: { id: string; label: string; real: number; color?: string };
  value: number;
  setVal: (catId: string, newVal: number) => void;
  otherTotal: number;
  step: number;
  pool: number;
  isReveal: boolean;
  compact: boolean;
  communityMean?: number;
}) {
  if (isReveal) {
    const userPct = (value / pool) * 100;
    const realPct = (cat.real / pool) * 100;
    const diff = value - cat.real;
    return (
      <div
        style={{
          padding: compact ? "10px 12px" : "14px 16px",
          background: "var(--cream-warm)",
          border: "1.5px solid var(--rule-soft)",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: cat.color, flexShrink: 0 }} />
            <span
              className="display"
              style={{ fontWeight: 600, fontSize: compact ? 13.5 : 15, overflowWrap: "anywhere" }}
            >
              {cat.label}
            </span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              color: diffColor(diff),
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {diffLabel(diff)}
          </span>
        </div>
        <div style={{ marginBottom: 6 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-mute)",
              marginBottom: 2,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <span>Toi</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
          <div style={{ height: 6, background: "var(--cream-deep)", borderRadius: 99 }}>
            <div
              style={{
                height: "100%",
                width: `${userPct}%`,
                background: "var(--ink-mute)",
                borderRadius: 99,
              }}
            />
          </div>
        </div>
        {typeof communityMean === "number" ? (
          <div style={{ marginBottom: 6 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ink-mute)",
                marginBottom: 2,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <span>Joueurs</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {communityMean.toFixed(0)}
              </span>
            </div>
            <div style={{ height: 6, background: "var(--cream-deep)", borderRadius: 99 }}>
              <div
                style={{
                  height: "100%",
                  width: `${(communityMean / pool) * 100}%`,
                  background: "transparent",
                  borderRadius: 99,
                  border: "1.5px dashed var(--ink-mute)",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        ) : null}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink)",
              marginBottom: 2,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            <span>Réel</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{cat.real}</span>
          </div>
          <div style={{ height: 8, background: "var(--cream-deep)", borderRadius: 99 }}>
            <div
              style={{
                height: "100%",
                width: `${realPct}%`,
                background: cat.color,
                borderRadius: 99,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const myMax = Math.max(0, pool - otherTotal);
  return (
    <div
      style={{
        padding: compact ? "10px 12px" : "14px 16px",
        background: "var(--cream-warm)",
        border: value > 0 ? "1.5px solid " + cat.color : "1.5px solid var(--rule-soft)",
        borderRadius: 14,
        transition: "border-color 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 99,
              background: cat.color,
              flexShrink: 0,
            }}
          />
          <span
            className="display"
            style={{
              fontWeight: 600,
              fontSize: compact ? 14 : 16,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cat.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
          <div
            className="display"
            style={{
              fontWeight: 700,
              fontSize: compact ? 18 : 22,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              minWidth: 28,
              textAlign: "right",
              color: value > 0 ? "var(--ink)" : "var(--ink-mute)",
              transition: "color 0.2s",
            }}
          >
            {value}
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-mute)",
            }}
          >
            / {pool}
          </span>
        </div>
      </div>
      <PondereSlider
        value={value}
        pool={pool}
        myMax={Math.min(pool, value + myMax)}
        step={step}
        color={cat.color ?? "var(--ink)"}
        onChange={(v) => setVal(cat.id, v)}
        label={cat.label}
      />
    </div>
  );
}

/** Bannière d'état du total : visible en permanence en haut de la zone de
 *  sliders. Passe en vert + ✓ quand totalUsed === pool, en coral sinon avec
 *  affichage du nombre de points restants. Track + fill comme une barre de
 *  progression géante pour donner un feedback visuel net. */
function PondereStatusBanner({
  totalUsed,
  pool,
}: {
  totalUsed: number;
  pool: number;
}) {
  const remaining = pool - totalUsed;
  const done = remaining === 0;
  const over = remaining < 0;
  const pct = Math.max(0, Math.min(100, (totalUsed / pool) * 100));
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: done ? "rgba(74,143,92,0.10)" : "var(--cream-warm)",
        border: done
          ? "1.5px solid var(--signal-good)"
          : over
            ? "1.5px solid var(--signal-bad)"
            : "1.5px solid var(--rule-soft)",
        borderRadius: 14,
        padding: "10px 14px",
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          {done ? (
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: 99,
                background: "var(--signal-good)",
                color: "var(--cream-warm)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 13,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ✓
            </span>
          ) : null}
          <span
            className="display"
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: done
                ? "var(--signal-good)"
                : over
                  ? "var(--signal-bad)"
                  : "var(--ink-soft)",
              letterSpacing: "-0.005em",
            }}
          >
            {done
              ? "Tous les points sont répartis"
              : over
                ? `${pts(Math.abs(remaining))} en trop`
                : `Encore ${pts(remaining)} à répartir`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
          <span
            className="display tnum"
            style={{
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: done
                ? "var(--signal-good)"
                : over
                  ? "var(--signal-bad)"
                  : "var(--ink)",
              transition: "color 0.2s",
            }}
          >
            {totalUsed}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-mute)",
            }}
          >
            / {pool}
          </span>
        </div>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--cream-deep)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: done
              ? "var(--signal-good)"
              : over
                ? "var(--signal-bad)"
                : "var(--ink)",
            borderRadius: 99,
            transition: "width 0.2s ease, background 0.2s",
          }}
        />
      </div>
    </div>
  );
}

/** Slider stylisé pour le pondéré. L'échelle est TOUJOURS [0, pool], pour
 *  l'input comme pour le dessin : même graduation d'une ligne à l'autre, en
 *  accord avec l'étiquette « / 100 ». Avant, l'input avait max = reste +
 *  valeur et une largeur réduite d'autant — l'échelle changeait d'une ligne
 *  à l'autre (et au clavier / lecteur d'écran, le max annoncé variait). Le
 *  plafond (`myMax`) est appliqué au changement : le pouce bute sur le reste
 *  disponible, matérialisé par un trait sur la piste. */
function PondereSlider({
  value,
  pool,
  myMax,
  step,
  color,
  onChange,
  label,
}: {
  value: number;
  pool: number;
  myMax: number;
  step: number;
  color: string;
  onChange: (v: number) => void;
  /// Nom de la catégorie, pour le lecteur d'écran.
  label: string;
}) {
  const fillPct = (value / pool) * 100;
  const maxPct = (myMax / pool) * 100;
  return (
    <div style={{ position: "relative", padding: "6px 0" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 8,
          transform: "translateY(-50%)",
          background: "var(--cream-deep)",
          borderRadius: 99,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${fillPct}%`,
            background: color,
            borderRadius: 99,
            transition: "width 0.12s ease-out",
          }}
        />
      </div>
      {/* Butée : jusqu'où ce curseur peut aller avec les points restants. */}
      {maxPct < 100 ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: `${maxPct}%`,
            width: 2,
            height: 14,
            transform: "translate(-50%, -50%)",
            background: "var(--ink-mute)",
            borderRadius: 1,
            pointerEvents: "none",
          }}
        />
      ) : null}
      <input
        type="range"
        min={0}
        max={pool}
        step={step}
        value={value}
        onChange={(e) =>
          onChange(Math.min(myMax, parseInt(e.target.value, 10)))
        }
        aria-label={label}
        aria-valuetext={`${value} points sur ${pool}`}
        style={{
          position: "relative",
          width: "100%",
          height: 24,
          appearance: "none",
          WebkitAppearance: "none",
          background: "transparent",
          margin: 0,
          padding: 0,
          cursor: "pointer",
          touchAction: "none",
          zIndex: 1,
        }}
        className="pondere-slider"
      />
    </div>
  );
}
