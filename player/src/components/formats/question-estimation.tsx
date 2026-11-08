"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import {
  CommunityReadLine,
  CommunityStatsToggle,
  type FormatProps,
  NBSP,
} from "./format-shared";
import { QuestionShell } from "../question-shell";
import {
  fmtComparative,
  fmtEstimationValue,
  isComparativeEstimation,
} from "@/lib/fmt";
import { answerLevel, isCorrect, LEVEL_LABEL, type AnswerLevel } from "@/lib/correctness";
import { estimationCommunityLine } from "@/lib/community-lines";
import { phaseAtLeast } from "@/lib/reveal-phase";
import type { EstimationQuestion } from "@/lib/types";

/// Estimation chiffrée — gros chiffre + slider draggable. Le rendu mobile
/// utilise des styles inline (.display tnum) ; le desktop utilise les
/// classes .dt-estimate-display / .dt-slider du globals.css. La phase
/// reveal (BigNumber + verdict pill + axe à marqueurs) est partagée
/// strictement entre les deux viewports.
export function EstimationQuestionScreen({
  q,
  index,
  total,
  accent,
  onSubmit,
  onAbort,
  revealPhase = "ask",
  lockedAnswer = null,
  liveStats,
  onNext,
  isLast = false,
  onTerminate,
  hasAnyAnswer,
  draft,
  onDraft,
}: FormatProps<EstimationQuestion, number>) {
  const isDesktop = useIsDesktop();
  /// Si un brouillon existe (rescue après remount), on l'utilise comme val
  /// initial ET on marque touched=true pour conserver l'état « canSubmit ».
  /// Sinon, valeur centrée par défaut, touched=false.
  const [val, setVal] = useState(
    draft != null ? draft : (q.range[0] + q.range[1]) / 2
  );
  const [touched, setTouched] = useState(draft != null);
  const isRevealing = revealPhase !== "ask";
  const displayVal = isRevealing && lockedAnswer !== null ? lockedAnswer : val;
  const userCorrect = lockedAnswer !== null && isCorrect(q, lockedAnswer);

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
      canSubmit={touched}
      onSubmit={() => onSubmit(val)}
      onAbort={onAbort}
      onTerminate={onTerminate}
      onNext={onNext}
      hasAnyAnswer={hasAnyAnswer}
    >
      {isRevealing ? (
        <EstimationRevealBody
          q={q}
          userAnswer={lockedAnswer}
          userCorrect={userCorrect}
          communityLine={
            phaseAtLeast(revealPhase, "comparison")
              ? estimationCommunityLine(q, liveStats)
              : null
          }
        />
      ) : (
        <AskBody
          q={q}
          displayVal={displayVal}
          touched={touched}
          isDesktop={isDesktop}
          onChange={(v) => {
            setVal(v);
            setTouched(true);
            onDraft?.(v);
          }}
        />
      )}
    </QuestionShell>
  );
}

// ============================================================================
// ASK — gros chiffre interactif + slider draggable. Le rendu diffère entre
// mobile (inline styles `.display tnum`, slider .estimate-slider) et desktop
// (classes CSS `.dt-estimate-display` + `.dt-slider`). Logique d'affichage
// (cmp / format chiffré) partagée.
// ============================================================================

