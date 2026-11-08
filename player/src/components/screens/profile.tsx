"use client";

/// Page "Mon profil" — identité civique de l'utilisateur.
///
/// Distinction avec "Mes stats" :
///   - Mon profil = QUI je suis civiquement (Portrait, Radar des biais,
///     score Lucidité, détail des 9 indicateurs). Lecture narrative et
///     identitaire. Centralise aussi les outils d'export/partage.
///   - Mes stats = COMMENT je performe (KPIs, justesse par thème/format,
///     défis, historique). Lecture quantitative.
///
/// Pourquoi tout sur cette page (depuis le refactor 2026-05-22 v2) :
/// avant on avait une page séparée /?s=indicators pour le deep dive. Mais
/// ça forçait l'utilisateur à naviguer pour partager son portrait. On a
/// consolidé : la page Profile contient maintenant le radar avec switch
/// + boutons partage, le portrait narratif, ET les 9 cartes détaillées
/// dans un accordéon dépliable. Une seule page, surface minimale, friction
/// minimale.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/use-client-only";
import { ScreenHeader } from "../screen-header";
import { useDialogFocus } from "../use-dialog-focus";
import { PortraitSection } from "./stats";
import { IndicatorRadar } from "../indicator-radar";
import { useProgress } from "@/lib/use-progress";
import {
  computeAllIndicatorBiases,
  computeHero,
  computeIndicatorContributions,
  computeLucidityScore,
  computePortrait,
  type IndicatorBiasRow,
  type IndicatorContribution,
  type PortraitStats,
} from "@/lib/progress-stats";
import type { Progress } from "@/lib/progress";
import { INDICATORS, type IndicatorId } from "@/lib/indicators";
import { useCommunityIndicators } from "@/lib/use-community-indicators";
import { exportRadarAsPng, downloadBlob } from "@/lib/export-radar";
import { buildPortraitShareUrl } from "@/lib/portrait-url";
import { copyToClipboard } from "@/lib/clipboard";
import { ArrowUpRight, Check, Download, Link2, Share2, X } from "lucide-react";
import { slugForQuestion } from "@/lib/question-slug";
import type { NavTarget, Question, Theme } from "@/lib/types";

type RadarView = "me" | "community" | "both";

export function Profile({
  questions,
  themes,
  onBack,
  onNavigate,
}: {
  questions: Question[];
  themes: Theme[];
  /// Retour vers l'écran d'où l'on vient (récap « Voir mon portrait »,
  /// menu utilisateur…). Le logo + menu utilisateur viennent du HomeHeader
  /// global (cf. SCENES_WITH_HOME_HEADER).
  onBack?: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  const { progress, hydrated } = useProgress();
  const pseudo = hydrated ? progress.identity.pseudo : null;
  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <div style={{ padding: "0 16px 32px" }}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="icon-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              width: "auto",
              height: 36,
              padding: "0 12px 0 8px",
              marginTop: 4,
              borderRadius: 12,
              background: "var(--hover-bg-strong)",
              color: "var(--ink)",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3 5 8l5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Retour
          </button>
        ) : null}
        <ScreenHeader
          eyebrow={pseudo ? `Portrait de ${pseudo}` : "Mon portrait"}
          title={
            <>
              Ta vision{" "}
              <span style={{ color: "var(--coral)" }}>de la France</span>.
            </>
          }
          subtitle="Sur quoi tu vois clair, sur quoi tu te trompes, agrégé sur les questions que tu as jouées."
        />
        <ProfileBody
          questions={questions}
          themes={themes}
          variant="mobile"
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

