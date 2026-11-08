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
import { isCorrect } from "@/lib/correctness";
import type { VraiFauxQuestion } from "@/lib/types";
import { phaseAtLeast } from "@/lib/reveal-phase";

/// Vrai/Faux — format simple : une assertion, deux boutons. Le rendu
/// mobile (boutons compacts en row + split-bar reveal) et le rendu
/// desktop (dt-tf-grid + verdict banner serif + community toggle) ont
/// des aspects visuels marqués mais le state et la logique sont
/// strictement identiques — d'où une seule implémentation qui pioche
/// `useIsDesktop()` pour brancher le JSX.
export function VraiFauxQuestionScreen({
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
}: FormatProps<VraiFauxQuestion, boolean>) {
  const isDesktop = useIsDesktop();
  const [pick, setPick] = useState<boolean | null>(draft ?? null);
  function choose(p: boolean) {
    setPick(p);
    onDraft?.(p);
  }
  /// Toggle pour le split bar / community % — caché par défaut.
  const [showStats, setShowStats] = useState(false);
  const isRevealing = revealPhase !== "ask";
  const effectivePick = isRevealing ? lockedAnswer : pick;

  const showVerdict = phaseAtLeast(revealPhase, "verdict");
  const showTruth = phaseAtLeast(revealPhase, "truth");
  const showComparison = phaseAtLeast(revealPhase, "comparison");
  const userCorrect = lockedAnswer !== null && isCorrect(q, lockedAnswer);

  const pctCorrect = q.pctClose ?? 0;
  const pctWrong = q.pctOff ?? 0;
  const hasCommunityStats = pctCorrect > 0 || pctWrong > 0;
  const pctTrue = q.correctAnswer ? pctCorrect : pctWrong;
  const pctFalse = q.correctAnswer ? pctWrong : pctCorrect;

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
      // « » : signal d'assertion plutôt que de question ouverte.
      title={<>« {q.question} »</>}
    >
      {/* Grille de boutons Vrai/Faux. Sur desktop, dt-tf-grid pose 2 colonnes
          carrées géantes ; sur mobile, un flex row simple. */}
      {isDesktop ? (
        <div className="dt-tf-grid">
          {([true, false] as const).map((value) => {
            const isUserPick = effectivePick === value;
            const isAnswer = q.correctAnswer === value;
            const selectedClass =
              effectivePick === value
                ? value
                  ? " selected-true"
                  : " selected-false"
                : "";
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
                key={value ? "t" : "f"}
                className={"dt-tf-btn" + selectedClass + verdictClass}
                onClick={() => !isRevealing && choose(value)}
                disabled={isRevealing}
                aria-pressed={isUserPick}
              >
                {value ? "Vrai" : "Faux"}
                {showVerdict && isUserPick ? (
                  <VerdictIconXL good={userCorrect} size={72} />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "48px 24px 0", display: "flex", gap: 14 }}>
          {([true, false] as const).map((value) => {
            const isUserPick = effectivePick === value;
            const isAnswer = q.correctAnswer === value;
            const selectedClass =
              effectivePick === value
                ? value
                  ? " selected-true"
                  : " selected-false"
                : "";
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
                key={value ? "t" : "f"}
                className={"tf-btn" + selectedClass + verdictClass}
                onClick={() => !isRevealing && choose(value)}
                disabled={isRevealing}
                aria-pressed={isUserPick}
              >
                {value ? "Vrai" : "Faux"}
                {showVerdict && isUserPick ? (
                  <VerdictIconXL good={userCorrect} size={32} />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Toggle communauté — visible en reveal quand il y a des données.
          Sur mobile, le verdict ÉCRIT (« Bien vu » / « Pas cette fois » +
          « C'est faux. » + ligne communauté) est posé juste au-dessus, en
          variante compacte : avant, seule la couleur des boutons disait le
          résultat. Sur desktop, le même bandeau vit plus bas. */}
      {isRevealing ? (
        <div
          style={
            isDesktop ? { marginTop: 16 } : { padding: "16px 24px 0" }
          }
        >
          {!isDesktop && showVerdict ? (
            <div style={{ marginBottom: 10 }}>
              <VerdictRevealBanner
                compact
                visible={showVerdict}
                correct={userCorrect}
                truth={showTruth ? `C'est ${q.correctAnswer ? "vrai" : "faux"}.` : null}
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

      {/* Split-bar vrai/faux. Wording « disent vrai » vs « vrai » diffère
          mobile/desktop pour des raisons d'espace : desktop a la place
          pour la formulation pleine, mobile compresse. */}
      {hasCommunityStats && showStats ? (
        <div
          aria-hidden={!showComparison}
          style={{
            marginTop: isDesktop ? 18 : undefined,
            padding: isDesktop ? undefined : "20px 24px 0",
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
              marginBottom: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span>
              <strong style={{ color: "var(--ink)", fontSize: 13 }}>
                {pctTrue}&nbsp;%
              </strong>{" "}
              {isDesktop ? "disent vrai" : "vrai"}
            </span>
            <span style={{ textAlign: "right" }}>
              {isDesktop ? "disent faux" : "faux"}{" "}
              <strong style={{ color: "var(--ink)", fontSize: 13 }}>
                {pctFalse}&nbsp;%
              </strong>
            </span>
          </div>
          <div
            style={{
              display: "flex",
              height: 10,
              background: "var(--cream-deep)",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: pctTrue + "%",
                background: q.correctAnswer
                  ? "var(--signal-good)"
                  : "var(--ink-mute)",
                transformOrigin: "left",
                transform: `scaleX(${showComparison ? 1 : 0})`,
                transition: "transform 0.6s cubic-bezier(.2,.7,.2,1) 0.1s",
              }}
            />
            <div
              style={{
                width: pctFalse + "%",
                background: !q.correctAnswer
                  ? "var(--signal-good)"
                  : "var(--ink-mute)",
                transformOrigin: "right",
                transform: `scaleX(${showComparison ? 1 : 0})`,
                transition: "transform 0.6s cubic-bezier(.2,.7,.2,1) 0.22s",
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Verdict banner desktop — sous les boutons, avec la phrase « C'est
          vrai/faux. ». Le mobile rend la variante compacte plus haut (dans
          le bloc reveal, au-dessus du toggle communauté). */}
      {isDesktop && isRevealing ? (
        <VerdictRevealBanner
          visible={showVerdict}
          correct={userCorrect}
          truth={showTruth ? `C'est ${q.correctAnswer ? "vrai" : "faux"}.` : null}
          communityLine={
            showComparison && hasCommunityStats
              ? communityContrastLine({
                  userCorrect,
                  // Le % "comme l'utilisateur" : si correct, c'est pctCorrect ;
                  // si faux, c'est pctWrong (les autres qui ont fait la même
                  // erreur que toi).
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
