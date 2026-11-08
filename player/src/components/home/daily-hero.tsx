"use client";

/// DailyHero — la carte hero de la home qui présente la question du jour.
/// Deux variantes pilotées par `dailyHeroVariantFor` :
///   - `answer` : carte pleine à la couleur du thème + son sticker, CTA "Y répondre"
///   - `review` : carte paper « Fait ✓ », question citée, ProximityBar + CTA
///                « Revoir »
///
/// L'énoncé est toujours affiché EN ENTIER : une coupe à 3 lignes tombait
/// au milieu de la phrase (« …la population est… ») et rendait la question
/// incompréhensible. Les énoncés longs passent simplement sur un corps plus
/// petit (cf. statementFontSize).
///
/// (La variante "alt" du prototype est une proposition à A/B test, pas
///  embarquée pour l'instant — à réactiver via feature flag plus tard.)

import { HomeIcon } from "../home-bits";
import { ThemeIllustration } from "../theme-illustration";
import { themeMeta } from "@/lib/theme-colors";
import type { Question } from "@/lib/types";

export type DailyHeroVariant = "answer" | "review";

export type DailyHeroProps = {
  question: Question;
  variant: DailyHeroVariant;
  /** Requis quand variant === "review" : 1 pour bonne réponse, 0 sinon. */
  answered?: { score: number; total: number } | null;
  onCta: () => void;
  large?: boolean;
};

export function DailyHero(props: DailyHeroProps) {
  if (props.variant === "review" && props.answered) {
    return (
      <DailyHeroReview
        question={props.question}
        answered={props.answered}
        large={props.large}
        onCta={props.onCta}
      />
    );
  }
  return (
    <DailyHeroDefault
      question={props.question}
      large={props.large}
      onCta={props.onCta}
    />
  );
}

function estTimeLabel(question: Question): string {
  // Les formats à items multiples sont plus longs ; on calibre vite ici
  // pour donner une indication crédible plutôt que "30 sec" pour tout.
  switch (question.format) {
    case "classement":
    case "vraifaux_multi":
    case "categorisation":
    case "pondere":
    case "curseur_multi":
      return "1 min";
    default:
      return "30 sec";
  }
}

function rangeLabel(question: Question): string | null {
  // Pour les questions chiffrées, on affiche la plage de l'estimation
  // (utile au joueur avant de répondre). Pour les autres formats, on
  // n'affiche rien d'extra dans le meta — le thème suffit.
  if (question.format === "estimation") {
    const [min, max] = question.range;
    const u = question.unitShort ?? question.unit;
    return `${min}–${max}${u ? ` ${u}` : ""}`;
  }
  return null;
}

/// Corps de l'énoncé selon sa longueur : les questions longues descendent
/// d'un cran pour que la carte reste compacte sans tronquer le texte.
function statementFontSize(text: string, large: boolean | undefined): number {
  const len = text.length;
  if (large) return len > 150 ? 26 : len > 100 ? 29 : 32;
  return len > 150 ? 18 : len > 100 ? 20 : 22;
}