function AskBody({
  q,
  displayVal,
  touched,
  isDesktop,
  onChange,
}: {
  q: EstimationQuestion;
  displayVal: number;
  touched: boolean;
  isDesktop: boolean;
  onChange: (v: number) => void;
}) {
  const comparative = isComparativeEstimation(q.range);
  const cmp = comparative ? fmtComparative(displayVal, q.step) : null;
  const unitText = q.unitShort || q.unit;
  const numberText = cmp
    ? cmp.main
    : q.step >= 1
      ? Math.round(displayVal).toLocaleString("fr-FR").replace(/ /g, " ")
      : displayVal.toFixed(1).replace(".", ",");
  const suffixText = cmp ? cmp.suffix : unitText;
  /// Texte lu par le lecteur d'écran pour le curseur : la valeur affichée
  /// en gros + son unité (« 75 000 annonces »), pas la valeur brute.
  const valueText = `${numberText}${suffixText ? " " + suffixText : ""}`;

  return (
    <>
      {/* Display du gros chiffre : sur desktop la mise en page (taille,
          flex direction) est portée par `.dt-estimate-display` / `.big` /
          `.unit` (globals.css). Sur mobile on inline les styles pour
          contrôler précisément la taille 96px et l'animation de couleur
          touched. */}
      {isDesktop ? (
        <div className="dt-estimate-display">
          <span
            className="big"
            style={{
              fontFamily: "var(--font-display)",
              color: touched ? "var(--ink)" : "var(--ink-mute)",
              transition: "color 0.3s",
            }}
          >
            {numberText}
          </span>
          <span
            className="unit"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {suffixText}
          </span>
          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "var(--ink-mute)",
            }}
          >
            {touched ? "Ton estimation" : "Glisse le curseur pour répondre"}
          </div>
        </div>
      ) : (
        <div style={{ padding: "44px 24px 8px", textAlign: "center" }}>
          {/* Taille adaptée à la longueur du nombre et unité qui passe à la
              ligne : à 96px fixes, « 75 000 annonces » sortait de l'écran à
              390 px (« 75 000 anno… »). */}
          <div
            className="display tnum"
            aria-hidden
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "center",
              columnGap: "0.25em",
              rowGap: 6,
              fontSize: fitFontSize(numberText, 96),
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.05em",
              color: touched ? "var(--ink)" : "var(--ink-mute)",
              transition: "color 0.3s",
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>{numberText}</span>
            {suffixText ? (
              <span
                style={{
                  fontSize: 38,
                  fontWeight: 600,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  color: "var(--ink-soft)",
                  maxWidth: "100%",
                  overflowWrap: "anywhere",
                }}
              >
                {suffixText}
              </span>
            ) : null}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--ink-mute)" }}>
            {touched ? "Ton estimation" : "Glisse le curseur"}
          </div>
        </div>
      )}

      {/* Slider + bornes chiffrées. Les deux variantes (mobile/desktop)
          n'ont pas la même chrome de slider (track style différent dans
          globals.css) ; on switche juste la className et le wrapper. */}
      <div
        className={isDesktop ? "dt-slider-wrap" : undefined}
        style={
          isDesktop
            ? { position: "relative" }
            : { padding: "26px 28px 0", position: "relative" }
        }
      >
        <input
          className={isDesktop ? "dt-slider" : "estimate-slider"}
          type="range"
          min={q.range[0]}
          max={q.range[1]}
          step={q.step}
          value={displayVal}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label="Ton estimation"
          aria-valuetext={valueText}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: isDesktop ? 4 : 6,
            fontFamily: isDesktop ? "var(--font-mono)" : undefined,
            color: "var(--ink-mute)",
            fontSize: 12,
          }}
        >
          <span className={isDesktop ? undefined : "mono"}>
            {fmtEstimationValue(q.range[0], q.range, unitText, q.step)}
          </span>
          <span className={isDesktop ? undefined : "mono"}>
            {fmtEstimationValue(q.range[1], q.range, unitText, q.step)}
          </span>
        </div>
      </div>

    </>
  );
}

// ============================================================================
// REVEAL — partagé mobile / desktop. Headline « Réalité » + verdict pill +
// axe à 3 marqueurs (Toi, Réalité, optionnellement Joueurs).
// ============================================================================

