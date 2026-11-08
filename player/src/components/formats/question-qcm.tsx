"use client";

import { useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { QcmQuestion } from "@/lib/types";
import { phaseAtLeast } from "@/lib/reveal-phase";
import {
  CommunityStatsToggle,
  type FormatProps,
  NBSP,
  ScoreChip,
  VERDICT_BAD_LABEL,
  VERDICT_GOOD_LABEL,
  VerdictIconXL,
} from "./format-shared";
import { QuestionShell } from "../question-shell";

type CommonProps = FormatProps<QcmQuestion, number>;

/// Un seul composant pour mobile + desktop : QuestionShell choisit le
/// layout via useIsDesktop.
export function QcmQuestionScreen({
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
  const [pick, setPick] = useState<number | null>(lockedAnswer ?? draft ?? null);
  function choose(i: number) {
    setPick(i);
    onDraft?.(i);
  }
  /// `showStats` : la répartition par option (% des joueurs + barre) est
  /// cachée par défaut en reveal. Le joueur doit d'abord absorber son
  /// verdict perso ; il déplie ensuite la comparaison communauté via le
  /// CommunityStatsToggle. Cohérent avec tous les autres formats reveal.
  const [showStats, setShowStats] = useState(false);

  const effectivePick = isRevealing ? lockedAnswer : pick;
  const showVerdict = phaseAtLeast(revealPhase, "verdict");
  const showComparison = phaseAtLeast(revealPhase, "comparison");
  const userCorrect = effectivePick === q.correctIndex;

  // Répartition communauté : /api/stats renvoie `distribution` = { "0": pct, ... }
  // pour les formats ab et qcm (même branche). Si la BD n'a pas atteint le
  // seuil, hasRealData est false et on ne montre rien.
  const distribution =
    liveStats && liveStats.hasRealData ? liveStats.distribution : undefined;
  const hasCommunityStats = !!distribution;

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
      <div
        className="q-body-pad"
        style={{
          paddingTop: isDesktop ? 22 : 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {q.choices.map((label, i) => (
          <ChoiceRow
            key={i}
            label={label}
            i={i}
            isPicked={effectivePick === i}
            isCorrect={i === q.correctIndex}
            showVerdict={showVerdict}
            showComparison={showComparison}
            onPick={() => !isRevealing && choose(i)}
            disabled={isRevealing}
            compact={!isDesktop}
            communityPct={distribution?.[String(i)]}
            hasCommunityStats={hasCommunityStats}
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
          <ScoreChip pop kind={userCorrect ? "good" : "bad"}>
            {userCorrect ? VERDICT_GOOD_LABEL : VERDICT_BAD_LABEL}
          </ScoreChip>
          {/* Ligne de contraste communautaire, surfacée par défaut (pas
              cachée derrière le toggle). Si pas assez de data agrégée
              (< 5 réponses pour cette question), on rend null silencieusement. */}
          {showComparison && hasCommunityStats ? (
            <CommunityContrastLineQcm
              userCorrect={userCorrect}
              userPick={effectivePick}
              correctIndex={q.correctIndex}
              distribution={distribution}
            />
          ) : null}
          <CommunityStatsToggle
            open={showStats}
            onToggle={() => setShowStats((v) => !v)}
            hasData={hasCommunityStats}
            marginTop={0}
          />
        </div>
      ) : null}
    </QuestionShell>
  );
}

/// Ligne de contraste communauté pour QCM. Différent des binaires : on a
/// 4+ options, donc on contraste le % du choix utilisateur avec celui de
/// l'option correcte. Si l'utilisateur s'est trompé, on lui dit combien de
/// joueurs ont choisi la BONNE option (ratio piège vs lucidité). S'il a
/// bon, on lui dit combien sont tombés dans le piège le plus populaire.
function CommunityContrastLineQcm({
  userCorrect,
  userPick,
  correctIndex,
  distribution,
}: {
  userCorrect: boolean;
  userPick: number | null;
  correctIndex: number;
  distribution: Record<string, number> | undefined;
}) {
  if (userPick === null || !distribution) return null;
  const correctPct = distribution[String(correctIndex)] ?? 0;
  if (userCorrect) {
    if (correctPct >= 65) {
      return (
        <CommunityLineWrap>
          Comme la majorité : {correctPct}&nbsp;% trouvent la bonne réponse.
        </CommunityLineWrap>
      );
    }
    if (correctPct <= 35) {
      return (
        <CommunityLineWrap>
          Tu vois clair : seuls {correctPct}&nbsp;% choisissent cette option.
        </CommunityLineWrap>
      );
    }
    return (
      <CommunityLineWrap>
        {correctPct}&nbsp;% des joueurs trouvent juste comme toi.
      </CommunityLineWrap>
    );
  }
  // Faux : on indique combien de joueurs sont tombés sur le MÊME piège que
  // toi — lecture collective (« on est nombreux à s'y faire prendre »), pas
  // un score. Très faible (≤ 5 %, jusqu'à 0 % quand on est parmi les
  // premiers) : « Tu n'es pas seul·e : 0 % » sonnerait faux → formulation
  // neutre sans chiffre, qui renvoie au dossier.
  const userPickPct = distribution[String(userPick)] ?? 0;
  const correctTail =
    correctPct > 0 ? ` La bonne réponse est trouvée par ${correctPct}${NBSP}%.` : "";
  if (userPickPct <= 5) {
    return (
      <CommunityLineWrap>
        Choix peu fréquent sur cette question : le dossier explique ce qui
        piège.{correctTail}
      </CommunityLineWrap>
    );
  }
  if (userPickPct <= 25) {
    return (
      <CommunityLineWrap>
        {userPickPct}&nbsp;% ont fait le même choix que toi : le dossier
        explique ce qui piège.{correctTail}
      </CommunityLineWrap>
    );
  }
  return (
    <CommunityLineWrap>
      Tu n&apos;es pas seul·e : {userPickPct}&nbsp;% ont fait le même choix.
      {correctTail}
    </CommunityLineWrap>
  );
}

function CommunityLineWrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--ink-soft)",
        lineHeight: 1.4,
        textWrap: "pretty",
      }}
    >
      {children}
    </div>
  );
}