/// Corps partagé mobile + desktop. Composé de 3 sections :
///   1. RadarBlock (radar + switch user/community/comparer + partage)
///   2. PortraitSection (point fort / angle mort / blindspot)
///   3. IndicatorsDetails (les 9 cartes, repliées par défaut)
export function ProfileBody({
  questions,
  themes,
  variant,
  onNavigate,
}: {
  questions: Question[];
  themes: Theme[];
  variant: "mobile" | "desktop";
  onNavigate?: (target: NavTarget) => void;
}) {
  const { progress, hydrated } = useProgress();
  const hero = useMemo(
    () => computeHero(progress, questions.length),
    [progress, questions.length],
  );
  const portrait = useMemo<PortraitStats>(
    () => computePortrait(progress, questions, themes),
    [progress, questions, themes],
  );
  const indicators = useMemo<IndicatorBiasRow[]>(
    () => computeAllIndicatorBiases(progress, questions),
    [progress, questions],
  );
  if (!hydrated) return null;
  if (hero.answered === 0) {
    return <ProfileEmpty variant={variant} onNavigate={onNavigate} />;
  }
  const hasRadarData = indicators.some((b) => b.count >= 3);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: variant === "desktop" ? 32 : 20,
        marginTop: variant === "desktop" ? 32 : 20,
      }}
    >
      {hasRadarData ? (
        <RadarBlock indicators={indicators} variant={variant} />
      ) : (
        <ProfileRadarTeaser variant={variant} answered={hero.answered} />
      )}
      <PortraitSection
        portrait={portrait}
        variant={variant}
        answeredCount={hero.answered}
        onNavigate={onNavigate}
      />
      {hasRadarData ? (
        <IndicatorsDetails
          indicators={indicators}
          variant={variant}
          progress={progress}
          questions={questions}
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// RadarBlock — radar grand format + score + switch user/community + partage
// ============================================================================

function RadarBlock({
  indicators,
  variant,
}: {
  indicators: IndicatorBiasRow[];
  variant: "mobile" | "desktop";
}) {
  const community = useCommunityIndicators();
  // Convertit la moyenne communauté en IndicatorBiasRow[] dans l'ordre
  // canonique pour la passer au radar (en mode "both" ou "community").
  const communityRows = useMemo<IndicatorBiasRow[] | undefined>(() => {
    if (!community) return undefined;
    return indicators.map((b) => {
      const c = community.find((x) => x.id === b.id);
      return {
        id: b.id,
        label: b.label,
        subjectShort: b.subjectShort,
        signedScore: c?.signedScore ?? 0,
        count: c?.count ?? 0,
        qualitative: "juste" as const,
      };
    });
  }, [community, indicators]);
  const hasCommunity =
    !!communityRows && communityRows.some((c) => c.count > 0);
  const [view, setView] = useState<RadarView>("me");
  const effective: RadarView = hasCommunity ? view : "me";
  const radarWrapperRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  /// État du feedback de copie. On distingue les 2 sources (URL vs Texte)
  /// pour pouvoir afficher un message contextuel propre à chacun, plutôt
  /// qu'un "copié ✓" générique qui laisserait planer le doute sur ce qui
  /// a été mis dans le presse-papier.
  const [copyFeedback, setCopyFeedback] = useState<{
    kind: "url" | "text";
    status: "ok" | "fail";
  } | null>(null);
  const lucidity = useMemo(
    () => computeLucidityScore(indicators),
    [indicators],
  );
  // Top 2 FORCES (axes les plus justes) — pour le texte de partage. On
  // valorise ce que l'user voit clair, pas ses biais (cf. lib decision).
  const topStrengths = useMemo(
    () =>
      indicators
        .filter((b) => b.count >= 3 && Math.abs(b.signedScore) < 0.25)
        .sort((a, b) => Math.abs(a.signedScore) - Math.abs(b.signedScore))
        .slice(0, 2),
    [indicators],
  );

  async function handleDownload() {
    if (!radarWrapperRef.current) return;
    const svg = radarWrapperRef.current.querySelector("svg");
    if (!svg) return;
    setExporting(true);
    try {
      const blob = await exportRadarAsPng(svg, {
        title:
          effective === "community"
            ? "Le portrait moyen · Mon2027"
            : effective === "both"
              ? "Moi vs la moyenne · Mon2027"
              : "Mon portrait · Mon2027",
        lucidity: effective === "me" ? lucidity?.score ?? null : null,
        measuredCount: effective === "me" ? lucidity?.measuredCount : null,
        totalCount: effective === "me" ? lucidity?.totalCount : null,
      });
      downloadBlob(blob, "mon-portrait-mon2027.png");
    } catch (e) {
      console.warn("Export radar a échoué :", e);
    } finally {
      setExporting(false);
    }
  }

  /// Construit l'URL canonique du portrait (avec score Lucidité encodé) —
  /// factorisé entre les 2 boutons de copie.
  function shareUrl(): string {
    const scores = Object.fromEntries(
      indicators.map((b) => [b.id, b.signedScore] as const),
    ) as Parameters<typeof buildPortraitShareUrl>[0]["scores"];
    return buildPortraitShareUrl({
      scores,
      view: effective,
      lucidity: lucidity?.score ?? null,
      measuredCount: lucidity?.measuredCount ?? null,
    });
  }

  /// Copie juste l'URL nue. Pour l'utilisateur qui veut un lien court à
  /// coller seul (story Insta, bio, message direct) — pas besoin de la
  /// prose autour.
  async function handleCopyUrl() {
    const ok = await copyToClipboard(shareUrl());
    setCopyFeedback({ kind: "url", status: ok ? "ok" : "fail" });
    setTimeout(() => setCopyFeedback(null), 3200);
  }

  /// Copie le texte enrichi (score + 1-2 forces) + URL. Pour l'utilisateur
  /// qui veut publier un post complet sans avoir à rédiger d'accroche.
  async function handleCopyText() {
    const url = shareUrl();
    const text = composeShareText(lucidity?.score ?? null, topStrengths, url);
    const ok = await copyToClipboard(text);
    setCopyFeedback({ kind: "text", status: ok ? "ok" : "fail" });
    setTimeout(() => setCopyFeedback(null), 3200);
  }

  const radarBiases =
    effective === "community" && communityRows ? communityRows : indicators;
  const radarCommunity = effective === "both" ? communityRows : undefined;

  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 18,
        padding: variant === "desktop" ? "28px 36px" : "20px 16px 14px",
        display: "flex",
        flexDirection: variant === "desktop" ? "row" : "column",
        alignItems: variant === "desktop" ? "stretch" : "center",
        gap: variant === "desktop" ? 36 : 12,
      }}
    >
      <div
        ref={radarWrapperRef}
        style={{
          flex: variant === "desktop" ? "1 1 0%" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          maxWidth: variant === "desktop" ? 520 : "100%",
          width: "100%",
        }}
      >
        <IndicatorRadar biases={radarBiases} community={radarCommunity} />
      </div>
      <div
        style={{
          flex: variant === "desktop" ? "0 0 280px" : undefined,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          justifyContent: "center",
          alignItems: variant === "desktop" ? "flex-start" : "center",
        }}
      >
        {lucidity != null && effective === "me" ? (
          <LucidityBadge
            score={lucidity.score}
            measuredCount={lucidity.measuredCount}
            totalCount={lucidity.totalCount}
            variant={variant}
          />
        ) : null}
        {hasCommunity ? (
          <RadarViewSwitch value={effective} onChange={setView} />
        ) : null}
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: variant === "desktop" ? 13 : 12,
            color: "var(--ink-mute)",
            textAlign: variant === "desktop" ? "left" : "center",
            textWrap: "pretty",
            maxWidth: variant === "desktop" ? "100%" : 460,
            lineHeight: 1.55,
          }}
        >
          {descriptionFor(effective, hasCommunity)}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignSelf: variant === "desktop" ? "flex-start" : "stretch",
            justifyContent: variant === "desktop" ? "flex-start" : "center",
          }}
        >
          <ShareActionButton
            primary
            disabled={exporting}
            icon={<Download size={15} strokeWidth={2.2} aria-hidden />}
            label={exporting ? "Préparation…" : "Télécharger l'image"}
            onClick={handleDownload}
          />
          <ShareActionButton
            icon={<Link2 size={15} strokeWidth={2.2} aria-hidden />}
            label="Copier l'URL"
            onClick={handleCopyUrl}
          />
          <ShareActionButton
            icon={<Share2 size={15} strokeWidth={2.2} aria-hidden />}
            label="Copier texte + URL"
            onClick={handleCopyText}
          />
        </div>
        {/* Feedback inline sous les boutons — explicite sur CE qui a été
            copié, avec une instruction d'action ("colle-le où tu veux").
            Plus utile qu'un simple ✓ flottant : l'utilisateur sait
            immédiatement quoi faire avec le contenu du presse-papier. */}
        {copyFeedback ? (
          <div
            role="status"
            style={{
              alignSelf: variant === "desktop" ? "flex-start" : "stretch",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              background:
                copyFeedback.status === "ok"
                  ? "rgba(34, 139, 90, 0.12)"
                  : "rgba(204, 70, 60, 0.12)",
              color:
                copyFeedback.status === "ok"
                  ? "var(--signal-good-ink)"
                  : "var(--signal-bad-ink)",
              fontSize: 12.5,
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              textAlign: "left",
              maxWidth: variant === "desktop" ? "100%" : 460,
            }}
          >
            {copyFeedback.status === "ok" ? (
              <Check size={14} strokeWidth={2.4} aria-hidden />
            ) : (
              <X size={14} strokeWidth={2.4} aria-hidden />
            )}
            <span>
              {copyFeedback.status === "fail"
                ? "Copie échouée : réessaie ou copie manuellement."
                : copyFeedback.kind === "url"
                  ? "URL copiée. Colle-la dans une story, un message ou ta bio."
                  : "Texte + URL copiés. Colle-les dans ton post. Joins l'image téléchargée pour l'aperçu."}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/// Bouton d'action partage (3 variants : Download, Copy URL, Copy Text).
/// Factorisé pour éviter 100 lignes de styles dupliqués. `primary` = fond
/// ink plein (CTA principal = Télécharger), sinon contour ink.
function ShareActionButton({
  icon,
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? "var(--ink)" : "transparent",
        color: primary ? "var(--cream-warm)" : "var(--ink)",
        border: "1.5px solid var(--ink)",
        borderRadius: 999,
        padding: "9px 16px",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background var(--t-base), color var(--t-base), opacity 0.2s",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
      }}
      onMouseEnter={(e) => {
        if (disabled || primary) return;
        e.currentTarget.style.background = "var(--ink)";
        e.currentTarget.style.color = "var(--cream-warm)";
      }}
      onMouseLeave={(e) => {
        if (disabled || primary) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--ink)";
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function LucidityBadge({
  score,
  measuredCount,
  totalCount,
  variant,
}: {
  score: number;
  measuredCount: number;
  totalCount: number;
  variant: "mobile" | "desktop";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: variant === "desktop" ? "flex-start" : "center",
        gap: 2,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          fontWeight: 600,
        }}
      >
        Score Lucidité
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          fontFamily: "var(--font-display)",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: variant === "desktop" ? 56 : 48,
            letterSpacing: "-0.04em",
            // Grand texte (seuil 3:1) : coral-deep, le coral plafonne à 2,6:1.
            color: "var(--coral-deep)",
            lineHeight: 1,
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontWeight: 500,
            fontSize: variant === "desktop" ? 20 : 18,
            color: "var(--ink-soft)",
          }}
        >
          / 100
        </span>
      </div>
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.06em",
          color: "var(--ink-mute)",
          marginTop: 2,
        }}
      >
        sur {measuredCount} / {totalCount} dimensions
      </div>
    </div>
  );
}