export function EstimationRevealBody({
  q,
  userAnswer,
  userCorrect,
  communityLine = null,
}: {
  q: EstimationQuestion;
  userAnswer: number | null;
  /** Kept for API stability — couleurs et label dérivent désormais du
   *  niveau 3-états calculé en interne via `answerLevel`. */
  userCorrect: boolean;
  /** Lecture collective par défaut (« En moyenne, les joueurs disent… »),
   *  null sous le seuil de réponses ou avant la phase comparaison. */
  communityLine?: string | null;
}) {
  const unit = q.unitShort || q.unit;
  const hasCommunityAvg = q.avgUser > 0;
  /** La comparaison à la moyenne joueurs est masquée par défaut : le joueur
   *  doit d'abord absorber son verdict perso (toi vs réalité). Il l'ajoute via
   *  le bouton « Comparer aux autres » si la donnée existe. */
  const [showCommunity, setShowCommunity] = useState(false);
  // 4 niveaux d'affichage : exact (gap < step/2), good (tol. verte), mid
  // (tol. orange), bad. « exact » est un sous-cas de good : on le détecte
  // après coup pour mettre en avant la réponse pile-poil, sans changer la
  // logique de scoring (qui reste good/mid/bad pour les stats).
  const baseLevel: "good" | "mid" | "bad" =
    userAnswer === null ? "bad" : answerLevel(q, userAnswer);
  const gapForExact =
    userAnswer !== null ? Math.abs(q.answer - userAnswer) : Infinity;
  // "Exact" est déclenché si le gap est soit sous la granularité du slider
  // (step/2 — le joueur a fait le geste le plus fin possible), soit sous 1%
  // de la plage totale (visuellement, TOI et RÉALITÉ se superposent sur le
  // slider — l'utilisateur ne distingue plus les deux à l'œil). On prend le
  // max des deux : pour les questions à step large, c'est step/2 qui domine
  // (granularité d'auteur), pour les ranges larges c'est le 1% qui domine
  // (perception visuelle).
  const rangeSpan = q.range[1] - q.range[0];
  const exactThreshold = Math.max(q.step / 2, rangeSpan * 0.01);
  const isExact = baseLevel === "good" && gapForExact <= exactThreshold;
  const level: "exact" | "good" | "mid" | "bad" = isExact ? "exact" : baseLevel;
  // Suppress unused warning while preserving signature.
  void userCorrect;

  // Vocabulaire unique des niveaux (LEVEL_LABEL : Bien vu / Pas loin / Pas
  // cette fois), le même que les autres formats et le récap ; l'écart chiffré
  // (« 20 % au-dessus ») suit dans la pastille. « Pile ! » reste le cas
  // particulier du niveau bon. Texte en teintes foncées *-ink (≥ 4,5:1 sur
  // ces fonds teintés, cf. globals.css).
  const verdict = {
    exact: { label: "Pile !", bg: "rgba(74,143,92,0.18)", fg: "var(--signal-good-ink)", numberColor: "var(--signal-good-ink)" },
    good:  { label: LEVEL_LABEL.good, bg: "rgba(74,143,92,0.12)", fg: "var(--signal-good-ink)", numberColor: "var(--signal-good-ink)" },
    mid:   { label: LEVEL_LABEL.mid, bg: "rgba(216,154,62,0.14)", fg: "var(--signal-mid-ink)",  numberColor: "var(--signal-mid-ink)" },
    bad:   { label: LEVEL_LABEL.bad, bg: "rgba(199,93,93,0.12)",  fg: "var(--signal-bad-ink)",  numberColor: "var(--signal-bad-ink)" },
  }[level];

  // Wrap detection pour le séparateur « · » dans le pill verdict : on ne
  // l'affiche que si label et écart restent sur la même ligne (sinon le
  // bullet orphelin en début de row 2 fait du bruit visuel). On utilise
  // visibility:hidden plutôt que display:none pour conserver l'espace
  // réservé du bullet et éviter une boucle de feedback. L'écart de ~7px
  // réservé sur row 2 est imperceptible visuellement.
  const gap = userAnswer !== null ? Math.abs(q.answer - userAnswer) : null;

  const labelRef = useRef<HTMLSpanElement>(null);
  const ecartRef = useRef<HTMLSpanElement>(null);
  const [verdictSameLine, setVerdictSameLine] = useState(true);
  useLayoutEffect(() => {
    const label = labelRef.current;
    const ecart = ecartRef.current;
    if (!label || !ecart) return;
    const measure = () =>
      setVerdictSameLine(label.offsetTop === ecart.offsetTop);
    measure();
    const pill = label.parentElement;
    if (!pill) return;
    const ro = new ResizeObserver(measure);
    ro.observe(pill);
    return () => ro.disconnect();
  }, [gap, level]);

  // En mode comparatif, l'écart en « unités du slider » n'est pas parlant
  // (« écart 14 × » ne veut rien dire) : on laisse les deux BigNumber raconter
  // l'histoire et on omet la ligne d'écart. Sinon, écart RELATIF en clair
  // (« 1,6 fois trop haut », « 20 % au-dessus ») : « écart 310 000
  // personnes » ne disait pas si c'était beaucoup. Rien pour « Pile ! ».
  const gapText =
    userAnswer !== null && level !== "exact" && !isComparativeEstimation(q.range)
      ? readableGap(q.answer, userAnswer, unit)
      : null;

  return (
    <>
      {/* Headline : la RÉALITÉ en gros + l'estimation utilisateur en plus petit
          à côté. Renverse la hiérarchie visuelle du mode ask. */}
      <div
        style={{
          padding: "32px 24px 4px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <BigNumber
          label="Réalité"
          value={q.answer}
          unit={unit}
          step={q.step}
          accent="var(--ink)"
          big
          comparative={isComparativeEstimation(q.range)}
        />
        {userAnswer !== null ? (
          <BigNumber
            label="Ton estimation"
            value={userAnswer}
            unit={unit}
            step={q.step}
            accent={verdict.numberColor}
            comparative={isComparativeEstimation(q.range)}
          />
        ) : null}
      </div>

      {/* Verdict ligne — court et coloré (3 niveaux + exact). Le pill pop-in
          en spring + porte l'écart chiffré juste à côté. flexWrap pour les
          mobiles étroits. */}
      <div style={{ padding: "8px 24px 0", textAlign: "center" }}>
        <span
          className="mono verdict-banner-pop"
          // Cible du défilement « verdict visible » (cf. lib/scroll-verdict).
          data-verdict=""
          style={{
            display: "inline-flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            columnGap: 8,
            rowGap: 4,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "8px 14px",
            borderRadius: 99,
            background: verdict.bg,
            color: verdict.fg,
            transformOrigin: "center center",
          }}
        >
          <span
            ref={labelRef}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: "currentColor",
              }}
            />
            {verdict.label}
          </span>
          {gapText ? (
            <span
              ref={ecartRef}
              style={{
                opacity: 0.65,
                fontWeight: 500,
                textTransform: "none",
                letterSpacing: "0.01em",
              }}
            >
              <span
                aria-hidden
                style={{
                  visibility: verdictSameLine ? "visible" : "hidden",
                }}
              >
                ·{" "}
              </span>
              {gapText}
            </span>
          ) : null}
        </span>
      </div>

      {/* Lecture collective par défaut, sous le verdict (rien sous le seuil
          de réponses). La comparaison détaillée sur l'axe reste derrière le
          bouton « réponses des autres ». */}
      {communityLine ? (
        <div style={{ padding: "10px 24px 0", textAlign: "center" }}>
          <CommunityReadLine text={communityLine} />
        </div>
      ) : null}

      {/* Axe purement spatial : positions de toi/réalité sur la plage. La
          moyenne joueurs est conditionnée à un toggle pour ne pas surcharger
          le premier coup d'œil. */}
      <RevealAxis
        q={q}
        userAnswer={userAnswer}
        level={baseLevel}
        showCommunity={showCommunity && hasCommunityAvg}
      />

      {/* Sans moyenne communauté (question récente, seuil de réponses pas
          atteint), CommunityStatsToggle ne rend rien. */}
      <div style={{ textAlign: "center", padding: "10px 24px 4px" }}>
        <CommunityStatsToggle
          open={showCommunity}
          onToggle={() => setShowCommunity((v) => !v)}
          hasData={hasCommunityAvg}
          marginTop={0}
          emptyMessage="Personne n'a encore tenté cette estimation. Reviens dans quelques jours."
        />
      </div>
    </>
  );
}

