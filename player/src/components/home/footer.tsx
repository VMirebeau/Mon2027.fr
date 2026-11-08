"use client";

/// HomeFooter — soit l'accroche éditoriale (pas de data), soit les 3 stats
/// joueur (questions répondues, bonnes réponses, streak). Le passage de
/// l'un à l'autre est piloté par `hasData` (≥ 1 question répondue).
///
/// SecondaryLinks — préserve l'accès à Méthode / À propos depuis la home,
/// puisque le nouveau header ne les expose plus dans la nav principale.

export type HomeFooterStats = {
  answered: number;
  correctPct: number;
  streak: number;
};

export function HomeFooter({
  hasData,
  stats,
  large,
}: {
  hasData: boolean;
  stats: HomeFooterStats | null;
  large?: boolean;
}) {
  if (!hasData || !stats) {
    return (
      <div
        style={{
          marginTop: large ? 40 : 28,
          textAlign: "center",
          padding: large ? "20px 32px" : "16px 20px",
          fontFamily: "var(--font-serif)",
          fontSize: large ? 16 : 14,
          fontStyle: "italic",
          color: "var(--ink-soft)",
          lineHeight: 1.5,
          textWrap: "balance",
          maxWidth: 540,
          margin: large ? "40px auto 0" : "28px auto 0",
        }}
      >
        Tu vas découvrir qu&apos;on se trompe en bonne compagnie.
        <br />
        Les chiffres sont sourcés, jamais inventés.
      </div>
    );
  }
  return (
    <div
      suppressHydrationWarning
      style={{
        marginTop: large ? 32 : 24,
        padding: large ? "18px 0" : "14px 0",
        borderTop: "1px solid var(--rule-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: large ? "flex-start" : "space-between",
        gap: large ? 32 : 12,
        flexWrap: "wrap",
      }}
    >
      <FooterStat label="Questions répondues" value={String(stats.answered)} />
      <FooterStat label="Bonnes réponses" value={`${stats.correctPct}\u00A0%`} />
      <FooterStat label="Jours d'affilée" value={String(stats.streak)} />
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 500,
          color: "var(--ink-mute)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        suppressHydrationWarning
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 15,
          color: "var(--ink)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function SecondaryLinks({
  large,
  onNavigate,
}: {
  large?: boolean;
  onNavigate: (target: "methode" | "apropos") => void;
}) {
  const linkStyle: React.CSSProperties = {
    background: "transparent",
    border: 0,
    cursor: "pointer",
    color: "inherit",
    padding: 0,
    fontFamily: "var(--font-body)",
    fontSize: 12,
  };
  return (
    <div
      style={{
        marginTop: large ? 28 : 24,
        textAlign: "center",
        fontSize: 12,
        color: "var(--ink-mute)",
      }}
    >
      <button
        type="button"
        onClick={() => onNavigate("methode")}
        style={linkStyle}
      >
        Méthode
      </button>
      <span style={{ margin: "0 8px" }}>·</span>
      <button
        type="button"
        onClick={() => onNavigate("apropos")}
        style={linkStyle}
      >
        À propos
      </button>
    </div>
  );
}
