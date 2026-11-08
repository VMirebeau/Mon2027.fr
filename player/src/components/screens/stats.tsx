"use client";

/// Page "Mes stats" (mobile). Affiche la progression locale : nombre de
/// réponses, justesse globale, série de jours, agrégations par thème et par
/// format, défis envoyés/reçus, favoris.
///
/// Quand l'utilisateur n'a encore rien joué, on rend un EmptyState avec un
/// CTA "Commencer". Tout le reste vit dans StatsBody pour partage avec la
/// version desktop (stats-dt.tsx).

import { useMemo, useState } from "react";
import { BadgeIcon } from "../badge-icon";
import { ScreenHeader } from "../screen-header";
import { useProgress } from "@/lib/use-progress";
import { useMyDefis } from "@/lib/use-my-defis";
import { useUnseenDefis } from "@/lib/use-unseen-defis";
import {
  computeByFormat,
  computeByTheme,
  computeChallenges,
  computeHero,
  computePortrait,
  formatDayKey,
  type FormatStatRow,
  type HeroStats,
  type IndicatorBiasRow,
  type PortraitStats,
  type ThemeStatRow,
  type ChallengeSummary,
} from "@/lib/progress-stats";
import {
  BADGE_BY_ID,
  computeLevel,
  computeXp,
  countBadges,
  listAllBadges,
  type LevelInfo,
} from "@/lib/gamification";
import type { NavTarget, Question, Theme } from "@/lib/types";

export function Stats({
  questions,
  themes,
  onHome,
  onNavigate,
}: {
  questions: Question[];
  themes: Theme[];
  /// Conservé pour rester compat avec AppShell. Cf. Account pour la rationale :
  /// HomeHeader + BottomTabBar suffisent à naviguer, plus de back arrow.
  onHome?: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  void onHome;
  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <div style={{ padding: "0 16px 32px" }}>
        <ScreenHeader
          eyebrow="Mes stats"
          title={
            <>
              Ton parcours{" "}
              <span style={{ color: "var(--coral)" }}>en chiffres</span>.
            </>
          }
          subtitle="Ce que tu maîtrises par thème et par format, tes défis et ton historique."
        />
        <StatsBody
          questions={questions}
          themes={themes}
          onNavigate={onNavigate}
          variant="mobile"
        />
      </div>
    </div>
  );
}

/// Corps réutilisé par mobile et desktop. La seule différence de rendu vit
/// dans `variant` qui ajuste tailles de police et marges. Toute l'agrégation
/// (hero, par thème, par format, défis) est partagée.
///
/// `skipHero` : la version desktop sort le HeroBlock du flux normal pour
/// l'inscrire dans la grille hero/aside du haut de page (cf. stats-dt.tsx) —
/// on lui dit ici de ne pas le re-rendre une deuxième fois plus bas.
export function StatsBody({
  questions,
  themes,
  onNavigate,
  variant,
  skipHero = false,
}: {
  questions: Question[];
  themes: Theme[];
  onNavigate?: (target: NavTarget) => void;
  variant: "mobile" | "desktop";
  skipHero?: boolean;
}) {
  const { progress, hydrated } = useProgress();

  // Tant que le snapshot localStorage n'est pas lu, on rend "comme SSR" :
  // tout à zéro. Évite un mismatch d'hydratation et un flash de "0 répondu"
  // au mount client juste avant que les vraies valeurs arrivent.
  const hero = useMemo<HeroStats>(
    () => computeHero(progress, questions.length),
    [progress, questions.length],
  );
  const byTheme = useMemo<ThemeStatRow[]>(
    () => computeByTheme(progress, questions, themes),
    [progress, questions, themes],
  );
  const byFormat = useMemo<FormatStatRow[]>(
    () => computeByFormat(progress, questions),
    [progress, questions],
  );
  // Défis envoyés : source serveur (cf. useMyDefis) — le local n'en garde
  // plus trace. Tant que la requête n'a pas répondu, on ne conclut rien.
  const myDefis = useMyDefis();
  const sentDefis = myDefis.status === "ok" ? myDefis.defis : null;
  const challenges = useMemo<ChallengeSummary>(
    () => computeChallenges(progress, sentDefis),
    [progress, sentDefis],
  );
  const { total: unseenResponses } = useUnseenDefis();
  // Portrait civique : agrégations narratives (point fort / angle mort /
  // biais d'estimation par thème). Calculé même quand pas encore assez de
  // données — la section décide elle-même de se cacher si tout est null.
  const portrait = useMemo<PortraitStats>(
    () => computePortrait(progress, questions, themes),
    [progress, questions, themes],
  );
  // Récompenses dérivées : niveau courant + barre vers le suivant, plus
  // un panel "badges récents". On les calcule ici pour les exposer dans la
  // section dédiée sans monter de hook gamification supplémentaire.
  const xp = useMemo(() => computeXp(progress), [progress]);
  const level = useMemo(() => computeLevel(xp), [xp]);
  const badgeCounts = useMemo(() => countBadges(progress), [progress]);
  const recentBadges = useMemo(() => {
    return listAllBadges(progress)
      .filter((v) => v.unlocked)
      .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
      .slice(0, 4);
  }, [progress]);

  // Pré-hydratation : pas de stats locales disponibles. On affiche un skeleton
  // léger (juste le hero "0 sur X") plutôt que rien — l'utilisateur voit
  // immédiatement la structure de la page.
  if (!hydrated) {
    return <HeroBlock hero={{ ...hero, answered: 0, correct: 0, accuracyPct: null }} variant={variant} />;
  }

  if (hero.answered === 0) {
    return <EmptyState onNavigate={onNavigate} variant={variant} />;
  }

  // PortraitSection a migré vers "Mon profil" (cf. screens/profile.tsx)
  // pour que Stats reste focalisé sur la performance pure (chiffres,
  // justesse, défis). Les utilisateurs accèdent à leur Portrait via le
  // menu user "Mon profil".
  void portrait;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: variant === "desktop" ? 40 : 24 }}>
      {!skipHero ? <HeroBlock hero={hero} variant={variant} /> : null}
      <RewardsTeaser
        level={level}
        badgeCounts={badgeCounts}
        recentBadges={recentBadges}
        variant={variant}
        onNavigate={onNavigate}
      />
      <ByThemeSection rows={byTheme} variant={variant} />
      <ByFormatSection rows={byFormat} variant={variant} />
      <ChallengesSection
        summary={challenges}
        sentStatus={myDefis.status}
        unseenResponses={unseenResponses}
        variant={variant}
        onNavigate={onNavigate}
      />
      <FavoritesSection
        count={hero.favorites}
        variant={variant}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ============================================================================