/** Écart joueur/réalité en langage courant :
 *   - unité « % » : en points (« 8 pts au-dessus ») — un écart entre deux
 *     pourcentages exprimé en % relatif prêterait à confusion ;
 *   - rapport ≥ 1,5 : « 1,6 fois trop haut » / « 2,3 fois trop bas » ;
 *   - sinon : « 20 % au-dessus » / « 15 % en dessous ».
 *  Null quand le rapport n'a pas de sens (réalité ou estimation ≤ 0). */
function readableGap(answer: number, user: number, unit: string): string | null {
  if (user === answer) return null;
  const dirWord = user > answer ? "au-dessus" : "en dessous";
  if (unit.trim() === "%") {
    const pts = Math.abs(user - answer);
    const v = pts >= 10 ? Math.round(pts) : Math.round(pts * 10) / 10;
    if (v === 0) return "moins d'un point d'écart";
    return `${v.toLocaleString("fr-FR")}${NBSP}pt${v >= 2 ? "s" : ""} ${dirWord}`;
  }
  if (answer <= 0 || user <= 0) return null;
  const ratio = user / answer;
  const fmtRatio = (r: number) =>
    r.toLocaleString("fr-FR", { maximumFractionDigits: r < 10 ? 1 : 0 });
  if (ratio >= 1.5) return `${fmtRatio(ratio)} fois trop haut`;
  if (ratio <= 1 / 1.5) return `${fmtRatio(1 / ratio)} fois trop bas`;
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  if (pct === 0) return `moins de 1${NBSP}% d'écart`;
  return `${pct}${NBSP}% ${dirWord}`;
}

