"use client";

/// Flow de création d'un défi — A1 (source) → A2 (thème) → JEU réel → Partage.
///
/// Architecture :
/// - A1 et A2 : wizard local (state interne à ce composant).
/// - JEU : DÉLÉGUÉ à AppShell. Quand A2 est validée, on appelle `onStartGame`
///   qui bascule la scène sur "game" et fait jouer les 5 questions à
///   l'utilisateur via le GameSession standard (reveals in-place).
/// - PARTAGE : reprend la main au retour de la scène game, via `gameResult`
///   qui contient les questions et les réponses réelles du militant. POST le
///   défi puis affiche short code + actions de partage.
///
/// Le code des 4 étapes vit dans `defi-create/` (un fichier par étape) pour
/// rester sous 400 lignes par fichier. Ce module n'orchestre que la machine
/// d'état du wizard + le routing entre étapes.

import { useState } from "react";
import { AppHeader } from "../ui-bits";
import { HomeHeader } from "../home/header";
import { pickRandomByLevel } from "@/lib/pick-random";
import type { NavTarget, Question, Theme } from "@/lib/types";
import { StepA1Body } from "./defi-create/step-a1";
import { StepA2Body } from "./defi-create/step-a2";
import { StepA2bisBody } from "./defi-create/step-a2bis";
import {
  StepShareBody,
  type DefiCreateGameResult,
} from "./defi-create/step-share";
import type { Source } from "./defi-create/shared";

type Step = "a1" | "a2" | "a2bis" | "share";

// Re-exports pour préserver l'API publique (le main file expose le payload
// gameResult que l'AppShell consomme).
export type { DefiCreateGameResult } from "./defi-create/step-share";

export type DefiCreateProps = {
  questions: Question[];
  themes: Theme[];
  /** Retour à la home, abandonne la création en cours. */
  onHome: () => void;
  /** Bascule sur le scene game pour faire jouer le militant. AppShell prend
   *  la main, et nous remonte avec `gameResult` une fois le jeu terminé. */
  onStartGame: (
    source: Source,
    themeId: string | null,
    picked: Question[],
  ) => void;
  /** Résultat du jeu : non-null une fois que l'utilisateur a joué ses 5 questions
   *  et qu'on est de retour sur le scene challenge. Si non-null, on saute le
   *  wizard et on affiche directement l'étape de partage. */
  gameResult: DefiCreateGameResult | null;
  /** Notifie l'AppShell qu'on a fini (defi posté ou abandonné). AppShell
   *  remet alors le contexte `defiInProgress` à null. */
  onSent: () => void;
  /** Pour le rendu desktop : si true, on n'enveloppe pas dans `.scroll`
   *  absolu (le parent DT gère son propre layout). */
  bare?: boolean;
  /** Active le layout desktop : pleine largeur, hero header, grilles
   *  horizontales pour SourceRadio et ThemeTile, CTA inline non-sticky. */
  large?: boolean;
  /** Force l'étape d'entrée du wizard. Utilisé quand on arrive de la page
   *  Favoris ("Défier sur mes favoris") : on saute A1 pour atterrir direct
   *  sur A2bis avec la sélection multi des favoris. "a2" sert au retour après
   *  abandon de la modal d'intro (on revient direct au choix du thème). Si
   *  `gameResult` est fourni en parallèle, c'est lui qui gagne (post-jeu →
   *  share). */
  startAt?: "a1" | "a2" | "a2bis";
  /** Branche UserMenu du HomeHeader, utilisé sur l'étape d'entrée (a1). */
  onNavigate?: (target: NavTarget) => void;
  /** Niveau gamification du créateur (1..10). Sert de proxy au niveau de
   *  l'ami destinataire — imparfait mais c'est la seule info dispo au moment
   *  du tirage. Permet de pondérer la difficulté pour éviter de servir des
   *  questions trop dures à un créateur niveau débutant. */
  levelRank: number;
};