// PortraitSection — "cartographie de ce que tu pensais", au-delà des KPI flat.
//
// Trois cartes max, chacune avec un narratif court et actionnable :
//   1. Point fort (thème le plus juste, ≥ 3 réponses)
//   2. Angle mort (thème le moins juste OU le plus inexploré)
//   3. Biais d'estimation (jusqu'à 3 thèmes où tu surestimes/sous-estimes)
// Toute la section se cache silencieusement si rien à dire (utilisateur tout
// neuf avec < 3 réponses par thème) — l'app ne ment pas en montrant un
// portrait vide.
// ============================================================================

/// PortraitSection est aussi utilisée par la page Profile (entrée menu user
/// "Mon profil") — on l'exporte pour éviter une duplication. Sur Profile elle
/// est rendue avec le radar à côté ; sur Stats (anciennement) elle vit dans
/// la liste des sections. Aujourd'hui Stats ne la rend plus, mais on garde
/// l'export public pour le futur.
export function PortraitSection({
  portrait,
  variant,
  answeredCount,
  onNavigate,
}: {
  portrait: PortraitStats;
  variant: "mobile" | "desktop";
  /// Nombre total de réponses enregistrées. Sert à arbitrer entre
  /// "rien à dire" (cache la section) et "presque assez" (teaser).
  answeredCount: number;
  /// Pour le lien "Voir tous les indicateurs →" qui ouvre la page dédiée.
  onNavigate?: (target: NavTarget) => void;
}) {
  const { strongTheme, weakTheme, blindSpot, indicatorBiases } = portrait;
  const hasStrong = strongTheme !== null;
  const hasWeak = weakTheme !== null && weakTheme.id !== strongTheme?.id;
  // blindSpot pertinent seulement s'il y a du non-exploré ET qu'il diffère
  // déjà des autres cartes (sinon répétition).
  const blindSpotIsNovel =
    blindSpot !== null &&
    blindSpot.total - blindSpot.answered > 0 &&
    blindSpot.id !== strongTheme?.id &&
    blindSpot.id !== weakTheme?.id;
  // Filtre uniquement les indicateurs avec un biais notable (≠ "juste"
  // qualitative). Affiche jusqu'à 3 pour rester lisible.
  const notableIndicators = indicatorBiases
    .filter((b) => b.qualitative !== "juste")
    .slice(0, 3);
  const hasBiases = notableIndicators.length > 0;
  const hasAnyInsight = hasStrong || hasWeak || blindSpotIsNovel || hasBiases;

  // Cas teaser : entre 1 et 9 réponses, pas encore assez pour des conclusions
  // statistiquement honnêtes (3 réponses min par thème pour qualifier un
  // point fort/angle mort), mais on veut faire savoir à l'utilisateur que
  // cette section *existera*. Au-delà de 10 réponses ET toujours rien à
  // afficher, on suppose qu'il joue varié et on cache silencieusement.
  if (!hasAnyInsight) {
    if (answeredCount > 0 && answeredCount < 10) {
      return <PortraitTeaser variant={variant} />;
    }
    return null;
  }

  return (
    <Section title="Portrait" variant={variant}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(hasStrong || hasWeak || blindSpotIsNovel) ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                variant === "desktop"
                  ? `repeat(${[hasStrong, hasWeak, blindSpotIsNovel].filter(Boolean).length}, 1fr)`
                  : "1fr",
              gap: 10,
            }}
          >
            {hasStrong && strongTheme ? (
              <PortraitCard
                kind="strong"
                themeLabel={strongTheme.label}
                themeColor={strongTheme.color}
                metric={`${strongTheme.accuracyPct}\u00A0%`}
                metricSub={`${strongTheme.correct}/${strongTheme.answered}`}
                eyebrow="Ton point fort"
                copy={strongPhraseFor(strongTheme.accuracyPct ?? 0)}
                variant={variant}
              />
            ) : null}
            {hasWeak && weakTheme ? (
              <PortraitCard
                kind="weak"
                themeLabel={weakTheme.label}
                themeColor={weakTheme.color}
                metric={`${weakTheme.accuracyPct}\u00A0%`}
                metricSub={`${weakTheme.correct}/${weakTheme.answered}`}
                eyebrow="Angle mort"
                copy={weakPhraseFor(weakTheme.accuracyPct ?? 0)}
                variant={variant}
              />
            ) : null}
            {blindSpotIsNovel && blindSpot ? (
              <PortraitCard
                kind="blindspot"
                themeLabel={blindSpot.label}
                themeColor={blindSpot.color}
                metric={`${blindSpot.total - blindSpot.answered}`}
                metricSub="non vues"
                eyebrow="À creuser"
                copy={`Tu n'as pas encore exploré la majorité du thème ${blindSpot.label.toLowerCase()}.`}
                variant={variant}
              />
            ) : null}
          </div>
        ) : null}
        {hasBiases ? (
          <IndicatorBiasesCard biases={notableIndicators} variant={variant} />
        ) : null}
        {/* PortraitShareBar retiré : redondant avec les 3 boutons partage
            (Télécharger / Copier URL / Copier texte+URL) du RadarBlock juste
            au-dessus sur la page Profile. Là où PortraitSection est rendue
            (uniquement Profile aujourd'hui), le RadarBlock fournit déjà des
            actions de partage plus riches et plus visibles. */}
      </div>
    </Section>
  );
}