/** Taille de police qui fait tenir `text` sur une ligne de téléphone
 *  (viewport − 48px de marges), plafonnée à `max` px. ~0,62 em par chiffre
 *  en display gras : estimation prudente (les espaces fines sont plus
 *  étroites). Plancher à 40 % de `max` pour rester un « gros chiffre ». */
function fitFontSize(text: string, max: number): string {
  const em = Math.max(1, text.length) * 0.62;
  return `clamp(${Math.round(max * 0.4)}px, calc((100vw - 48px) / ${em.toFixed(2)}), ${max}px)`;
}

function BigNumber({
  label,
  value,
  unit,
  step,
  accent,
  big,
  comparative,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  accent: string;
  big?: boolean;
  /** Si true, formate la valeur en « N× moins / autant / N× plus » au lieu
   *  de la magnitude absolue. */
  comparative?: boolean;
}) {
  const cmp = comparative ? fmtComparative(value, step) : null;
  const mainText = cmp
    ? cmp.main
    : step >= 1
      ? Math.round(value).toLocaleString("fr-FR")
      : value.toFixed(1).replace(".", ",");
  return (
    <div style={{ textAlign: "center", maxWidth: "100%" }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {/* Flex-wrap au lieu d'inline simple : sur mobile étroit, "1,2" et le
          suffixe "pour 100 000 hab." passent sur deux lignes — sans flex,
          line-height: 1 × 64px appliquait 64px de leading à la ligne du
          suffixe wrapped, créant un trou énorme. Ici la rowGap contrôle
          l'écart et le suffixe garde sa propre line-height resserrée. */}
      <div
        className="display tnum"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "center",
          columnGap: 6,
          rowGap: 4,
          fontSize: fitFontSize(mainText, big ? 64 : 38),
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: accent,
        }}
      >
        <span style={{ whiteSpace: "nowrap" }}>{mainText}</span>
        <span
          style={{
            fontSize: big ? 26 : 18,
            fontWeight: 600,
            lineHeight: 1.15,
            color: "var(--ink-soft)",
            maxWidth: "100%",
            overflowWrap: "anywhere",
          }}
        >
          {cmp ? cmp.suffix : unit}
        </span>
      </div>
    </div>
  );
}

/// Couleur du marqueur « Toi » : celle du niveau (orange en « Pas loin »,
/// plus de vert trompeur pour une réponse moyenne).
const LEVEL_INK: Record<AnswerLevel, string> = {
  good: "var(--signal-good-ink)",
  mid: "var(--signal-mid-ink)",
  bad: "var(--signal-bad-ink)",
};

