"use client";

import type { ReactNode } from "react";

/// En-tête éditorial pour les scènes accessibles via le menu user
/// (Mon compte, Mes stats, Mes récompenses, Mes favoris) — version mobile.
///
/// Sans ce header, ces pages attaquaient direct le contenu (KPI band, level
/// card, liste favoris…), ce qui faisait douter l'utilisateur sur la scène
/// active : la HomeHeader globale ne change pas, seuls les widgets dessous.
/// On reprend exactement le pattern eyebrow + display title + sous-titre
/// utilisé par les versions desktop (cf. stats-dt, rewards-dt, account-dt,
/// favorites-dt) en plus compact.
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header style={{ margin: "8px 0 20px" }}>
      {eyebrow ? (
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
            marginBottom: 8,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 28,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          margin: 0,
          textWrap: "balance",
        }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          style={{
            marginTop: 10,
            fontSize: 14,
            lineHeight: 1.45,
            color: "var(--ink-soft)",
            textWrap: "balance",
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}
