"use client";

import {
  DailyHero,
  HomeFooter,
  ModesGrid,
  SectionHead,
  type ModesGridPick,
} from "../home-bits";
import { AppFooter } from "./app-nav";
import { useHomeViewModel } from "@/lib/use-home-view-model";
import type { HomePick, HomeProps } from "../screens/home";

/// Home desktop. L'AppNav est rendue par AppShell (persistante), pas par la
/// scène elle-même : ainsi le motion.span de l'underline glisse proprement
/// entre items au lieu de réjouer une animation d'apparition à chaque
/// changement de scène. La home se contente du body + AppFooter
/// (Méthode/À propos).
export function HomeDT({
  onPick,
  onNavigate,
  totalQuestions,
  dailyQuestion,
  questions,
}: HomeProps) {
  const {
    answered,
    correctPct,
    streak,
    hasData,
    heroState,
    reviewCount,
  } = useHomeViewModel(dailyQuestion, questions);

  function handleHeroCta() {
    if (!dailyQuestion) return;
    const pick: HomePick =
      heroState.variant === "review" ? "daily-review" : "daily";
    onPick(pick);
  }

  function handleModePick(mode: ModesGridPick) {
    onPick(mode);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          padding: "32px 32px 16px",
          maxWidth: 1180,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {dailyQuestion ? (
          <DailyHero
            question={dailyQuestion}
            variant={heroState.variant}
            answered={heroState.answered}
            onCta={handleHeroCta}
            large
          />
        ) : (
          <DailyEmptyHeroDT />
        )}

        <div style={{ marginTop: 40 }}>
          {/* `meta` retiré : compteur "2 modes / 3 modes" ajoutait du bruit
              sans valeur ; les cartes parlent d'elles-mêmes. */}
          <SectionHead
            title={hasData ? "Continuer" : "Choisis ton mode"}
            large
          />
          <ModesGrid
            hasData={hasData}
            large
            totalQuestions={totalQuestions}
            reviewCount={reviewCount}
            onPick={handleModePick}
          />
        </div>

        <HomeFooter
          hasData={hasData}
          stats={
            hasData
              ? {
                  answered,
                  correctPct,
                  streak,
                }
              : null
          }
          large
        />
      </div>

      <AppFooter onNavigate={onNavigate} />
    </div>
  );
}

function DailyEmptyHeroDT() {
  return (
    <div
      style={{
        background: "var(--cream-warm)",
        color: "var(--ink-soft)",
        borderRadius: 28,
        padding: "30px 36px",
        border: "1.5px dashed var(--rule)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: "var(--ink-mute)",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Question du jour
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 22,
          lineHeight: 1.4,
          color: "var(--ink-soft)",
        }}
      >
        Pas de question publiée pour aujourd&apos;hui.
        <br />
        Reviens un peu plus tard.
      </div>
    </div>
  );
}