function RevealAxis({
  q,
  userAnswer,
  level,
  showCommunity,
}: {
  q: EstimationQuestion;
  userAnswer: number | null;
  level: AnswerLevel;
  /** Si true, ajoute le marqueur « Joueurs » (moyenne communauté). */
  showCommunity: boolean;
}) {
  const [lo, hi] = q.range;
  const pctOf = (v: number) =>
    Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100));

  type Marker = {
    key: "toi" | "joueurs" | "reel";
    label: string;
    pct: number;
    color: string;
    side: "top" | "bottom";
    emphasis?: boolean;
  };

  const markers: Marker[] = [];
  markers.push({
    key: "reel",
    label: "Réalité",
    pct: pctOf(q.answer),
    color: "var(--ink)",
    side: "bottom",
    emphasis: true,
  });
  if (showCommunity) {
    markers.push({
      key: "joueurs",
      label: "Joueurs",
      pct: pctOf(q.avgUser),
      color: "var(--ink-mute)",
      side: "top",
    });
  }
  if (userAnswer !== null) {
    markers.push({
      key: "toi",
      label: "Toi",
      pct: pctOf(userAnswer),
      color: LEVEL_INK[level],
      side: "top",
    });
  }

  // Anti-collision simple : si deux marqueurs côté top se croisent, on bascule
  // « toi » en bottom (à côté de réalité). On garde « réalité » toujours en
  // bottom comme ancrage visuel.
  const COLLISION = 14;
  const top = markers.filter((m) => m.side === "top");
  if (top.length === 2 && Math.abs(top[0].pct - top[1].pct) < COLLISION) {
    const toi = markers.find((m) => m.key === "toi");
    if (toi) toi.side = "bottom";
  }
  const reel = markers.find((m) => m.key === "reel");
  const toi = markers.find((m) => m.key === "toi");
  if (reel && toi && toi.side === "bottom" && Math.abs(toi.pct - reel.pct) < COLLISION) {
    toi.side = "top";
  }

  const topRow = markers.filter((m) => m.side === "top");
  const bottomRow = markers.filter((m) => m.side === "bottom");
  const unit = q.unitShort || q.unit;

  return (
    <div style={{ padding: "28px 28px 8px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "minmax(22px, auto) 14px minmax(22px, auto)",
          rowGap: 4,
          position: "relative",
        }}
      >
        <div style={{ position: "relative", minHeight: 22 }}>
          {topRow.map((m) => (
            <AxisLabel key={m.key} marker={m} side="top" />
          ))}
        </div>

        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: 1.5,
              background: "var(--ink)",
              transform: "translateY(-50%)",
            }}
          />
          {[0, 25, 50, 75, 100].map((pct) => (
            <div
              key={pct}
              style={{
                position: "absolute",
                top: "50%",
                left: `${pct}%`,
                transform: "translate(-50%, -50%)",
                width: 1,
                height: 8,
                background: "var(--rule)",
              }}
            />
          ))}
          {markers.map((m) => (
            <div
              key={`d-${m.key}`}
              style={{
                position: "absolute",
                top: "50%",
                left: `${m.pct}%`,
                transform: "translate(-50%, -50%)",
                width: m.emphasis ? 14 : 11,
                height: m.emphasis ? 14 : 11,
                borderRadius: 99,
                background: m.color,
                border: "2px solid var(--cream)",
                boxShadow: m.emphasis ? `0 0 0 1.5px ${m.color}` : "none",
              }}
              aria-label={m.label}
            />
          ))}
        </div>

        <div style={{ position: "relative", minHeight: 22 }}>
          {bottomRow.map((m) => (
            <AxisLabel key={m.key} marker={m} side="bottom" />
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          color: "var(--ink-mute)",
          fontSize: 11,
        }}
      >
        <span className="mono">
          {fmtEstimationValue(q.range[0], q.range, unit, q.step)}
        </span>
        <span className="mono">
          {fmtEstimationValue(q.range[1], q.range, unit, q.step)}
        </span>
      </div>
    </div>
  );
}

function AxisLabel({
  marker,
  side,
}: {
  marker: { label: string; pct: number; color: string; emphasis?: boolean };
  side: "top" | "bottom";
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${marker.pct}%`,
        transform: "translateX(-50%)",
        textAlign: "center",
        whiteSpace: "nowrap",
        [side === "top" ? "bottom" : "top"]: 0,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: marker.color,
        }}
      >
        {marker.label}
      </div>
    </div>
  );
}