/// Bouton "Partager mon portrait" : compose un texte court à copier (le
/// presse-papier est plus universel que Web Share API, qui n'existe que
/// sur HTTPS + mobile). L'utilisateur peut ensuite coller où il veut.
/// Texte volontairement modeste : ne se transforme pas en "mon score est
/// 78 %" (anti-posture compétitive), reste sur le ton "voici ce que je
/// connais bien / mal" et invite à comparer.
function PortraitShareBar({
  strongTheme,
  weakTheme,
  indicatorBiases,
  variant,
}: {
  strongTheme: ThemeStatRow | null;
  weakTheme: ThemeStatRow | null;
  indicatorBiases: IndicatorBiasRow[];
  variant: "mobile" | "desktop";
}) {
  const [copied, setCopied] = useState(false);
  const text = composePortraitShareText({ strongTheme, weakTheme, indicatorBiases });
  if (text === null) return null;
  const shareText: string = text;
  async function onCopy() {
    try {
      // navigator.share préférable sur mobile (ouvre la sheet native), fallback
      // clipboard sur desktop ou navigateurs sans share API. On garde le copy
      // comme baseline parce qu'il fonctionne partout sans permission spéciale.
      if (
        typeof navigator !== "undefined" &&
        typeof (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share === "function"
      ) {
        try {
          await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
            title: "Mon portrait Mon2027",
            text: shareText,
          });
          return;
        } catch {
          // L'utilisateur a annulé ou le navigateur a refusé : fallback copy.
        }
      }
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        // Reset visuel après 2s pour autoriser un nouveau partage.
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Échec silencieux — pas de toast d'erreur sur une feature secondaire.
    }
  }
  return (
    <div
      style={{
        marginTop: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: variant === "desktop" ? 13 : 12.5,
          color: "var(--ink-mute)",
          flex: 1,
          minWidth: 0,
          lineHeight: 1.4,
        }}
      >
        Partage ton portrait en 1 ligne : invite quelqu&apos;un à comparer.
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copier mon portrait"
        style={{
          background: copied ? "var(--signal-good-ink)" : "var(--ink)",
          color: "var(--cream-warm)",
          border: 0,
          borderRadius: 999,
          padding: variant === "desktop" ? "8px 16px" : "7px 14px",
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: variant === "desktop" ? 13 : 12.5,
          cursor: "pointer",
          letterSpacing: "-0.005em",
          transition: "background 0.18s",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "Copié ✓" : "Partager mon portrait"}
      </button>
    </div>
  );
}

/// Compose le texte partageable à partir des insights du portrait. Format
/// volontairement compact pour Twitter/X (≤ 280 chars). On évite tout
/// chiffrisme : pas de "score 78%" — on parle de thèmes connus/à creuser
/// et de biais directionnels. Le lien mon2027.fr clôt l'invite.
export function composePortraitShareText({
  strongTheme,
  weakTheme,
  indicatorBiases,
}: {
  strongTheme: ThemeStatRow | null;
  weakTheme: ThemeStatRow | null;
  indicatorBiases: IndicatorBiasRow[];
}): string | null {
  const parts: string[] = [];
  if (strongTheme) parts.push(`je connais bien ${strongTheme.label.toLowerCase()}`);
  if (weakTheme) parts.push(`moins bien ${weakTheme.label.toLowerCase()}`);
  // On surface le biais le plus marqué (1er du tri par magnitude). Le
  // subjectShort se lit naturellement après "je surestime"/"je sous-estime".
  // Évite le chiffre — la prose qualitative est plus partageable et moins
  // trompeuse sur petit échantillon.
  if (indicatorBiases.length > 0) {
    const top = indicatorBiases[0];
    const verb = top.signedScore > 0 ? "je surestime" : "je sous-estime";
    parts.push(`${verb} ${top.subjectShort}`);
  }
  if (parts.length === 0) return null;
  return `Sur Mon2027, j'ai découvert : ${parts.join(", ")}. Et toi, tu connais les chiffres de la France ? mon2027.fr`;
}

