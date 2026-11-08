"use client";

import { useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import {
  communityContrastLine,
  CommunityStatsToggle,
  type FormatProps,
  VerdictIconXL,
  VerdictRevealBanner,
} from "./format-shared";
import { QuestionShell } from "../question-shell";
import { fmt } from "@/lib/fmt";
import { isCorrect } from "@/lib/correctness";
import type { AbQuestion } from "@/lib/types";
import { phaseAtLeast } from "@/lib/reveal-phase";

/// A/B — deux cartes alternatives, choix unique. Mobile : cartes en flex
/// column compactes avec valeur en serif sous le label, mini-bar comm.
/// répartie sous les choix. Desktop : grille 2 colonnes (dt-ab-grid) avec
/// valeur intégrée dans la carte + community bar nestée, VerdictBanner
/// serif sous la grille.
export function AbQuestionScreen({
  q,
  index,
  total,
  accent,
  onSubmit,
  onAbort,
  revealPhase = "ask",
  lockedAnswer = null,
  onNext,
  isLast = false,
  onTerminate,
  hasAnyAnswer,
  draft,
  onDraft,
}: FormatProps<AbQuestion, 0 | 1>) {
  const isDesktop = useIsDesktop();
  /// Init depuis le brouillon GameState : hydrate la sélection courante au
  /// (re)montage, ce qui rend le pick résistant au flip de breakpoint.
  const [pick, setPick] = useState<0 | 1 | null>(draft ?? null);
  const [showStats, setShowStats] = useState(false);
  const isRevealing = revealPhase !== "ask";
  const effectivePick = isRevealing ? lockedAnswer : pick;

  function choose(p: 0 | 1) {
    setPick(p);
    onDraft?.(p);
  }

  const showVerdict = phaseAtLeast(revealPhase, "verdict");
  const showTruth = phaseAtLeast(revealPhase, "truth");
  const showComparison = phaseAtLeast(revealPhase, "comparison");

  const v0 = q.choices[0].valeur;
  const v1 = q.choices[1].valeur;
  const hasValues = typeof v0 === "number" && typeof v1 === "number";
  const userCorrect = lockedAnswer !== null && isCorrect(q, lockedAnswer);

  const pctCorrect = q.pctClose ?? 0;
  const pctWrong = q.pctOff ?? 0;
  const hasCommunityStats = pctCorrect > 0 || pctWrong > 0;
  const pctByIndex = (i: number) =>
    i === q.correctIndex ? pctCorrect : pctWrong;

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
      canSubmit={pick !== null}
      onSubmit={() => onSubmit(pick)}
      onAbort={onAbort}
      onTerminate={onTerminate}
      onNext={onNext}
      hasAnyAnswer={hasAnyAnswer}
    >
      {isDesktop ? (
        <div className="dt-ab-grid">
          {q.choices.map((c, i) => {
            const sel = effectivePick === i;
            const isAnswer = i === q.correctIndex;
            const isUserPick = i === effectivePick;
            const verdictPickClass =
              showVerdict && isUserPick
                ? userCorrect
                  ? " verdict-pick-good"
                  : " verdict-pick-bad"
                : "";
            const verdictTruthClass =
              showVerdict && isAnswer && !isUserPick ? " verdict-truth" : "";
            return (
              <button
                key={i}
                className={
                  "dt-ab-card" +
                  (sel && !isRevealing ? " selected" : "") +
                  verdictPickClass +
                  verdictTruthClass
                }
                onClick={() => !isRevealing && choose(i as 0 | 1)}
                disabled={isRevealing}
                aria-pressed={isUserPick}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: sel && !isRevealing
                        ? "var(--ink)"
                        : "var(--cream-deep)",
                      color: sel && !isRevealing
                        ? "var(--yellow)"
                        : "var(--ink-soft)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 700,
                      fontSize: 18,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                  {!showVerdict && sel ? <SelectedDot size={26} /> : null}
                </div>
                {showVerdict && (isAnswer || isUserPick) ? (
                  <VerdictIconXL good={isAnswer} size={48} />
                ) : null}
                <div className="lbl">{c.label}</div>
                {hasValues ? (
                  <div
                    aria-hidden={!showTruth}
                    style={{
                      marginTop: "auto",
                      opacity: showTruth ? 1 : 0,
                      transform: showTruth
                        ? "translateY(0)"
                        : "translateY(8px)",
                      transition:
                        "opacity 0.45s cubic-bezier(.2,.7,.2,1), transform 0.45s cubic-bezier(.2,.7,.2,1)",
                      transitionDelay: i === 0 ? "0s" : "0.12s",
                    }}
                  >
                    <div
                      className="ab-valeur"
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: 38,
                        fontWeight: 600,
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "-0.02em",
                        marginBottom: 10,
                      }}
                    >
                      {fmt(i === 0 ? v0! : v1!)}
                      {q.unite ? (
                        <span
                          style={{
                            fontSize: 14,
                            color: "var(--ink-mute)",
                            marginLeft: 6,
                            fontWeight: 500,
                          }}
                        >
                          {q.unite}
                        </span>
                      ) : null}
                    </div>
                    {hasCommunityStats && showStats ? (
                      <div style={{ marginTop: 4 }}>
                        <div
                          className="mono"
                          style={{
                            fontSize: 10,
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
                            <strong
                              style={{
                                color: "var(--ink)",
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              {pctByIndex(i)}&nbsp;%
                            </strong>{" "}
                            des joueurs
                          </span>
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
                              width: pctByIndex(i) + "%",
                              background:
                                i === q.correctIndex
                                  ? "var(--signal-good)"
                                  : "var(--ink-mute)",
                              transformOrigin: "left",
                              transform: `scaleX(${showComparison ? 1 : 0})`,
                              transition: `transform 0.6s cubic-bezier(.2,.7,.2,1) ${
                                0.1 + i * 0.12
                              }s`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : c.note ? (
                  <div
                    style={{
                      marginTop: "auto",
                      fontSize: 13,
                      color: "var(--ink-mute)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {c.note}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            padding: "20px 24px 0",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {q.choices.map((c, i) => {
            const selected = effectivePick === i;
            const isAnswer = i === q.correctIndex;
            const isUserPick = i === effectivePick;
            const verdictClass =
              showVerdict && isUserPick
                ? userCorrect
                  ? " verdict-pick-good"
                  : " verdict-pick-bad"
                : showVerdict && isAnswer && !isUserPick
                  ? " verdict-truth"
                  : "";
            return (
              <button
                key={i}
                className={
                  "ab-card" +
                  (selected && !isRevealing ? " selected" : "") +
                  verdictClass
                }
                onClick={() => !isRevealing && choose(i as 0 | 1)}
                disabled={isRevealing}
                aria-pressed={isUserPick}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      className="display"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: selected && !isRevealing
                          ? "var(--ink)"
                          : "var(--cream)",
                        color: selected && !isRevealing
                          ? "var(--yellow)"
                          : "var(--ink-soft)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {String.fromCharCode(65 + i)}
                    </div>
                    <div
                      style={{ fontWeight: 600, fontSize: 19, lineHeight: 1.15 }}
                    >
                      {c.label}
                    </div>
                  </div>
                  {showVerdict && isAnswer && !isUserPick ? (
                    <VerdictBadgeGood muted />
                  ) : !showVerdict && selected ? (
                    <SelectedDot size={22} />
                  ) : null}
                </div>
                {showVerdict && isUserPick ? (
                  <VerdictIconXL good={userCorrect} size={36} />
                ) : null}
                {hasValues ? (
                  <div
                    aria-hidden={!showTruth}
                    style={{
                      marginTop: 10,
                      opacity: showTruth ? 1 : 0,
                      transform: showTruth
                        ? "translateY(0)"
                        : "translateY(6px)",
                      transition:
                        "opacity 0.4s ease, transform 0.4s cubic-bezier(.2,.7,.2,1)",
                      transitionDelay: i === 0 ? "0s" : "0.1s",
                      fontFamily: "var(--font-serif)",
                      fontSize: 26,
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {fmt(i === 0 ? v0! : v1!)}
                    {q.unite ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--ink-mute)",
                          marginLeft: 6,
                          fontWeight: 500,
                        }}
                      >
                        {q.unite}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Toggle communauté en reveal — wrappé différemment selon le viewport
          mais même contenu fonctionnel. Sur mobile, on précède le toggle du
          verdict ÉCRIT compact (« Bien vu » / « Pas cette fois » + « La
          réponse est X » + ligne communauté) : avant, seule la couleur des
          cartes disait le résultat. Sur desktop, le bandeau vit plus bas. */}
      {isRevealing ? (
        <div
          style={
            isDesktop ? { marginTop: 14 } : { padding: "12px 24px 0" }
          }
        >
          {!isDesktop && showVerdict ? (
            <div style={{ marginBottom: 10 }}>
              <VerdictRevealBanner
                compact
                visible={showVerdict}
                correct={userCorrect}
                truth={
                  showTruth ? (
                    <>
                      La réponse est{" "}
                      <strong>{q.choices[q.correctIndex].label}</strong>.
                    </>
                  ) : null
                }
                communityLine={
                  showComparison && hasCommunityStats
                    ? communityContrastLine({
                        userCorrect,
                        userPickPct: userCorrect ? pctCorrect : pctWrong,
                        oppositePickPct: userCorrect ? pctWrong : pctCorrect,
                      })
                    : null
                }
              />
            </div>
          ) : null}
          <CommunityStatsToggle
            open={showStats}
            onToggle={() => setShowStats((v) => !v)}
            hasData={hasCommunityStats}
            marginTop={0}
          />
        </div>
      ) : null}

      {/* Répartition des réponses : sur desktop elle vit dans chaque carte
          (bloc nesté ci-dessus), sur mobile elle apparait comme un bloc
          séparé en bas avec libellés explicites. */}
      {!isDesktop && hasCommunityStats && showStats ? (
        <div
          aria-hidden={!showComparison}
          style={{
            padding: "16px 24px 0",
            opacity: showComparison ? 1 : 0,
            transform: showComparison ? "translateY(0)" : "translateY(6px)",
            transition:
              "opacity 0.5s ease, transform 0.5s cubic-bezier(.2,.7,.2,1)",
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
              marginBottom: 10,
            }}
          >
            Répartition des réponses
          </div>
          {q.choices.map((c, i) => {
            const pct = pctByIndex(i);
            const isAnswer = i === q.correctIndex;
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: "var(--ink-soft)" }}>{c.label}</span>
                  <span
                    className="tnum"
                    style={{ fontWeight: 700, color: "var(--ink)" }}
                  >
                    {pct}&nbsp;%
                  </span>
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
                      width: pct + "%",
                      background: isAnswer ? "var(--signal-good)" : "var(--ink-mute)",
                      transformOrigin: "left",
                      transform: `scaleX(${showComparison ? 1 : 0})`,
                      transition: `transform 0.55s cubic-bezier(.2,.7,.2,1) ${
                        0.1 + i * 0.12
                      }s`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* VerdictRevealBanner desktop sous la grille, avec « La réponse est X. ». */}
      {isDesktop && isRevealing ? (
        <VerdictRevealBanner
          visible={showVerdict}
          correct={userCorrect}
          truth={
            <>
              La réponse est{" "}
              <strong>{q.choices[q.correctIndex].label}</strong>.
            </>
          }
          communityLine={
            showComparison && hasCommunityStats
              ? communityContrastLine({
                  userCorrect,
                  userPickPct: userCorrect ? pctCorrect : pctWrong,
                  oppositePickPct: userCorrect ? pctWrong : pctCorrect,
                })
              : null
          }
        />
      ) : null}
    </QuestionShell>
  );
}

/// Coche jaune sur fond ink : marque la carte sélectionnée avant le reveal.
/// Tailles : 22 (mobile, .ab-card) et 26 (desktop, .dt-ab-card).
function SelectedDot({ size }: { size: number }) {
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx} cy={cx} r={cx - 1} fill="var(--ink)" />
      <path
        d={`m${cx - 4} ${cx} 3 3 6-6`}
        stroke="var(--yellow)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function VerdictBadgeGood({ muted = false }: { muted?: boolean }) {
  const color = muted ? "var(--ink-soft)" : "var(--signal-good)";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" role="img" aria-label="bonne réponse">
      <circle cx="12" cy="12" r="11" fill={color} />
      <path
        d="m7 12 3 3 7-7"
        stroke="var(--paper)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

