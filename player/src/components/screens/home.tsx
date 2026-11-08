"use client";

import {
  DailyHero,
  HomeFooter,
  ModesGrid,
  SectionHead,
  SecondaryLinks,
  type ModesGridPick,
} from "../home-bits";
import { useHomeViewModel } from "@/lib/use-home-view-model";
import type { NavTarget, Question, Theme } from "@/lib/types";

/// Picks émis par la home. Le shell les traduit en transitions de scène
/// (cf. app-shell.tsx).
///
/// - `daily`             : joue la question du jour (mode play).
/// - `daily-review`      : ouvre la question du jour en mode consultation
///                         (variant review, CTA "Voir l'explication"). Aujourd'hui
///                         on retombe sur `daily` côté shell — pas de mode
///                         consult-only, mais on garde le pick distinct pour
///                         que le futur écran d'explication puisse s'y brancher
///                         sans changer la signature du composant.
/// - `discover`          : nouvelle architecture, route vers Thèmes pour l'instant.
/// - `review`            : nouvelle architecture, route vers Thèmes pour l'instant
///                         (le mode Réviser dédié arrivera dans un autre lot).
/// - `challenge-pending` : crée un défi à partir de la dernière partie jouée.
export type HomePick =
  | "daily"
  | "daily-review"
  | "discover"
  | "review"
  | "challenge-pending";

export type HomeProps = {
  onPick: (mode: HomePick) => void;
  onNavigate: (target: NavTarget) => void;
  themes: Theme[];
  totalQuestions: number;
  totalOrgs: number;
  dailyQuestion: Question | null;
  /// Catalogue publié : aligne le badge « à revoir » sur l'écran Réviser.
  questions?: Question[];
};

export function Home({
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
    dailyAnsweredToday,
    reviewCount,
  } = useHomeViewModel(dailyQuestion, questions);

  function handleHeroCta() {
    if (!dailyQuestion) return;
    onPick(heroState.variant === "review" ? "daily-review" : "daily");
  }

  function handleModePick(mode: ModesGridPick) {
    onPick(mode);
  }

  // Note : le HomeHeader (logo + UserMenu) est rendu une seule fois par
  // AppShell, persistant entre les scènes. Cf. SCENES_WITH_HOME_HEADER.
  void onNavigate;

  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      {/* 6px en haut : le .scroll rogne ce qui dépasse, et la carte du jour
          remonte de 2px au survol (bord + ombre coupés sous l'en-tête sinon). */}
      <div style={{ padding: "6px 16px 24px" }}>
        {dailyQuestion ? (
          <DailyHero
            question={dailyQuestion}
            variant={heroState.variant}
            answered={heroState.answered}
            onCta={handleHeroCta}
          />
        ) : (
          <DailyEmptyHero />
        )}

        <div style={{ marginTop: 22 }}>
          {/* `meta` retiré : le compteur "2 modes / 3 modes" ajoutait du bruit
              sans information utile — les cartes en-dessous comptent visuellement
              déjà à elles seules, et la transition 2→3 modes attirait l'œil
              vers un détail technique au lieu du contenu. */}
          {/* Pas « Commencer » : c'est déjà le libellé du bouton de
              l'onboarding, qui lance directement une partie. */}
          <SectionHead title={hasData ? "Continuer" : "Choisis ton mode"} />
          <ModesGrid
            hasData={hasData}
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
        />

        <SecondaryLinks onNavigate={onNavigate} />

        {/* Le streak du jour est silencieux dans la nouvelle home : on garde
            la donnée disponible côté footer via stats. Si la question du jour
            est jouée mais l'utilisateur revient plus tard, on ne réaffiche
            pas de bandeau séparé — variant `review` du hero suffit. */}
        {!hasData && !dailyAnsweredToday ? null : null}
      </div>
    </div>
  );
}

/// Variant du hero pour "pas de question du jour publiée". Garde la même
/// silhouette que la version pleine pour ne pas faire sauter la mise en
/// page lors d'un fetch tardif côté admin.
function DailyEmptyHero() {
  return (
    <div
      style={{
        background: "var(--cream-warm)",
        color: "var(--ink-soft)",
        borderRadius: 20,
        padding: "22px 22px 18px",
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
          marginBottom: 10,
        }}
      >
        Question du jour
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 16,
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