/// Phrases adaptées au niveau de justesse pour rester sincères : pas de
/// "Tu maîtrises" à 60% (ce serait flatteur), pas de "Tu connais bien" à
/// 100% (ce serait flat). Trois paliers : décent / solide / excellent.
function strongPhraseFor(accuracyPct: number): string {
  if (accuracyPct >= 80) return "Tu y vois clair, les chiffres collent à la réalité.";
  if (accuracyPct >= 65) return "Tes intuitions tombent souvent juste sur ce thème.";
  return "C'est ton meilleur thème pour l'instant : continue.";
}

function weakPhraseFor(accuracyPct: number): string {
  if (accuracyPct <= 30) return "L'écart entre ce que tu pensais et les chiffres est marqué.";
  if (accuracyPct <= 50) return "Il y a matière à recalibrer ton intuition.";
  return "Pas catastrophique, mais ton terrain le moins ferme.";
}

function PortraitTeaser({ variant }: { variant: "mobile" | "desktop" }) {
  return (
    <Section title="Portrait" variant={variant}>
      <div
        style={{
          background: "var(--cream-warm)",
          border: "1.5px dashed var(--rule)",
          borderRadius: 14,
          padding: variant === "desktop" ? "20px 24px" : "16px 18px",
          color: "var(--ink-soft)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: variant === "desktop" ? 17 : 15,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            marginBottom: 6,
          }}
        >
          Ton portrait se dessine.
        </div>
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: variant === "desktop" ? 14 : 13,
            lineHeight: 1.5,
            textWrap: "pretty",
          }}
        >
          Joue quelques questions de plus pour qu&apos;apparaisse ton point fort, ton
          angle mort, et tes biais d&apos;estimation par thème.
        </div>
      </div>
    </Section>
  );
}

