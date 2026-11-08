"use client";

/// ModeCard + ModesGrid — cartes d'entrée vers les 3 modes (Découvrir /
/// Réviser / Défier). Réviser n'apparaît que si l'utilisateur a déjà
/// répondu à au moins une question.

import { HomeIcon } from "../home-bits";

export type ModeAccent = "yellow" | "coral" | "teal";

const accentToColor: Record<ModeAccent, string> = {
  yellow: "var(--yellow)",
  coral: "var(--coral)",
  teal: "var(--teal)",
};

export type ModeCardProps = {
  title: string;
  sub: string;
  icon: React.ReactNode;
  accent: ModeAccent;
  eyebrow?: string;
  badge?: string;
  onClick: () => void;
  large?: boolean;
};

export function ModeCard({
  title,
  sub,
  icon,
  accent,
  eyebrow,
  badge,
  onClick,
  large,
}: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="soft-card"
      style={{
        color: "var(--ink)",
        borderRadius: large ? "var(--radius-lg)" : "var(--radius-md)",
        padding: large ? "26px 26px 24px" : "18px 20px 18px",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: large ? 16 : 12,
        width: "100%",
        minHeight: large ? 220 : undefined,
        fontFamily: "var(--font-body)",
      }}
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
            width: large ? 52 : 42,
            height: large ? 52 : 42,
            display: "grid",
            placeItems: "center",
            background: accentToColor[accent],
            color: "var(--ink)",
            border: "1.5px solid var(--ink)",
            borderRadius: "var(--radius-sm)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        {badge ? (
          <span
            suppressHydrationWarning
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.06em",
              background: "var(--ink)",
              color: "var(--yellow)",
              padding: "3px 9px",
              borderRadius: 99,
              textTransform: "uppercase",
            }}
          >
            {badge}
          </span>
        ) : eyebrow ? (
          <span
            suppressHydrationWarning
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--ink-mute)",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </span>
        ) : null}
      </div>

      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: large ? 22 : 19,
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: large ? 6 : 4,
            fontSize: large ? 14 : 13,
            color: "var(--ink-soft)",
            lineHeight: 1.4,
            textWrap: "pretty",
          }}
        >
          {sub}
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-soft)",
        }}
      >
        Ouvrir
        <HomeIcon.Arrow size={12} />
      </div>
    </button>
  );
}

export type ModesGridPick = "discover" | "review" | "challenge-pending";

export type ModesGridProps = {
  hasData: boolean;
  large?: boolean;
  /** Nombre de questions publiées (eyebrow Découvrir). */
  totalQuestions: number;
  /** Nombre de questions à retravailler (badge Réviser). 0 = pas de badge. */
  reviewCount: number;
  onPick: (mode: ModesGridPick) => void;
};

export function ModesGrid({
  hasData,
  large,
  totalQuestions,
  reviewCount,
  onPick,
}: ModesGridProps) {
  const modes: Array<{
    id: ModesGridPick;
    icon: React.ReactNode;
    accent: ModeAccent;
    title: string;
    sub: string;
    eyebrow?: string;
    badge?: string;
    hidden: boolean;
  }> = [
    {
      id: "discover",
      icon: <HomeIcon.Shuffle />,
      accent: "yellow",
      title: "Découvrir",
      sub: "Explore les questions par thème ou pioche au hasard.",
      eyebrow: `${totalQuestions} question${totalQuestions > 1 ? "s" : ""}`,
      hidden: false,
    },
    {
      id: "review",
      icon: <HomeIcon.Replay />,
      accent: "teal",
      title: "Réviser",
      sub: "Revois ce que tu as déjà joué et fixe les chiffres en tête.",
      badge: reviewCount > 0 ? `${reviewCount} à revoir` : undefined,
      hidden: !hasData,
    },
    {
      id: "challenge-pending",
      icon: <HomeIcon.Send />,
      accent: "coral",
      title: "Défier un proche",
      sub: "Envoie 5 questions à quelqu'un et compare vos réponses.",
      eyebrow: "Sans rdv · 3 min",
      hidden: false,
    },
  ];
  const visible = modes.filter((m) => !m.hidden);

  if (large) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${visible.length}, 1fr)`,
          gap: 14,
        }}
      >
        {visible.map((m) => (
          <ModeCard
            key={m.id}
            title={m.title}
            sub={m.sub}
            icon={m.icon}
            accent={m.accent}
            eyebrow={m.eyebrow}
            badge={m.badge}
            onClick={() => onPick(m.id)}
            large
          />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {visible.map((m) => (
        <ModeCard
          key={m.id}
          title={m.title}
          sub={m.sub}
          icon={m.icon}
          accent={m.accent}
          eyebrow={m.eyebrow}
          badge={m.badge}
          onClick={() => onPick(m.id)}
        />
      ))}
    </div>
  );
}
