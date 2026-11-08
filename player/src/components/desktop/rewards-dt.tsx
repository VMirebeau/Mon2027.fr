"use client";

/// Page "Mes récompenses" desktop. Header éditorial + corps identique à
/// la version mobile (cf. screens/rewards), avec un layout plus aéré.

import { AppFooter } from "./app-nav";
import { RewardsBody } from "../screens/rewards";
import { useAuth } from "@/lib/use-auth";
import type { NavTarget, Question, Theme } from "@/lib/types";

export function RewardsDT({
  questions,
  themes,
  onNavigate,
}: {
  questions: Question[];
  themes: Theme[];
  onNavigate?: (target: NavTarget) => void;
}) {
  const { user, ready } = useAuth();
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
              Mes récompenses · Niveau · Badges
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
              {ready && user ? (
                <>
                  Ton parcours, en{" "}
                  <span style={{ color: "var(--coral)" }}>récompenses</span>.
                </>
              ) : (
                <>
                  Apprendre,{" "}
                  <span style={{ color: "var(--coral)" }}>récompensé</span>.
                </>
              )}
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
              Chaque question répondue compte. Débloque des badges en explorant
              les thèmes, en jouant régulièrement, ou en partageant l&apos;app
              autour de toi.
            </p>
          </header>

          <div style={{ maxWidth: 920 }}>
            <RewardsBody
              questions={questions}
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
