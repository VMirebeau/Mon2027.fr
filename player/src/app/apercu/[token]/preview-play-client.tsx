"use client";

import { useState } from "react";
import { GameSession } from "@/components/game-session";
import {
  ActiveModeProvider,
  CurrentQuestionProvider,
  NavPaperProvider,
} from "@/components/desktop/app-nav";
import { PreviewModeProvider } from "@/lib/preview-mode";
import type { Question } from "@/lib/types";

/// Joue une question d'aperçu avec l'interface réelle du player, sans
/// navigation ni enregistrement (cf. PreviewModeProvider). « Rejouer »
/// remonte la partie pour tester une autre réponse.
export function PreviewPlayClient({ question }: { question: Question }) {
  const [round, setRound] = useState(0);
  return (
    <PreviewModeProvider value={true}>
      <ActiveModeProvider value={null}>
        <NavPaperProvider>
          <CurrentQuestionProvider>
            <div
              style={{
                minHeight: "100dvh",
                background: "var(--cream)",
                color: "var(--ink)",
                display: "flex",
                flexDirection: "column",
                fontFamily: "var(--font-body)",
              }}
            >
              <div
                role="note"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 16px",
                  background: "var(--ink)",
                  color: "var(--cream)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                }}
              >
                <span>Aperçu contributeur · rien n&apos;est enregistré ni compté</span>
                <button
                  type="button"
                  onClick={() => setRound((r) => r + 1)}
                  style={{
                    font: "inherit",
                    color: "inherit",
                    background: "transparent",
                    border: "1px solid currentColor",
                    borderRadius: 99,
                    padding: "4px 12px",
                    cursor: "pointer",
                  }}
                >
                  Rejouer
                </button>
              </div>
              <GameSession
                key={round}
                questions={[question]}
                onDone={() => setRound((r) => r + 1)}
              />
            </div>
          </CurrentQuestionProvider>
        </NavPaperProvider>
      </ActiveModeProvider>
    </PreviewModeProvider>
  );
}
