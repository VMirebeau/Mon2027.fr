"use client";

import { useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { VraiFauxMultiQuestion } from "@/lib/types";
import { answerLevel, LEVEL_LABEL, scoreVraiFauxMulti } from "@/lib/correctness";
import { vraiFauxMultiCommunityLine } from "@/lib/community-lines";
import { phaseAtLeast } from "@/lib/reveal-phase";
import {
  CommunityReadLine,
  CommunityStatsToggle,
  type FormatProps,
  ScoreChip,
} from "./format-shared";
import { QuestionShell } from "../question-shell";

type Picks = Record<string, boolean>;

type CommonProps = FormatProps<VraiFauxMultiQuestion, Picks>;

export function VraiFauxMultiQuestionScreen({
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
  const perStatement =
    liveStats && liveStats.hasRealData ? liveStats.perStatement : undefined;
  const isRevealing = revealPhase !== "ask";
  const [picks, setPicks] = useState<Picks>(lockedAnswer ?? draft ?? {});
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  /// Toggle global pour les CommunityBaro par énoncé. Caché par défaut,
  /// cohérent avec QCM / catégorisation / etc.
  const [showStats, setShowStats] = useState(false);

  function pick(id: string, val: boolean) {
    if (isRevealing) return;
    // Compute hors-updater pour ne pas appeler onDraft (setState parent)
    // depuis l'intérieur d'un updater de setState — React 19 strict mode
    // rejoue les updaters et signale tout side-effect comme "setState
    // during render".
    const next = { ...picks, [id]: val };
    setPicks(next);
    onDraft?.(next);
  }
  function toggleOpen(id: string) {
    setOpened((o) => ({ ...o, [id]: !o[id] }));
  }
  const allAnswered = q.statements.every((s) => picks[s.id] !== undefined);
  const effectivePicks = lockedAnswer ?? picks;
  const score = scoreVraiFauxMulti(effectivePicks, q);
  /// Niveau unique (règle « N éléments sur M justes », lib/correctness).
  const level = answerLevel(q, effectivePicks);
  /// Lecture collective par défaut, dès la phase comparaison (rien sous le
  /// seuil de réponses).
  const communityLine = phaseAtLeast(revealPhase, "comparison")
    ? vraiFauxMultiCommunityLine(q, liveStats)
    : null;

  return (
    <QuestionShell
      q={q}
      index={index}
      total={total}
      accent={accent}
      phase={revealPhase}
      isLast={isLast}
      lockedAnswer={lockedAnswer}
      // Même libellé que les autres formats (« Valider »).
      validateLabel="Valider"
      canSubmit={allAnswered}
      onSubmit={() => onSubmit(picks)}
      onAbort={onAbort}
      onTerminate={onTerminate}
      hasAnyAnswer={hasAnyAnswer}
      onNext={onNext}
    >
      <div
        className="q-body-pad"
        style={{
          paddingTop: isDesktop ? 22 : 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {q.statements.map((s, i) => (
          <StatementRow
            key={s.id}
            s={s}
            i={i}
            pick={effectivePicks[s.id]}
            onPick={(v) => pick(s.id, v)}
            isReveal={isRevealing}
            opened={!!opened[s.id]}
            toggleOpen={() => toggleOpen(s.id)}
            compact={!isDesktop}
            communityStats={perStatement?.[s.id]}
            showStats={showStats}
          />
        ))}
      </div>

      {isRevealing ? (
        <div
          className="q-reveal-pad"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <ScoreChip pop kind={level}>
            {LEVEL_LABEL[level]} · {score} / {q.statements.length} correctes
          </ScoreChip>
          <CommunityReadLine text={communityLine} />
          <CommunityStatsToggle
            open={showStats}
            onToggle={() => setShowStats((v) => !v)}
            hasData={!!perStatement}
            marginTop={0}
          />
        </div>
      ) : null}
    </QuestionShell>
  );
}

function StatementRow({
  s,
  i,
  pick,
  onPick,
  isReveal,
  opened,
  toggleOpen,
  compact,
  communityStats,
  showStats,
}: {
  s: { id: string; text: string; correct: boolean; why?: string };
  i: number;
  pick: boolean | undefined;
  onPick: (v: boolean) => void;
  isReveal: boolean;
  opened: boolean;
  toggleOpen: () => void;
  compact: boolean;
  communityStats?: { pctTrue: number; pctFalse: number };
  /// Gate la CommunityBaro par énoncé. Pilotée par le toggle global du Body.
  showStats: boolean;
}) {
  const userWasRight = pick === s.correct;
  const userAnswered = pick !== undefined;
  return (
    <div
      style={{
        background: isReveal
          ? userWasRight
            ? "rgba(74,143,92,0.08)"
            : "rgba(199,93,93,0.06)"
          : "var(--cream-warm)",
        border: isReveal
          ? userWasRight
            ? "1.5px solid rgba(74,143,92,0.4)"
            : "1.5px solid rgba(199,93,93,0.4)"
          : "1.5px solid var(--rule-soft)",
        borderRadius: 14,
        padding: compact ? "10px 12px" : "14px 16px",
        transition: "background 0.4s ease, border-color 0.4s ease",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.06em",
            minWidth: 18,
            paddingTop: compact ? 2 : 3,
          }}
        >
          {String.fromCharCode(65 + i)}.
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="display"
            style={{
              fontWeight: 500,
              fontSize: compact ? 13 : 14.5,
              lineHeight: 1.3,
              color: "var(--ink)",
            }}
          >
            {s.text}
          </div>
          {isReveal ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {/* « Réponse : faux » en encre, pas en rouge : la couleur dit
                  juste/faux (fond de la ligne, ✓/✗ du choix), jamais la
                  valeur Vrai/Faux — sinon un « faux » trouvé s'affichait en
                  rouge comme une erreur. */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--ink)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Réponse : {s.correct ? "vrai" : "faux"}
              </span>
              {userAnswered ? (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: userWasRight ? "var(--signal-good-ink)" : "var(--signal-bad-ink)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  · ton choix : {pick ? "vrai" : "faux"}{" "}
                  <span aria-hidden>{userWasRight ? "✓" : "✗"}</span>
                  <span className="sr-only">
                    {userWasRight ? "(bien vu)" : "(pas cette fois)"}
                  </span>
                </span>
              ) : null}
              {s.why ? (
                <button
                  type="button"
                  onClick={toggleOpen}
                  aria-expanded={opened}
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    padding: "4px 9px",
                    borderRadius: 99,
                    background: opened ? "var(--ink)" : "transparent",
                    color: opened ? "var(--yellow)" : "var(--ink-soft)",
                    border: "1px solid " + (opened ? "var(--ink)" : "var(--rule)"),
                    cursor: "pointer",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {opened ? "Replier ↑" : "Pourquoi ?"}
                </button>
              ) : null}
            </div>
          ) : null}
          {isReveal && opened && s.why ? (
            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-serif)",
                fontSize: compact ? 12.5 : 13.5,
                lineHeight: 1.45,
                color: "var(--ink-soft)",
                borderLeft: "2px solid var(--yellow)",
                paddingLeft: 10,
              }}
            >
              {s.why}
            </div>
          ) : null}
          {isReveal && showStats && communityStats ? (
            <CommunityBaro
              pctTrue={communityStats.pctTrue}
              pctFalse={communityStats.pctFalse}
              correctAnswer={s.correct}
              compact={compact}
            />
          ) : null}
        </div>
        {!isReveal ? (
          <div
            role="group"
            aria-label={`Affirmation ${String.fromCharCode(65 + i)}`}
            style={{
              display: "flex",
              background: "var(--cream)",
              borderRadius: 99,
              border: "1px solid var(--rule)",
              padding: 2,
              flexShrink: 0,
              alignSelf: "center",
            }}
          >
            {/* Cibles tactiles 44×44 (WCAG 2.5.5) : les anciennes 30×28
                se ratent au pouce. aria-label complet car « V » / « F »
                seuls ne disent rien hors contexte au lecteur d'écran. */}
            <button
              type="button"
              onClick={() => onPick(true)}
              aria-pressed={pick === true}
              aria-label={`Vrai : ${s.text}`}
              style={vfBtnStyle(pick === true, "teal")}
            >
              V
            </button>
            <button
              type="button"
              onClick={() => onPick(false)}
              aria-pressed={pick === false}
              aria-label={`Faux : ${s.text}`}
              style={vfBtnStyle(pick === false, "coral")}
            >
              F
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommunityBaro({
  pctTrue,
  pctFalse,
  correctAnswer,
  compact,
}: {
  pctTrue: number;
  pctFalse: number;
  correctAnswer: boolean;
  compact: boolean;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div
        className="mono"
        style={{
          fontSize: compact ? 9 : 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span>
          <strong style={{ color: "var(--ink)", fontSize: compact ? 11 : 12 }}>
            {pctTrue}&nbsp;%
          </strong>{" "}
          vrai
        </span>
        <span style={{ textAlign: "right" }}>
          faux{" "}
          <strong style={{ color: "var(--ink)", fontSize: compact ? 11 : 12 }}>
            {pctFalse}&nbsp;%
          </strong>
        </span>
      </div>
      <div
        style={{
          display: "flex",
          height: 5,
          background: "var(--cream-deep)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: pctTrue + "%",
            background: correctAnswer ? "var(--signal-good)" : "var(--ink-mute)",
            transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
          }}
        />
        <div
          style={{
            width: pctFalse + "%",
            background: !correctAnswer ? "var(--signal-good)" : "var(--ink-mute)",
            transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
          }}
        />
      </div>
    </div>
  );
}

function vfBtnStyle(active: boolean, color: "teal" | "coral"): React.CSSProperties {
  const c = color === "teal" ? "var(--teal)" : "var(--coral)";
  return {
    width: 44,
    height: 44,
    border: 0,
    borderRadius: 99,
    background: active ? c : "transparent",
    color: active ? "var(--ink)" : "var(--ink-soft)",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  };
}
