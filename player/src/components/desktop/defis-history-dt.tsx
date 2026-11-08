"use client";

/// Page "Mes défis" desktop — historique complet sans cap.
/// Header éditorial cohérent avec les autres pages DT (stats, rewards),
/// puis listes complètes via DefisHistoryBody.

import { AppFooter } from "./app-nav";
import { DefisHistoryBody } from "../screens/defis-history";
import type { NavTarget, Theme } from "@/lib/types";

export function DefisHistoryDT({
  themes,
  onNavigate,
}: {
  themes: Theme[];
  onNavigate?: (target: NavTarget) => void;
}) {
  return (
    <>
      <div className="dt-page">
        <div
          className="dt-content"
          style={{ paddingTop: 32, paddingBottom: 48 }}
        >
          <header style={{ maxWidth: 720, marginBottom: 36 }}>
            <div
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
                marginBottom: 12,
              }}
            >
              Mes défis · Envoyés et reçus
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(40px, 4.6vw, 64px)",
                lineHeight: 1,
                letterSpacing: "-0.035em",
                margin: 0,
                textWrap: "balance",
              }}
            >
              Tes <span style={{ color: "var(--coral)" }}>défis</span>.
            </h1>
            <p
              style={{
                marginTop: 20,
                fontSize: 18,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
                textWrap: "balance",
                maxWidth: 620,
              }}
            >
              Tous tes défis envoyés et ceux que tu as joués, plus récent
              d&apos;abord.
            </p>
          </header>

          <div style={{ maxWidth: 920 }}>
            <DefisHistoryBody
              themes={themes}
              onNavigate={onNavigate}
              variant="desktop"
            />
          </div>
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}