function DailyHeroDefault({
  question,
  large,
  onCta,
}: {
  question: Question;
  large?: boolean;
  onCta: () => void;
}) {
  const time = estTimeLabel(question);
  const range = rangeLabel(question);
  const metaSuffix = range ? ` · ${range}` : "";
  const theme = themeMeta(question.theme);
  const themeId = theme?.id;
  return (
    <button
      type="button"
      onClick={onCta}
      className={`pop-card${large ? " pop-card--lg" : " pop-card--sm"}`}
      style={{
        /* `all: unset` casserait la classe utilitaire (border, radius,
           shadow, transition viennent d'elle). On reset à la place ce
           dont on a besoin pour neutraliser les défauts <button>. */
        boxSizing: "border-box",
        display: "block",
        width: "100%",
        /* Couleur du thème de la question, comme sa carte dans Découvrir
           (et son sticker, teinté pour ce fond). Jaune si thème inconnu. */
        background: theme?.color ?? "var(--yellow)",
        color: "var(--ink)",
        padding: large ? "32px 36px" : "22px 22px 18px",
        position: "relative",
        overflow: "hidden",
        textAlign: "left",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: large ? 18 : 14,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            padding: "5px 11px",
            background: "var(--ink)",
            // Même couleur que le fond de carte : la pastille se lit comme
            // une découpe dans la carte du thème.
            color: theme?.color ?? "var(--yellow)",
            borderRadius: 99,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          <HomeIcon.Sparkles size={11} />
          Question du jour
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink)",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <HomeIcon.Clock />
          {time}
        </span>
      </div>

      {/* Énoncé + sticker du thème à droite. Les marges négatives laissent
          le sticker déborder dans les respirations au-dessus et en dessous
          au lieu d'allonger la carte. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: large ? 32 : 12,
        }}
      >
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: statementFontSize(question.question, large),
            lineHeight: large ? 1.1 : 1.18,
            letterSpacing: "-0.02em",
            textWrap: "pretty",
            maxWidth: large ? 820 : "100%",
          }}
        >
          {question.question}
        </div>
        {themeId ? (
          <ThemeIllustration
            themeId={themeId}
            size={large ? 136 : 60}
            className="theme-art"
            style={{ margin: large ? "-14px 8px -14px 0" : "-6px -2px -6px 0" }}
          />
        ) : null}
      </div>

      <div
        style={{
          marginTop: large ? 24 : 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink)",
            letterSpacing: "0.04em",
          }}
        >
          {question.theme}
          {metaSuffix}
        </div>
        <span
          style={{
            background: "var(--ink)",
            color: "var(--cream-warm)",
            borderRadius: large ? 16 : 14,
            padding: large ? "16px 28px" : "12px 22px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: large ? 16 : 15,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            transition: "transform 0.12s",
          }}
        >
          Y répondre
          <HomeIcon.Arrow size={large ? 18 : 16} />
        </span>
      </div>
    </button>
  );
}

function DailyHeroReview({
  question,
  answered,
  large,
  onCta,
}: {
  question: Question;
  answered: { score: number; total: number };
  large?: boolean;
  onCta: () => void;
}) {
  return (
    <div
      className="soft-row"
      style={{
        /* Variant "review" : non-cliquable comme bloc (CTA interne), donc
           soft-row (pas soft-card) — pas de lift au hover. Fond paper au
           lieu de cream-warm pour distinguer du reste de la home. */
        background: "var(--paper)",
        color: "var(--ink)",
        borderRadius: large ? "var(--radius-xl)" : "var(--radius-lg)",
        padding: large ? "30px 36px" : "22px 22px 18px",
        borderColor: "var(--rule)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: large ? 14 : 12,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            padding: "5px 11px",
            background: "rgba(74,143,92,0.12)",
            color: "var(--signal-good-ink)",
            borderRadius: 99,
            textTransform: "uppercase",
          }}
        >
          {/* « Fait » plutôt que « Répondu aujourd'hui » : la réponse peut
              dater d'une partie précédente où la question est déjà sortie. */}
          Fait
          <HomeIcon.Check size={11} />
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}
        >
          {question.theme}
        </span>
      </div>

      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: large ? 24 : 18,
          lineHeight: 1.3,
          color: "var(--ink-soft)",
          textWrap: "balance",
          marginBottom: large ? 22 : 16,
        }}
      >
        « {question.question} »
      </div>

      <div
        style={{
          // Mobile : stack vertical pour laisser le bouton pleine largeur
          // sans masquer le label "pile dans la cible". Desktop : 2 colonnes.
          display: large ? "grid" : "flex",
          flexDirection: large ? undefined : "column",
          gridTemplateColumns: large ? "1fr auto" : undefined,
          gap: large ? 24 : 12,
          alignItems: large ? "center" : "stretch",
          paddingTop: large ? 16 : 12,
          borderTop: "1px solid var(--rule-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ProximityBar score={answered.score} total={answered.total} />
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-soft)",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            {answered.score === answered.total
              ? "Pile dans la cible"
              : answered.score > 0
                ? "Proche de la réalité"
                : "Loin de la réalité"}
          </div>
        </div>
        <button
          type="button"
          onClick={onCta}
          style={{
            background: "transparent",
            color: "var(--ink)",
            border: "1.5px solid var(--rule)",
            borderRadius: large ? 14 : 12,
            padding: large ? "12px 22px" : "10px 16px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: large ? 14 : 13,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            whiteSpace: "nowrap",
          }}
        >
          <HomeIcon.Eye />
          Revoir
          <span className="sr-only"> la question du jour</span>
        </button>
      </div>
    </div>
  );
}

function ProximityBar({ score, total }: { score: number; total: number }) {
  const pct = total > 0 ? score / total : 0;
  const filled = pct > 0.66 ? 3 : pct > 0.33 ? 2 : 1;
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 18,
            height: 6,
            borderRadius: 99,
            background:
              i <= filled
                ? filled === 3
                  ? "var(--signal-good)"
                  : filled === 2
                    ? "var(--signal-mid)"
                    : "var(--signal-bad)"
                : "var(--cream-deep)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Décide si la question du jour est en variant "review" (déjà répondue
 * aujourd'hui) ou "answer" (à répondre). Retourne aussi le score à passer
 * à `<DailyHero>` quand variant === "review".
 *
 * `answeredRecord` est typiquement `progress.answers[dailyQuestion.id]`.
 * Un answer ancien (j-1) compte comme "à répondre" : la "question du jour"
 * change quotidiennement, donc un enregistrement existant suffit à dire
 * "déjà jouée pour cette question-là".
 */
export function dailyHeroVariantFor(
  hasRecord: boolean,
  recordCorrect: boolean | null,
): {
  variant: DailyHeroVariant;
  answered: { score: number; total: number } | null;
} {
  if (!hasRecord) return { variant: "answer", answered: null };
  return {
    variant: "review",
    answered: { score: recordCorrect ? 1 : 0, total: 1 },
  };
}