function ChoiceRow({
  label,
  i,
  isPicked,
  isCorrect,
  showVerdict,
  showComparison,
  onPick,
  disabled,
  compact,
  communityPct,
  hasCommunityStats,
  showStats,
}: {
  label: string;
  i: number;
  isPicked: boolean;
  isCorrect: boolean;
  showVerdict: boolean;
  showComparison: boolean;
  onPick: () => void;
  disabled: boolean;
  compact: boolean;
  communityPct?: number;
  hasCommunityStats: boolean;
  /// Cachée par défaut, dépliée via le toggle global du Body parent.
  showStats: boolean;
}) {
  // États visuels :
  // - ask : default ; selected si pick
  // - verdict : pick correct → verdict-pick-good ; pick faux → verdict-pick-bad ;
  //             non-pick mais correct → verdict-truth (révèle la bonne réponse)
  const verdictPickGood = showVerdict && isPicked && isCorrect;
  const verdictPickBad = showVerdict && isPicked && !isCorrect;
  const verdictTruth = showVerdict && !isPicked && isCorrect;

  const bg = verdictPickGood
    ? "rgba(74,143,92,0.10)"
    : verdictPickBad
      ? "rgba(199,93,93,0.10)"
      : verdictTruth
        ? "rgba(74,143,92,0.06)"
        : isPicked && !showVerdict
          ? "var(--ink)"
          : "var(--cream-warm)";
  const fg = isPicked && !showVerdict ? "var(--yellow)" : "var(--ink)";
  const border = verdictPickGood
    ? "1.5px solid rgba(74,143,92,0.5)"
    : verdictPickBad
      ? "1.5px solid rgba(199,93,93,0.5)"
      : verdictTruth
        ? "1.5px dashed rgba(74,143,92,0.5)"
        : isPicked && !showVerdict
          ? "1.5px solid var(--ink)"
          : "1.5px solid var(--rule-soft)";

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={isPicked}
      style={{
        appearance: "none",
        background: bg,
        color: fg,
        border,
        borderRadius: 14,
        padding: compact ? "12px 14px" : "16px 18px",
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: hasCommunityStats && showVerdict && showStats ? 8 : 0,
        transition: "background 0.4s ease, border-color 0.4s ease, color 0.2s ease",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          className="display"
          style={{
            width: compact ? 30 : 34,
            height: compact ? 30 : 34,
            borderRadius: 8,
            background: isPicked && !showVerdict ? "var(--yellow)" : "var(--cream)",
            color: "var(--ink)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: compact ? 13 : 15,
            flexShrink: 0,
          }}
        >
          {String.fromCharCode(65 + i)}
        </div>
        <div
          style={{
            flex: 1,
            fontWeight: 500,
            fontSize: compact ? 14 : 16,
            lineHeight: 1.3,
            textAlign: "left",
          }}
        >
          {label}
        </div>
        {verdictTruth ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--signal-good-ink)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            bonne réponse
          </span>
        ) : null}
      </div>
      {verdictPickGood || verdictPickBad ? (
        <VerdictIconXL good={verdictPickGood} size={compact ? 44 : 56} />
      ) : null}
      {/* Répartition communauté pour cette option : libellé « X % des
          joueurs » + barre proportionnelle. Vert si bonne réponse, gris
          sinon. Cachée par défaut, révélée par le CommunityStatsToggle du
          parent. */}
      {showVerdict && hasCommunityStats && showStats ? (
        <div>
          <div
            className="mono"
            style={{
              fontSize: compact ? 9 : 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
              marginBottom: 4,
            }}
          >
            <strong
              style={{
                color: "var(--ink)",
                fontWeight: 700,
                fontSize: compact ? 11 : 12,
              }}
            >
              {communityPct ?? 0}&nbsp;%
            </strong>{" "}
            des joueurs
          </div>
          <div
            style={{
              height: compact ? 4 : 5,
              background: "var(--cream-deep)",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: (communityPct ?? 0) + "%",
                background: isCorrect ? "var(--signal-good)" : "var(--ink-mute)",
                transformOrigin: "left",
                transform: `scaleX(${showComparison ? 1 : 0})`,
                transition: `transform 0.6s cubic-bezier(.2,.7,.2,1) ${
                  0.1 + i * 0.08
                }s`,
              }}
            />
          </div>
        </div>
      ) : null}
    </button>
  );
}