export function DefiCreate({
  questions,
  themes,
  onHome,
  onStartGame,
  gameResult,
  onSent,
  bare = false,
  large = false,
  startAt,
  onNavigate,
  levelRank,
}: DefiCreateProps) {
  // Si on revient du jeu → share. Sinon, on utilise startAt (entrée
  // depuis Favoris saute à a2bis), ou a1 par défaut.
  const [step, setStep] = useState<Step>(
    gameResult ? "share" : (startAt ?? "a1"),
  );
  // Snapshot du dernier gameResult non-null. Au POST du défi, StepShareBody
  // appelle `onSent()` → l'AppShell remet `defiInProgress` à null, ce qui fait
  // retomber le prop `gameResult` à null dès le re-render suivant. Sans ce
  // figement, l'étape share se démonterait en plein écran de partage (la
  // condition `step === "share" && gameResult` deviendrait fausse) → page
  // blanche. On garde donc le résultat tant que cette instance est montée ;
  // un nouveau flow de défi remonte le composant et repart à vide.
  // (État ajusté pendant le rendu quand le prop change — motif React
  // recommandé, plutôt qu'une ref lue au rendu.)
  const [lastGameResult, setLastGameResult] = useState<DefiCreateGameResult | null>(gameResult);
  if (gameResult && gameResult !== lastGameResult) setLastGameResult(gameResult);
  const shareGameResult = gameResult ?? lastGameResult;
  // Source captée pour transmettre à `onStartGame` quand on lance la partie.
  // Si on entre direct sur a2bis (depuis Favoris), la source est forcément
  // "favoris" ; sinon défaut "theme" (la branche la plus commune).
  const [source, setSource] = useState<Source>(
    startAt === "a2bis" ? "favoris" : "theme",
  );

  /// Click direct sur une carte source → met à jour le source et avance vers
  /// l'étape de sélection adéquate (a2 pour thème, a2bis pour favoris).
  function pickSource(s: Source) {
    setSource(s);
    setStep(s === "favoris" ? "a2bis" : "a2");
  }

  /// Click direct sur un thème → tirage des 5 questions et lancement du jeu.
  /// AppShell prend la main, DefiCreate sera remonté avec gameResult.
  function pickTheme(themeId: string) {
    const theme = themes.find((t) => t.id === themeId);
    if (!theme || theme.count < 5) return;
    const subset = questions.filter((q) => q.theme === theme.label);
    if (subset.length < 5) return;
    // Pas de tracking "seen" ici : le créateur va lui-même jouer ces 5
    // questions, donc on ignore l'historique (tout traité comme non-vu).
    const picked = pickRandomByLevel(
      subset,
      5,
      () => false,
      (q) => q.difficulte ?? 3,
      levelRank,
    );
    onStartGame(source, themeId, picked);
  }

  /// Validation A2bis : reçoit les questions sélectionnées (1-10) et lance
  /// le jeu sans themeId (source=favoris).
  function pickFavorites(picked: Question[]) {
    if (picked.length < 1) return;
    onStartGame("favoris", null, picked);
  }

  function handleBack() {
    if (step === "a1") return onHome();
    if (step === "a2" || step === "a2bis") return setStep("a1");
    onSent();
    onHome();
  }

  // Titre / back arrow : utilisés UNIQUEMENT en mobile. En desktop, l'AppNav
  // global suffit pour signifier où on est et permettre de quitter ; pas
  // besoin d'un sous-header avec back pill qui détonnerait avec les autres
  // pages desktop (Themes, Méthode, etc. n'ont pas de back).
  const title =
    step === "a1"
      ? "Défier un proche"
      : step === "a2"
        ? "Choisir un thème"
        : step === "a2bis"
          ? "Choisir parmi tes favoris"
          : "Ton défi est prêt";

  const inner = (
    <>
      {!large ? (
        step === "a1" ? (
          <HomeHeader onNavigate={onNavigate} />
        ) : (
          <AppHeader title={title} onBack={handleBack} />
        )
      ) : null}

      {step === "a1" ? (
        <StepA1Body
          large={large}
          onPickSource={pickSource}
          themes={themes}
          onNavigate={onNavigate}
        />
      ) : null}

      {step === "a2" ? (
        <StepA2Body
          large={large}
          themes={themes}
          onPickTheme={pickTheme}
          onBackToSource={large ? () => setStep("a1") : undefined}
        />
      ) : null}

      {step === "a2bis" ? (
        <StepA2bisBody
          large={large}
          publishedQuestions={questions}
          onPickFavorites={pickFavorites}
          onBackToSource={large ? () => setStep("a1") : undefined}
        />
      ) : null}

      {step === "share" && shareGameResult ? (
        <StepShareBody
          large={large}
          gameResult={shareGameResult}
          onSent={onSent}
          onHome={onHome}
        />
      ) : null}
    </>
  );

  if (bare) {
    return <>{inner}</>;
  }

  return (
    <div
      className="scroll"
      style={{ background: "var(--cream)", display: "flex", flexDirection: "column" }}
    >
      {inner}
    </div>
  );
}