function PortraitCard({
  kind,
  themeLabel,
  themeColor,
  metric,
  metricSub,
  eyebrow,
  copy,
  variant,
}: {
  kind: "strong" | "weak" | "blindspot";
  themeLabel: string;
  themeColor: string;
  metric: string;
  metricSub?: string;
  eyebrow: string;
  copy: string;
  variant: "mobile" | "desktop";
}) {
  // Couleur dominante : un trait vertical à gauche dans la couleur du thème
  // pour l'identifier d'un coup d'œil, le reste reste sobre (paper + ink).
  // L'accent sémantique (good/bad/neutral) est réservé à la pastille eyebrow
  // — sinon trois cartes de couleurs différentes feraient pop sur fond cream,
  // visuellement saturé.
  // Texte de 10,5 px : teintes foncées (*-ink, ≥ 4,5:1), les teintes claires
  // restent réservées aux fonds, traits et barres.
  const eyebrowColor =
    kind === "strong"
      ? "var(--signal-good-ink)"
      : kind === "weak"
        ? "var(--signal-bad-ink)"
        : "var(--ink-soft)";
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        padding: variant === "desktop" ? "16px 18px" : "14px 14px 14px 16px",
        borderLeft: `4px solid ${themeColor}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: variant === "desktop" ? 140 : undefined,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: eyebrowColor,
          fontWeight: 600,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: variant === "desktop" ? 22 : 18,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            color: "var(--ink)",
            minWidth: 0,
          }}
        >
          {themeLabel}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: variant === "desktop" ? 18 : 16,
            color: "var(--ink-soft)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {metric}
          {metricSub ? (
            <span
              className="mono"
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--ink-mute)",
                letterSpacing: "0.04em",
              }}
            >
              {metricSub}
            </span>
          ) : null}
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: variant === "desktop" ? 14 : 13,
          color: "var(--ink-soft)",
          lineHeight: 1.45,
          textWrap: "pretty",
        }}
      >
        {copy}
      </div>
    </div>
  );
}

/// Carte d'affichage des biais par INDICATEUR sémantique (lecture principale
/// depuis 2026-05-22). Remplace l'ancienne BiasesCard par-thème.
///
/// Visuel : pour chaque indicateur, une ligne avec
///   - le label de l'indicateur (mono caps)
///   - un verbe qualitatif ("Tu surestimes" / "Tu vois plutôt juste"…)
///   - le sujet précis ("la précarité des plus modestes")
///   - une jauge horizontale [−1 ⟵ 0 ⟶ +1] avec un marker à la position du score
///   - le compteur d'indices agrégés (format discret)
///
/// La jauge est plus lisible qu'un pourcentage : elle dit "où tu es" sur un
/// continuum, sans donner d'illusion de précision (l'ancien "+9%" sur petit
/// échantillon était trompeur). Les paliers qualitatifs (forte_sur, sur,
/// juste, sous, forte_sous) servent à formuler le verbe sans bcp de prose.
function IndicatorBiasesCard({
  biases,
  variant,
}: {
  biases: IndicatorBiasRow[];
  variant: "mobile" | "desktop";
}) {
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        padding: variant === "desktop" ? "18px 22px" : "16px 16px",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 14,
          fontWeight: 600,
        }}
      >
        Biais de perception
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: variant === "desktop" ? 14 : 12 }}>
        {biases.map((b) => (
          <IndicatorBiasRowView key={b.id} bias={b} variant={variant} />
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 12.5,
          color: "var(--ink-mute)",
          lineHeight: 1.45,
          textWrap: "pretty",
        }}
      >
        Sur les sujets qui reviennent souvent dans tes réponses (chiffres
        et choix confondus). Plus tu joues, plus le portrait s&apos;affine.
      </div>
    </div>
  );
}

function IndicatorBiasRowView({
  bias,
  variant,
}: {
  bias: IndicatorBiasRow;
  variant: "mobile" | "desktop";
}) {
  // Verbe + couleur selon le palier qualitatif. Évite de donner une
  // fausse précision (% sur petit n) — on dit la TENDANCE et c'est tout.
  const { verb, color, textColor } = verbAndColorFor(bias.qualitative);
  // Position du marker sur la jauge : signedScore mappé sur [0, 100] où
  // 0 = "fortement sous-estime" (-1), 50 = "juste" (0), 100 = "fortement
  // surestime" (+1).
  const markerPct = Math.max(0, Math.min(100, ((bias.signedScore + 1) / 2) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: variant === "desktop" ? 14 : 13,
            color: "var(--ink)",
            lineHeight: 1.4,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
              marginRight: 8,
              fontWeight: 600,
            }}
          >
            {bias.label}
          </span>
          <strong style={{ fontWeight: 600, color: textColor }}>{verb}</strong>{" "}
          {bias.subjectShort}
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {bias.count} indice{bias.count > 1 ? "s" : ""}
        </span>
      </div>
      {/* Jauge horizontale [−1, +1] avec marker à la position du signedScore.
          Le centre (0) est marqué par un tick discret pour repère visuel.
          Le segment entre le centre et le marker est coloré : c'est la
          "distance au juste" qui porte l'info, le point n'est que le
          terminus. */}
      <div
        style={{
          position: "relative",
          height: 8,
          background: "rgba(0,0,0,0.05)",
          borderRadius: 999,
        }}
        aria-hidden
      >
        <span
          style={{
            position: "absolute",
            left: `${Math.min(50, markerPct)}%`,
            right: `${100 - Math.max(50, markerPct)}%`,
            top: 0,
            bottom: 0,
            background: color,
            opacity: bias.qualitative === "juste" ? 0.35 : 0.55,
            // Arrondi seulement côté marker, franc côté centre (le 0 est
            // un ancrage net, pas un début flottant).
            borderTopLeftRadius: markerPct < 50 ? 999 : 0,
            borderBottomLeftRadius: markerPct < 50 ? 999 : 0,
            borderTopRightRadius: markerPct > 50 ? 999 : 0,
            borderBottomRightRadius: markerPct > 50 ? 999 : 0,
            transition: "left 0.4s cubic-bezier(.2,.7,.2,1), right 0.4s cubic-bezier(.2,.7,.2,1)",
          }}
        />
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
          }}
        />
      </div>
    </div>
  );
}

/// Mappe le palier qualitatif → verbe + couleurs. Les paliers neutres
/// ("juste") restent en ink-soft, les biais marqués prennent une couleur
/// signal rouge (sur) ou orange (sous) pour les distinguer. `color` sert à
/// la jauge (teinte claire), `textColor` au verbe (teinte foncée lisible).
function verbAndColorFor(q: IndicatorBiasRow["qualitative"]): {
  verb: string;
  color: string;
  textColor: string;
} {
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
      return { verb: "Tu sous-estimes nettement", color: "var(--signal-mid)", textColor: "var(--signal-mid-ink)" };
  }
}

// ============================================================================
// RewardsTeaser — niveau + barre vers le suivant + miniatures badges récents.
// Lien direct vers la page Récompenses (scène "rewards"). Volontairement
// concentré sur la motivation : pas de breakdown détaillé ici, qui vit dans
// /rewards. Cf. screens/rewards.tsx pour la page complète.
// ============================================================================

function RewardsTeaser({
  level,
  badgeCounts,
  recentBadges,
  variant,
  onNavigate,
}: {
  level: LevelInfo;
  badgeCounts: { unlocked: number; total: number };
  recentBadges: ReturnType<typeof listAllBadges>;
  variant: "mobile" | "desktop";
  onNavigate?: (target: NavTarget) => void;
}) {
  const pct = Math.round(level.progressInLevel * 100);
  return (
    <Section title="Récompenses" variant={variant}>
      <div
        style={{
          background: "var(--cream-warm)",
          color: "var(--ink)",
          border: "1.5px solid var(--rule-soft)",
          borderRadius: 14,
          padding: variant === "desktop" ? "18px 22px" : "16px 18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
                marginBottom: 4,
              }}
            >
              Niveau {level.current.rank}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: variant === "desktop" ? 22 : 18,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
                // Ink et non coral : 18 px gras n'est pas du « grand texte »
                // et le coral plafonne à 2,6:1 sur ce fond. La barre d'XP
                // juste dessous garde l'accent coral.
                color: "var(--ink)",
              }}
            >
              {level.current.name}
            </div>
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.06em",
              color: "var(--ink-mute)",
              textTransform: "uppercase",
            }}
          >
            {badgeCounts.unlocked} / {badgeCounts.total} badges
          </div>
        </div>
        {level.next ? (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                height: 5,
                borderRadius: 999,
                background: "rgba(26,26,26,0.08)",
                overflow: "hidden",
              }}
              aria-hidden
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--coral)",
                  transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
                }}
              />
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                color: "var(--ink-mute)",
                textTransform: "uppercase",
              }}
            >
              Prochain : {level.next.name}
            </div>
          </div>
        ) : null}

        {recentBadges.length > 0 ? (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {recentBadges.map((b) => {
              const def = BADGE_BY_ID.get(b.def.id);
              if (!def) return null;
              return (
                <span
                  key={b.def.id}
                  title={def.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--paper)",
                    border: "1px solid var(--rule-soft)",
                    borderRadius: 999,
                    padding: "5px 10px 5px 6px",
                    fontSize: 11.5,
                    fontFamily: "var(--font-body)",
                    color: "var(--ink)",
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: "var(--coral)",
                      color: "var(--cream-warm)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <BadgeIcon kind={def.icon} size={11} />
                  </span>
                  {def.label}
                </span>
              );
            })}
          </div>
        ) : null}

        {onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate("rewards")}
            style={{
              marginTop: 14,
              background: "transparent",
              color: "var(--ink)",
              border: "1.5px solid var(--ink)",
              borderRadius: 12,
              padding: variant === "desktop" ? "9px 16px" : "8px 14px",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: variant === "desktop" ? 13 : 12.5,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Voir mes récompenses →
          </button>
        ) : null}
      </div>
    </Section>
  );
}

// ============================================================================
// Hero — 3 KPI alignés (répondu, justesse, série) + meta dernière session.
// ============================================================================

export function HeroBlock({
  hero,
  variant,
}: {
  hero: HeroStats;
  variant: "mobile" | "desktop";
}) {
  const progressPct = hero.total > 0 ? Math.round((hero.answered / hero.total) * 100) : 0;
  return (
    <section style={{ marginTop: variant === "mobile" ? 12 : 0 }}>
      <div
        style={{
          background: "var(--cream-warm)",
          border: "1.5px solid var(--rule-soft)",
          borderRadius: variant === "desktop" ? 22 : 18,
          padding: variant === "desktop" ? "28px 28px 24px" : "20px 18px 18px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: variant === "desktop" ? 24 : 12,
          }}
        >
          <Kpi
            label="Répondu"
            value={`${hero.answered}`}
            sub={`sur ${hero.total}`}
            variant={variant}
          />
          <Kpi
            label="Justesse"
            value={hero.accuracyPct === null ? "–" : `${hero.accuracyPct}\u00A0%`}
            sub={hero.accuracyPct === null ? "à débloquer" : `${hero.correct} bonnes`}
            accent={hero.accuracyPct !== null && hero.accuracyPct >= 60 ? "good" : undefined}
            variant={variant}
          />
          <Kpi
            label="Jours d'affilée"
            value={`${hero.streakDays}`}
            sub={hero.streakDays === 0 ? "à lancer" : "en cours"}
            accent={hero.streakDays >= 3 ? "coral" : undefined}
            variant={variant}
          />
        </div>

        {/* Barre de progression globale */}
        <div style={{ marginTop: variant === "desktop" ? 24 : 18 }}>
          <ProgressBar pct={progressPct} />
          <div
            style={{
              marginTop: 8,
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-mute)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <span>{progressPct}&nbsp;% du catalogue</span>
            {/* Sur desktop, la dernière session vit déjà dans la carte
                `StatsAside` à droite du hero (avec son libellé relatif
                "Aujourd'hui / Hier / Il y a N jours"). On évite la double
                mention en la cachant ici. Sur mobile, pas d'aside : on
                garde l'info. */}
            {variant === "mobile" ? (
              <span>
                {hero.lastPlayedDay
                  ? `Dernière session ${formatDayKey(hero.lastPlayedDay)}`
                  : "Aucune session"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  variant,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "good" | "coral";
  variant: "mobile" | "desktop";
}) {
  // Chiffres de 28-40 px gras (grand texte, seuil 3:1) : vert foncé, et
  // coral-deep plutôt que coral (2,6:1 seulement sur ce fond).
  const valueColor =
    accent === "good"
      ? "var(--signal-good-ink)"
      : accent === "coral"
        ? "var(--coral-deep)"
        : "var(--ink)";
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: variant === "desktop" ? 40 : 28,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          color: valueColor,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: "var(--ink-soft)",
          fontFamily: "var(--font-body)",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: "rgba(26,26,26,0.08)",
        overflow: "hidden",
      }}
      aria-hidden
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: "var(--ink)",
          transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
        }}
      />
    </div>
  );
}

// ============================================================================
// Par thème — barre par thème + % justesse à droite.
// ============================================================================

function ByThemeSection({
  rows,
  variant,
}: {
  rows: ThemeStatRow[];
  variant: "mobile" | "desktop";
}) {
  if (rows.length === 0) return null;
  return (
    <Section title="Par thème" variant={variant}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <ThemeRow key={r.id} row={r} variant={variant} />
        ))}
      </div>
    </Section>
  );
}

function ThemeRow({
  row,
  variant,
}: {
  row: ThemeStatRow;
  variant: "mobile" | "desktop";
}) {
  const progressPct = row.total > 0 ? Math.round((row.answered / row.total) * 100) : 0;
  const accuracyColor =
    row.accuracyPct === null
      ? "var(--ink-mute)"
      : row.accuracyPct >= 60
        ? "var(--signal-good-ink)"
        : row.accuracyPct >= 40
          ? "var(--ink-soft)"
          : "var(--signal-bad-ink)";
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        padding: variant === "desktop" ? "14px 18px" : "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: variant === "desktop" ? 16 : 14,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.label}
          </div>
          <div
            className="mono"
            style={{
              marginTop: 2,
              fontSize: 11,
              color: "var(--ink-mute)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {row.answered} / {row.total} répondu{row.answered > 1 ? "s" : ""}
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: variant === "desktop" ? 22 : 18,
            letterSpacing: "-0.02em",
            color: accuracyColor,
            whiteSpace: "nowrap",
          }}
        >
          {row.accuracyPct === null ? "–" : `${row.accuracyPct}\u00A0%`}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <BarColored pct={progressPct} color={row.color} />
      </div>
    </div>
  );
}

function BarColored({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      style={{
        height: 5,
        borderRadius: 999,
        background: "rgba(26,26,26,0.06)",
        overflow: "hidden",
      }}
      aria-hidden
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: color,
          transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
        }}
      />
    </div>
  );
}

// ============================================================================
// Par format
// ============================================================================

function ByFormatSection({
  rows,
  variant,
}: {
  rows: FormatStatRow[];
  variant: "mobile" | "desktop";
}) {
  if (rows.length === 0) return null;
  return (
    <Section title="Par format" variant={variant}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: variant === "desktop" ? "repeat(auto-fill, minmax(220px, 1fr))" : "1fr 1fr",
          gap: 10,
        }}
      >
        {rows.map((r) => (
          <FormatTile key={r.format} row={r} variant={variant} />
        ))}
      </div>
    </Section>
  );
}

function FormatTile({
  row,
  variant,
}: {
  row: FormatStatRow;
  variant: "mobile" | "desktop";
}) {
  const accuracyColor =
    row.accuracyPct === null
      ? "var(--ink-mute)"
      : row.accuracyPct >= 60
        ? "var(--signal-good-ink)"
        : row.accuracyPct >= 40
          ? "var(--ink-soft)"
          : "var(--signal-bad-ink)";
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        padding: variant === "desktop" ? "14px 18px" : "12px 14px",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}
      >
        {row.label}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: variant === "desktop" ? 26 : 22,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: accuracyColor,
          }}
        >
          {row.accuracyPct === null ? "–" : `${row.accuracyPct}\u00A0%`}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-soft)",
            fontFamily: "var(--font-body)",
            whiteSpace: "nowrap",
          }}
        >
          {row.correct}/{row.answered}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Défis
// ============================================================================

function ChallengesSection({
  summary,
  sentStatus,
  unseenResponses,
  variant,
  onNavigate,
}: {
  summary: ChallengeSummary;
  /// État de la lecture serveur des défis envoyés. « loading » : on ne
  /// conclut pas encore à l'absence de défi ; « error » (hors ligne…) : on
  /// ne peut pas l'affirmer non plus.
  sentStatus: "loading" | "ok" | "error";
  /// Réponses d'ami·e·s pas encore vues (même compteur que la pastille de
  /// l'onglet Défier).
  unseenResponses: number;
  variant: "mobile" | "desktop";
  onNavigate?: (target: NavTarget) => void;
}) {
  const empty = summary.sentCount === 0 && summary.receivedCount === 0;
  if (empty && sentStatus === "loading") {
    return (
      <Section title="Défis" variant={variant}>
        <div
          aria-busy="true"
          style={{
            minHeight: variant === "desktop" ? 76 : 64,
            borderRadius: 14,
            background: "var(--paper)",
            border: "1px solid var(--rule-soft)",
          }}
        />
      </Section>
    );
  }
  const sentSub =
    unseenResponses > 0
      ? `${unseenResponses} nouvelle${unseenResponses > 1 ? "s" : ""} réponse${unseenResponses > 1 ? "s" : ""}`
      : summary.sentCount > 0
        ? summary.sentResponses > 0
          ? `${summary.sentResponses} réponse${summary.sentResponses > 1 ? "s" : ""} d'ami·e·s`
          : "Personne n'a encore joué"
        : undefined;
  return (
    <Section title="Défis" variant={variant}>
      {empty ? (
        <div
          style={{
            background: "var(--paper)",
            border: "1px dashed var(--rule)",
            borderRadius: 14,
            padding: variant === "desktop" ? "18px 22px" : "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: variant === "desktop" ? 14 : 13,
              color: "var(--ink-soft)",
              lineHeight: 1.4,
              maxWidth: 480,
            }}
          >
            {sentStatus === "ok" ? (
              <>
                Tu n&apos;as encore ni envoyé ni reçu de défi. Envoie 5
                questions à un·e proche et compare vos scores.
              </>
            ) : (
              <>
                Tes défis n&apos;ont pas pu être chargés. Envoie 5 questions à
                un·e proche et compare vos scores.
              </>
            )}
          </div>
          {onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate("challenge")}
              className="account-modal-secondary"
              style={{ width: "auto", marginTop: 0, whiteSpace: "nowrap" }}
            >
              Créer un défi
            </button>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: variant === "desktop" ? "repeat(3, 1fr)" : "1fr 1fr",
            gap: 10,
          }}
        >
          <ChallengeTile
            label="Envoyés"
            value={sentStatus === "error" && summary.sentCount === 0 ? "–" : `${summary.sentCount}`}
            sub={sentSub}
            variant={variant}
          />
          <ChallengeTile
            label="Reçus"
            value={`${summary.receivedCount}`}
            sub={
              summary.receivedCount > summary.receivedPlayed
                ? `${summary.receivedCount - summary.receivedPlayed} à jouer`
                : undefined
            }
            variant={variant}
          />
          {summary.receivedAvgMyScore !== null ? (
            <ChallengeTile
              label="Mon score moyen"
              value={`${summary.receivedAvgMyScore}\u00A0%`}
              sub={
                summary.receivedAvgOpponentScore !== null
                  ? `vs ${summary.receivedAvgOpponentScore}\u00A0% adverse`
                  : undefined
              }
              variant={variant}
              accent={
                summary.receivedAvgOpponentScore !== null &&
                summary.receivedAvgMyScore >= summary.receivedAvgOpponentScore
                  ? "good"
                  : undefined
              }
            />
          ) : null}
        </div>
      )}
      {!empty && onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate("defis-history")}
          className="account-modal-secondary"
          style={{ width: "auto", marginTop: 12 }}
        >
          Voir mes défis
        </button>
      ) : null}
    </Section>
  );
}