function RadarViewSwitch({
  value,
  onChange,
}: {
  value: RadarView;
  onChange: (v: RadarView) => void;
}) {
  const options: Array<{ id: RadarView; label: string }> = [
    { id: "me", label: "Moi" },
    { id: "community", label: "Tous" },
    { id: "both", label: "Comparer" },
  ];
  return (
    <div
      role="group"
      aria-label="Vue du radar"
      style={{
        display: "inline-flex",
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            style={{
              padding: "6px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--cream-warm)" : "var(--ink-soft)",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              transition: "background var(--t-base), color var(--t-base)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/// Compose le texte qui sera copié au presse-papier lors du clic
/// "Copier texte + lien". Format pensé pour Twitter/Mastodon/Whatsapp.
/// Met en avant les FORCES (pas les biais) — ce qui se partage.
export function composeShareText(
  lucidity: number | null,
  topStrengths: IndicatorBiasRow[],
  url: string,
): string {
  const parts: string[] = [];
  if (lucidity != null) {
    parts.push(`🎯 Mon portrait civique Mon2027 : ${lucidity}/100 de lucidité.`);
  } else {
    parts.push("🎯 Mon portrait civique Mon2027.");
  }
  if (topStrengths.length > 0) {
    const fragments = topStrengths.map((b) => b.subjectShort);
    const joined =
      fragments.length === 1
        ? fragments[0]
        : `${fragments.slice(0, -1).join(", ")} et ${fragments.at(-1)}`;
    parts.push(`Je vois plutôt juste sur ${joined}.`);
  }
  parts.push(`Et toi ? ${url}`);
  return parts.join("\n");
}

function descriptionFor(
  view: RadarView,
  hasCommunity: boolean,
): React.ReactNode {
  if (view === "me") {
    return (
      <>
        Le cercle médian est la réalité. Chaque sommet de ton polygone sort
        vers l&apos;extérieur si tu surestimes ce sujet, rentre vers le
        centre si tu le sous-estimes.
        {hasCommunity ? (
          <>
            {" "}
            Bascule sur « Tous » ou « Comparer » pour situer ton portrait.
          </>
        ) : null}
      </>
    );
  }
  if (view === "community") {
    return (
      <>
        Voici la moyenne des autres joueurs : où ils tendent à surestimer
        (sommets vers l&apos;extérieur) ou sous-estimer (vers le centre)
        la réalité.
      </>
    );
  }
  return (
    <>
      {/* Clé de couleur portée par une pastille (graphique) et non par la
          couleur du texte : du texte coral en 12 px plafonnerait à 2,6:1. */}
      Ton polygone{" "}
      <span style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 9,
            height: 9,
            borderRadius: 999,
            background: "var(--coral)",
            marginRight: 4,
            verticalAlign: "baseline",
          }}
        />
        en coral
      </span>{" "}
      et la moyenne des joueurs en pointillés. Les écarts entre les deux te
      disent où tu diverges du sens commun.
    </>
  );
}

// ============================================================================
// IndicatorsDetails — accordéon dépliable avec les 9 cartes individuelles
// ============================================================================

const MIN_SAMPLES = 3;

function IndicatorsDetails({
  indicators,
  variant,
  progress,
  questions,
}: {
  indicators: IndicatorBiasRow[];
  variant: "mobile" | "desktop";
  progress: Progress;
  questions: Question[];
}) {
  const [open, setOpen] = useState(false);
  // showCommunity off par défaut : le pastille pointillé "moyenne des
  // autres joueurs" ajoute du bruit visuel sur la lecture personnelle.
  // L'utilisateur peut l'activer via le bouton secondaire ci-dessous.
  const [showCommunity, setShowCommunity] = useState(false);
  const community = useCommunityIndicators();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: open ? 14 : 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: variant === "desktop" ? "flex-start" : "stretch",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            flex: variant === "desktop" ? "0 0 auto" : "1 1 auto",
            background: open ? "var(--ink)" : "transparent",
            color: open ? "var(--cream-warm)" : "var(--ink)",
            border: "1.5px solid var(--ink)",
            borderRadius: 999,
            padding: variant === "desktop" ? "10px 20px" : "12px 18px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 13.5,
            cursor: "pointer",
            transition: "background var(--t-base), color var(--t-base)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {open
            ? "Masquer le détail des 9 dimensions ↑"
            : "Voir le détail des 9 dimensions ↓"}
        </button>
        {open ? (
          <button
            type="button"
            onClick={() => setShowCommunity((s) => !s)}
            aria-pressed={showCommunity}
            style={{
              flex: variant === "desktop" ? "0 0 auto" : "1 1 auto",
              background: showCommunity ? "var(--ink-soft)" : "transparent",
              color: showCommunity ? "var(--cream-warm)" : "var(--ink-soft)",
              border: "1.5px solid var(--ink-soft)",
              borderRadius: 999,
              padding: variant === "desktop" ? "10px 18px" : "12px 16px",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              transition: "background var(--t-base), color var(--t-base)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {showCommunity
              ? "Masquer la moyenne des joueurs"
              : "Comparer à la moyenne des joueurs"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              variant === "desktop"
                ? "repeat(auto-fill, minmax(320px, 1fr))"
                : "1fr",
            gap: variant === "desktop" ? 14 : 10,
            marginTop: 4,
          }}
        >
          {indicators.map((bias, idx) => {
            const communityScore = showCommunity
              ? (community?.find((c) => c.id === bias.id)?.signedScore ?? null)
              : null;
            return (
              <IndicatorCard
                key={bias.id}
                bias={bias}
                index={idx}
                variant={variant}
                communityScore={communityScore}
                progress={progress}
                questions={questions}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function IndicatorCard({
  bias,
  index,
  variant,
  communityScore,
  progress,
  questions,
}: {
  bias: IndicatorBiasRow;
  index: number;
  variant: "mobile" | "desktop";
  communityScore?: number | null;
  progress: Progress;
  questions: Question[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const meta = INDICATORS[bias.id as IndicatorId];
  const enough = bias.count >= MIN_SAMPLES;
  const { verb, color, textColor } = verbAndColorFor(bias.qualitative, enough);
  const markerPct = Math.max(
    0,
    Math.min(100, ((bias.signedScore + 1) / 2) * 100),
  );
  const communityPct =
    communityScore != null
      ? Math.max(0, Math.min(100, ((communityScore + 1) / 2) * 100))
      : null;
  return (
    <>
    <div
      style={{
        // Pas assez d'indices : carte « en attente » signalée par un fond
        // cream et une bordure pointillée, plus par une opacité réduite qui
        // faisait tomber le texte sous 4,5:1.
        background: enough ? "var(--paper)" : "var(--cream-warm)",
        border: enough ? "1px solid var(--rule-soft)" : "1px dashed var(--rule)",
        borderRadius: 16,
        padding: variant === "desktop" ? "18px 20px" : "16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{String(index + 1).padStart(2, "0")} sur 09</span>
        {bias.count > 0 ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              all: "unset",
              cursor: "pointer",
              borderBottom: "1px dashed var(--ink-mute)",
              color: "var(--ink-soft)",
              fontFamily: "inherit",
              fontSize: "inherit",
              letterSpacing: "inherit",
              textTransform: "inherit",
            }}
            aria-label={`Voir les ${bias.count} réponses qui composent ${meta.label}`}
          >
            {bias.count} réponse{bias.count > 1 ? "s" : ""} comptabilisée
            {bias.count > 1 ? "s" : ""} ›
          </button>
        ) : (
          <span>0 réponse comptabilisée</span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: variant === "desktop" ? 22 : 19,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: "var(--ink)",
        }}
      >
        {meta.label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 13,
          color: "var(--ink-soft)",
          lineHeight: 1.45,
          textWrap: "pretty",
        }}
      >
        {meta.definitionPlus1}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 13.5,
          color: "var(--ink)",
          lineHeight: 1.4,
        }}
      >
        <strong style={{ fontWeight: 600, color: textColor }}>{verb}</strong>
        {enough ? <> {bias.subjectShort}.</> : null}
      </div>
      <div
        style={{
          position: "relative",
          height: 8,
          background: "rgba(0,0,0,0.05)",
          borderRadius: 999,
          marginTop: 4,
        }}
        aria-hidden
      >
        {/* Segment coloré entre le centre (0) et le marker : c'est la
            "distance au juste" qui porte l'info, le point est juste le
            terminus. Cf. IndicatorBiasRowView dans stats.tsx pour le
            même traitement. */}
        {enough ? (
          <span
            style={{
              position: "absolute",
              left: `${Math.min(50, markerPct)}%`,
              right: `${100 - Math.max(50, markerPct)}%`,
              top: 0,
              bottom: 0,
              background: color,
              opacity: bias.qualitative === "juste" ? 0.35 : 0.55,
              borderTopLeftRadius: markerPct < 50 ? 999 : 0,
              borderBottomLeftRadius: markerPct < 50 ? 999 : 0,
              borderTopRightRadius: markerPct > 50 ? 999 : 0,
              borderBottomRightRadius: markerPct > 50 ? 999 : 0,
              transition:
                "left 0.4s cubic-bezier(.2,.7,.2,1), right 0.4s cubic-bezier(.2,.7,.2,1)",
            }}
          />
        ) : null}
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: -4,
            bottom: -4,
            width: 2,
            background: "var(--ink-soft)",
            borderRadius: 1,
            transform: "translateX(-50%)",
          }}
        />
        {enough ? (
          <span
            style={{
              position: "absolute",
              left: `${markerPct}%`,
              top: "50%",
              width: 12,
              height: 12,
              borderRadius: 999,
              background: color,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 0 2px var(--paper)",
              transition: "left 0.4s cubic-bezier(.2,.7,.2,1)",
              zIndex: 2,
            }}
          />
        ) : null}
        {communityPct != null ? (
          <span
            aria-label="Moyenne des autres joueurs"
            title="Moyenne des autres joueurs"
            style={{
              position: "absolute",
              left: `${communityPct}%`,
              top: "50%",
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "var(--paper)",
              border: "1.5px dashed var(--ink-mute)",
              transform: "translate(-50%, -50%)",
              zIndex: 1,
            }}
          />
        ) : null}
      </div>
    </div>
    {modalOpen ? (
      <IndicatorDetailModal
        bias={bias}
        progress={progress}
        questions={questions}
        onClose={() => setModalOpen(false)}
      />
    ) : null}
    </>
  );
}

function verbAndColorFor(
  q: IndicatorBiasRow["qualitative"],
  enough: boolean,
): { verb: string; color: string; textColor: string } {
  // `color` : jauge et pastille (teinte claire) ; `textColor` : verbe en
  // 13,5 px, donc teinte foncée (≥ 4,5:1).
  if (!enough)
    return {
      verb: "Pas encore assez d'indices joués.",
      color: "var(--ink-mute)",
      textColor: "var(--ink-mute)",
    };
  switch (q) {
    case "forte_sur":
      return { verb: "Tu surestimes nettement", color: "var(--signal-bad)", textColor: "var(--signal-bad-ink)" };
    case "sur":
      return { verb: "Tu surestimes", color: "var(--signal-bad)", textColor: "var(--signal-bad-ink)" };
    case "juste":
      return { verb: "Tu vois plutôt juste sur", color: "var(--ink-soft)", textColor: "var(--ink-soft)" };
    case "sous":
      return { verb: "Tu sous-estimes", color: "var(--signal-mid)", textColor: "var(--signal-mid-ink)" };
    case "forte_sous":
      return {
        verb: "Tu sous-estimes nettement",
        color: "var(--signal-mid)",
        textColor: "var(--signal-mid-ink)",
      };
  }
}

// ============================================================================
// IndicatorDetailModal — liste détaillée des contributions à un indicateur.
// Rend transparent comment le score se construit : pour chaque réponse
// qui a alimenté l'indicateur, on montre la question, la réponse user,
// la vérité, et la contribution signée (+/-magnitude).
// ============================================================================

function IndicatorDetailModal({
  bias,
  progress,
  questions,
  onClose,
}: {
  bias: IndicatorBiasRow;
  progress: Progress;
  questions: Question[];
  onClose: () => void;
}) {
  const meta = INDICATORS[bias.id as IndicatorId];
  const allContributions = useMemo(
    () => computeIndicatorContributions(progress, questions, bias.id),
    [progress, questions, bias.id],
  );
  // Réponses justes = signedContribution ≈ 0. Par défaut on les masque :
  // elles n'ont rien changé au score, et leur polarité (propriété de la
  // question, pas de la réponse) prête à confusion. L'utilisateur peut
  // les ré-afficher pour vérifier "j'ai bien répondu à celle-là".
  const [showNeutral, setShowNeutral] = useState(false);
  const neutralCount = allContributions.filter(
    (c) => Math.abs(c.signedContribution) < 0.01,
  ).length;
  const contributions = showNeutral
    ? allContributions
    : allContributions.filter((c) => Math.abs(c.signedContribution) >= 0.01);

  // Portal côté client uniquement — gate sur mount pour éviter un mismatch
  // SSR. Le portail vers document.body est essentiel : un ancêtre avec
  // `transform` (app-shell, scènes animées) casse `position: fixed` et la
  // modal déborde sous le viewport. Sortir du sous-arbre garantit que
  // `fixed` se réfère bien au viewport.
  const mounted = useHydrated();
  // Focus : entre dans le dialogue à l'ouverture, piégé sur Tab/Maj+Tab,
  // rendu au bouton d'origine (la ligne d'indicateur) à la fermeture.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, mounted);

  // Esc ferme la modal. Click hors carte ferme aussi (via le wrapper).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Bloque le scroll de la page en arrière-plan tant que la modal est
    // ouverte — sinon on scrolle la liste ET la page en même temps sur
    // mobile, c'est désagréable.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Détail de la dimension ${meta.label}`}
      tabIndex={-1}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "24px 12px",
        // Mêmes keyframes que la Modal générique (globals.css).
        animation: "app-modal-fade-in 0.2s ease-out backwards",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "app-modal-pop-in 0.3s cubic-bezier(.2, .7, .2, 1) backwards",
          background: "var(--paper)",
          borderRadius: 20,
          width: "100%",
          maxWidth: 720,
          // 100dvh quand dispo (mobile : exclut les barres dynamiques) ;
          // fallback 100vh sur les navigateurs sans dvh. -48px = padding
          // vertical (24px haut + 24px bas) du conteneur parent.
          maxHeight: "calc(100dvh - 48px)",
          display: "flex",
          flexDirection: "column",
          // min-height: 0 indispensable pour qu'un enfant flex avec
          // overflow:auto puisse scroller à l'intérieur d'un parent
          // bounded (sinon il déborde de son maxHeight).
          minHeight: 0,
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
        }}
      >
        {/* Header sticky avec close — flexShrink:0 sinon il peut se faire
            écraser quand la liste contient beaucoup d'éléments. */}
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--rule-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Comment c&apos;est construit · {bias.count} indice
              {bias.count > 1 ? "s" : ""}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
                lineHeight: 1.15,
              }}
            >
              {meta.label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 13,
                color: "var(--ink-soft)",
                lineHeight: 1.45,
                marginTop: 6,
                textWrap: "pretty",
              }}
            >
              {meta.definitionPlus1}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              all: "unset",
              cursor: "pointer",
              padding: 8,
              borderRadius: 999,
              color: "var(--ink-soft)",
              flex: "0 0 auto",
            }}
          >
            <X size={20} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
        {/* Barre toggle : afficher / masquer les réponses justes. Affichée
            seulement s'il y a au moins une réponse juste à montrer/cacher,
            sinon ça encombre pour rien. */}
        {neutralCount > 0 ? (
          <div
            style={{
              padding: "10px 22px",
              borderBottom: "1px solid var(--rule-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexShrink: 0,
              background: "var(--cream-warm)",
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--ink-soft)",
                letterSpacing: "0.02em",
              }}
            >
              {neutralCount} réponse{neutralCount > 1 ? "s" : ""} juste
              {neutralCount > 1 ? "s" : ""}{" "}
              {showNeutral ? "affichée" : "masquée"}
              {neutralCount > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => setShowNeutral((s) => !s)}
              aria-pressed={showNeutral}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "5px 12px",
                borderRadius: 999,
                border: "1.5px solid var(--ink)",
                background: showNeutral ? "var(--ink)" : "transparent",
                color: showNeutral ? "var(--cream-warm)" : "var(--ink)",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 12,
                transition: "background var(--t-base), color var(--t-base)",
              }}
            >
              {showNeutral ? "Masquer" : "Afficher"} les réponses justes
            </button>
          </div>
        ) : null}
        {/* Liste scrollable des contributions — flex:1 + minHeight:0 pour
            absorber l'espace restant ET autoriser overflow-y à scroller
            dans les limites du parent borné. */}
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            padding: "10px 14px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {contributions.length === 0 ? (
            <div
              style={{
                padding: "24px 8px",
                textAlign: "center",
                color: "var(--ink-mute)",
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
              }}
            >
              {allContributions.length === 0
                ? "Aucune réponse n'a encore contribué à cette dimension."
                : "Toutes tes réponses sur cette dimension sont justes : bascule le toggle ci-dessus pour les voir."}
            </div>
          ) : (
            contributions.map((c) => (
              <ContributionRow key={c.question.id} c={c} />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ContributionRow({ c }: { c: IndicatorContribution }) {
  const { sign, label, color } = signedLabelFor(c.signedContribution);
  const formatLabel = FORMAT_SHORT[c.question.format] ?? c.question.format;
  // Polarité = propriété de la question (sens de l'erreur). N'a du sens à
  // afficher que si la réponse a effectivement bougé le score — sinon ce
  // badge laisse croire que la réponse a eu un effet "négatif/positif"
  // qu'elle n'a pas eu.
  const neutral = Math.abs(c.signedContribution) < 0.01;
  // Ouvre la question publique dans un nouvel onglet pour préserver le
  // contexte de la modal — l'utilisateur explore et revient sans perdre
  // sa place dans la liste.
  const href = `/q/${slugForQuestion(c.question)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      style={{
        background: neutral ? "transparent" : "var(--cream-warm)",
        border: `1px ${neutral ? "dashed" : "solid"} var(--rule-soft)`,
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        // Réponses justes en sourdine : fond transparent + bordure
        // pointillée pour signaler qu'elles n'ont pas pesé sur le score.
        // (Avant : opacité 0,55, qui rendait le texte illisible.)
        transition: "background var(--t-base), border-color var(--t-base)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--paper)";
        e.currentTarget.style.borderColor = "var(--ink-soft)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = neutral
          ? "transparent"
          : "var(--cream-warm)";
        e.currentTarget.style.borderColor = "var(--rule-soft)";
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span>
          {c.question.theme} · {formatLabel}
        </span>
        {neutral ? null : (
          <span
            title={`Polarité de la question sur cet indicateur : ${c.polarity > 0 ? "+1 (se tromper surestime)" : "−1 (se tromper sous-estime)"}`}
          >
            polarité {c.polarity > 0 ? "+" : "−"}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 14.5,
          fontWeight: 500,
          color: "var(--ink)",
          lineHeight: 1.35,
          textWrap: "pretty",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <span style={{ flex: "1 1 auto" }}>« {c.question.question} »</span>
        <ArrowUpRight
          size={14}
          strokeWidth={2.2}
          aria-hidden
          style={{ flex: "0 0 auto", marginTop: 3, color: "var(--ink-mute)" }}
        />
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-soft)",
          fontFamily: "var(--font-mono)",
          lineHeight: 1.5,
        }}
      >
        {answerDetailFor(c)}
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color,
        }}
      >
        <span>{sign}</span>
        <span>{label}</span>
      </div>
    </a>
  );
}

const FORMAT_SHORT: Partial<Record<Question["format"], string>> = {
  estimation: "estimation",
  ab: "A / B",
  vraifaux: "vrai-faux",
  qcm: "QCM",
  classement: "classement",
  vraifaux_multi: "vrai-faux multi",
  curseur_multi: "curseurs",
  categorisation: "catégorisation",
  pondere: "pondération",
};

/// Compose la ligne "Toi : X · Vérité : Y" en fonction du format.
/// Pour les composites (vraifaux_multi, etc.), on synthétise par un taux
/// d'erreurs ("3/5 affirmations mal jugées") plutôt qu'un dump complet.
function answerDetailFor(c: IndicatorContribution): string {
  const q = c.question;
  const a = c.answer;
  switch (q.format) {
    case "estimation": {
      if (typeof a.value !== "number") return "–";
      return `Toi : ${fmtNum(a.value)} ${q.unitShort ?? q.unit ?? ""} · Réalité : ${fmtNum(q.answer)} ${q.unitShort ?? q.unit ?? ""}`.trim();
    }
    case "ab": {
      const idx = typeof a.value === "number" ? a.value : -1;
      const toi = idx === 0 || idx === 1 ? q.choices[idx].label : "–";
      const verite = q.choices[q.correctIndex].label;
      return `Toi : ${toi} · Vérité : ${verite}${a.correct ? " ✓" : " ✗"}`;
    }
    case "vraifaux": {
      const toi = typeof a.value === "boolean" ? (a.value ? "vrai" : "faux") : "–";
      const verite = q.correctAnswer ? "vrai" : "faux";
      return `Toi : ${toi} · Vérité : ${verite}${a.correct ? " ✓" : " ✗"}`;
    }
    case "qcm": {
      const idx = typeof a.value === "number" ? a.value : -1;
      const toi = idx >= 0 && idx < q.choices.length ? q.choices[idx] : "–";
      const verite = q.choices[q.correctIndex];
      return `Toi : ${toi} · Vérité : ${verite}${a.correct ? " ✓" : " ✗"}`;
    }
    case "vraifaux_multi": {
      const m = a.value as Record<string, boolean> | null;
      if (!m) return "–";
      let errs = 0;
      for (const s of q.statements) if (m[s.id] !== s.correct) errs++;
      return `${errs}/${q.statements.length} affirmation${q.statements.length > 1 ? "s" : ""} mal jugée${errs > 1 ? "s" : ""}`;
    }
    case "classement": {
      const order = Array.isArray(a.value) ? (a.value as string[]) : [];
      let errs = 0;
      for (let i = 0; i < q.correctOrder.length; i++) {
        if (order[i] !== q.correctOrder[i]) errs++;
      }
      return `${errs}/${q.correctOrder.length} item${q.correctOrder.length > 1 ? "s" : ""} mal classé${errs > 1 ? "s" : ""}`;
    }
    case "curseur_multi":
    case "categorisation":
    case "pondere":
      return a.correct ? "Réponse correcte" : "Réponse partiellement fausse";
  }
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) >= 1000) return n.toLocaleString("fr-FR");
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function signedLabelFor(signed: number): {
  sign: string;
  label: string;
  color: string;
} {
  const mag = Math.abs(signed);
  const value = signed === 0 ? "0" : `${signed > 0 ? "+" : "−"}${mag.toFixed(2)}`;
  if (mag < 0.01) {
    return { sign: value, label: "(juste : n'a pas bougé le score)", color: "var(--ink-soft)" };
  }
  if (signed > 0) {
    return { sign: value, label: "pousse vers la surestime", color: "var(--signal-bad-ink)" };
  }
  return { sign: value, label: "pousse vers la sous-estime", color: "var(--signal-mid-ink)" };
}

// ============================================================================
// Empty + teaser states
// ============================================================================

function ProfileRadarTeaser({
  variant,
  answered,
}: {
  variant: "mobile" | "desktop";
  answered: number;
}) {
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 18,
        padding: variant === "desktop" ? "32px 36px" : "20px 16px",
        textAlign: "center",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Portrait en construction
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: variant === "desktop" ? 22 : 18,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          marginBottom: 8,
        }}
      >
        {answered} question{answered > 1 ? "s" : ""} jouée
        {answered > 1 ? "s" : ""}.
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: variant === "desktop" ? 14 : 13,
          color: "var(--ink-mute)",
          lineHeight: 1.5,
          maxWidth: 460,
          margin: "0 auto",
        }}
      >
        Encore quelques réponses sur des sujets variés et ton radar prendra
        forme : il faut au moins 3 indices par dimension pour que le signal
        soit fiable.
      </div>
    </div>
  );
}

function ProfileEmpty({
  variant,
  onNavigate,
}: {
  variant: "mobile" | "desktop";
  onNavigate?: (target: NavTarget) => void;
}) {
  return (
    <div
      style={{
        marginTop: variant === "desktop" ? 32 : 20,
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 18,
        padding: variant === "desktop" ? "40px 36px" : "28px 20px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: variant === "desktop" ? 26 : 22,
          letterSpacing: "-0.02em",
          color: "var(--ink)",
          marginBottom: 10,
        }}
      >
        Ton portrait n&apos;existe pas encore.
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 14,
          color: "var(--ink-soft)",
          lineHeight: 1.55,
          marginBottom: 22,
          maxWidth: 460,
          margin: "0 auto 22px",
        }}
      >
        Joue quelques questions sourcées sur la France et découvre ton
        radar civique : sur quoi tu vois clair, sur quoi tu te trompes.
      </div>
      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate("daily")}
          style={{
            background: "var(--ink)",
            color: "var(--cream-warm)",
            border: "1.5px solid var(--ink)",
            borderRadius: 999,
            padding: "12px 26px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Commencer Mon2027 →
        </button>
      ) : null}
    </div>
  );
}
