"use client";

/// Étape A2 du flow Défier — Thème.
/// L'utilisateur choisit un thème ; on tire 5 questions au hasard dans le
/// thème et on lance immédiatement le jeu (pas de validation intermédiaire).

import { ThemeTile } from "../../defi-bits";
import type { Theme } from "@/lib/types";

/// Minimum de questions disponibles dans un thème pour qu'il soit jouable
/// dans un défi (5 questions tirées au hasard).
const MIN_FOR_DEFI = 5;

export function StepA2Body({
  themes,
  onPickTheme,
  onBackToSource,
  large,
}: {
  themes: Theme[];
  onPickTheme: (id: string) => void;
  /// Lien discret "← changer de source" sur desktop (où on a retiré
  /// l'AppHeader avec back arrow). Undefined sur mobile : l'AppHeader fait
  /// déjà le boulot.
  onBackToSource?: () => void;
  large?: boolean;
}) {
  return (
    <div
      style={{
        padding: large ? "8px 0 0" : "4px 18px 24px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {large ? (
        <>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 40,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              textWrap: "balance",
              maxWidth: 720,
            }}
          >
            Sur quel <span style={{ color: "var(--coral)" }}>thème</span> ?
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 16,
              color: "var(--ink-soft)",
              lineHeight: 1.5,
              maxWidth: 640,
            }}
          >
            Choisis un thème : on tire 5 questions au hasard, et tu y réponds
            avant de partager le défi.
          </div>
          {onBackToSource ? (
            <button
              type="button"
              onClick={onBackToSource}
              style={{
                marginTop: 12,
                alignSelf: "flex-start",
                background: "transparent",
                border: 0,
                padding: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              ← Changer de source
            </button>
          ) : null}
        </>
      ) : (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink-mute)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Choisis un thème · 5 questions au hasard
        </div>
      )}
      <div
        style={{
          marginTop: large ? 28 : 0,
          display: "grid",
          gridTemplateColumns: large ? "repeat(4, 1fr)" : "1fr 1fr",
          gap: large ? 16 : 10,
        }}
      >
        {themes.map((t) => (
          <ThemeTile
            key={t.id}
            label={t.label}
            color={t.color}
            count={t.count}
            disabled={t.count < MIN_FOR_DEFI}
            onClick={() => onPickTheme(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
