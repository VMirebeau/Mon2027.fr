"use client";

/// Variante desktop de "Mon profil". Header éditorial cohérent avec les
/// autres pages DT, corps partagé via `ProfileBody` (cf. screens/profile.tsx).

import { AppFooter } from "./app-nav";
import { ProfileBody } from "../screens/profile";
import { useProgress } from "@/lib/use-progress";
import type { NavTarget, Question, Theme } from "@/lib/types";

export function ProfileDT({
  questions,
  themes,
  onNavigate,
}: {
  questions: Question[];
  themes: Theme[];
  onNavigate?: (target: NavTarget) => void;
}) {
  const { progress, hydrated } = useProgress();
  const pseudo = hydrated ? progress.identity.pseudo : null;
  return (
    <>
      <div className="dt-page">
        <div
          className="dt-content"
          style={{ paddingTop: 32, paddingBottom: 48 }}
        >
          <header style={{ maxWidth: 720, marginBottom: 12 }}>
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
              {pseudo ? `Portrait de ${pseudo}` : "Mon portrait"}
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
              Ta vision{" "}
              <span style={{ color: "var(--coral)" }}>de la France</span>.
            </h1>
            <p
              style={{
                marginTop: 20,
                fontSize: 18,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
                textWrap: "balance",
                maxWidth: 720,
              }}
            >
              Sur quoi tu vois clair, sur quoi tu te trompes, agrégé sur
              les questions que tu as jouées. Plus tu joues, plus ton
              portrait s&apos;affine.
            </p>
          </header>
          <ProfileBody
            questions={questions}
            themes={themes}
            variant="desktop"
            onNavigate={onNavigate}
          />
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}