function ChallengeTile({
  label,
  value,
  sub,
  accent,
  variant,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "good";
  variant: "mobile" | "desktop";
}) {
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        padding: variant === "desktop" ? "14px 18px" : "12px 14px",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: variant === "desktop" ? 28 : 24,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: accent === "good" ? "var(--signal-good-ink)" : "var(--ink)",
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "var(--ink-soft)",
            fontFamily: "var(--font-body)",
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Favoris (résumé + lien vers la page)
// ============================================================================

function FavoritesSection({
  count,
  variant,
  onNavigate,
}: {
  count: number;
  variant: "mobile" | "desktop";
  onNavigate?: (target: NavTarget) => void;
}) {
  return (
    <Section title="Favoris" variant={variant}>
      <div
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 14,
          padding: variant === "desktop" ? "16px 20px" : "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: variant === "desktop" ? 28 : 22,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {count}
          </div>
          <div
            style={{
              fontSize: variant === "desktop" ? 14 : 13,
              color: "var(--ink-soft)",
            }}
          >
            question{count > 1 ? "s" : ""} marquée{count > 1 ? "s" : ""}
          </div>
        </div>
        {onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate("favorites")}
            className="account-modal-secondary"
            style={{ width: "auto", marginTop: 0, whiteSpace: "nowrap" }}
          >
            Voir mes favoris
          </button>
        ) : null}
      </div>
    </Section>
  );
}

