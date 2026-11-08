"use client";

/// SectionHead — petite ligne "Continuer · 3 modes" au-dessus de la grille.

export function SectionHead({
  title,
  meta,
  large,
}: {
  title: string;
  meta?: string;
  large?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: large ? 16 : 12,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: large ? 22 : 16,
          letterSpacing: "-0.02em",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {meta ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}
        >
          {meta}
        </span>
      ) : null}
    </div>
  );
}