// ============================================================================
// Bricks réutilisables
// ============================================================================

function Section({
  title,
  variant,
  children,
}: {
  title: string;
  variant: "mobile" | "desktop";
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="mono"
        style={{
          fontSize: variant === "desktop" ? 12 : 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          margin: "0 0 12px",
          fontWeight: 500,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({
  onNavigate,
  variant,
}: {
  onNavigate?: (target: NavTarget) => void;
  variant: "mobile" | "desktop";
}) {
  return (
    <div
      style={{
        marginTop: variant === "mobile" ? 16 : 0,
        padding: variant === "desktop" ? "40px 32px" : "32px 24px",
        background: "var(--cream-warm)",
        border: "1.5px dashed var(--rule)",
        borderRadius: 18,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: variant === "desktop" ? 64 : 56,
          height: variant === "desktop" ? 64 : 56,
          borderRadius: 16,
          background: "var(--coral)",
          color: "var(--cream-warm)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 16px",
        }}
      >
        <svg
          width={variant === "desktop" ? 32 : 28}
          height={variant === "desktop" ? 32 : 28}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 3v18h18" />
          <path d="M7 16V11" />
          <path d="M12 16V8" />
          <path d="M17 16V13" />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: variant === "desktop" ? 26 : 20,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
        }}
      >
        Pas encore de stats.
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: variant === "desktop" ? 16 : 14,
          color: "var(--ink-soft)",
          lineHeight: 1.5,
          textWrap: "balance",
          maxWidth: 380,
          margin: "8px auto 0",
        }}
      >
        Joue ta première question, n&apos;importe laquelle, et tes stats
        commenceront à se remplir ici.
      </div>
      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate("daily")}
          style={{
            marginTop: 20,
            background: "var(--ink)",
            color: "var(--cream-warm)",
            border: 0,
            borderRadius: 14,
            padding: variant === "desktop" ? "14px 24px" : "12px 22px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: variant === "desktop" ? 16 : 15,
            cursor: "pointer",
          }}
        >
          Commencer
        </button>
      ) : null}
    </div>
  );
}
