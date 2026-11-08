"use client";

import { EstimationQuestionScreen } from "./formats/question-estimation";
import { VraiFauxQuestionScreen } from "./formats/question-vraifaux";
import { AbQuestionScreen } from "./formats/question-ab";
import { QcmQuestionScreen } from "./formats/question-qcm";
import { ClassementQuestionScreen } from "./formats/question-classement";
import { VraiFauxMultiQuestionScreen } from "./formats/question-vraifaux-multi";
import { CurseurMultiQuestionScreen } from "./formats/question-curseur-multi";
import { CategorisationQuestionScreen } from "./formats/question-categorisation";
import { PondereQuestionScreen } from "./formats/question-pondere";
import { DossierPanelMobile } from "./dossier-panel-mobile";
import { DossierPanel } from "./dossier-panel";
import { useSetNavPaper } from "./desktop/app-nav";
import { AskTerminerLink, RevealActionBar } from "./formats/format-shared";
import { useIsDesktop } from "@/lib/use-is-desktop";
import {
  as01,
  asBoolean,
  asNumber,
  asRecordBoolean,
  asRecordNumber,
  asRecordString,
  asStringArray,
} from "@/lib/coerce-answer";
import type { Question } from "@/lib/types";
import type { GameState } from "@/lib/use-game-state";

/// Game runner unifié — un seul point d'entrée, branche mobile vs desktop
/// en interne via useIsDesktop. Avant on avait deux runners (mobile +
/// desktop) qui dispatchaient sur le format avec un switch quasi
/// identique ; la seule différence légitime est le scaffolding autour
/// (dt-page/dt-content + RevealActionBar/AskTerminerLink/DossierPanel
/// pour desktop, peek bar DossierPanelMobile pour mobile). Les formats
/// eux-mêmes gèrent leur propre mobile/desktop via le shell.
export function QuestionRunner({
  state,
  defi = false,
}: {
  state: GameState;
  /// Contexte création de défi : voir GameSession. Propagé à RevealActionBar
  /// (desktop) et DossierPanelMobile (mobile) pour adapter le bouton final.
  defi?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const {
    q,
    idx,
    total,
    accent,
    phase,
    isRevealing,
    isLast,
    answers,
    liveStats,
    draft,
    setDraft,
    submit,
    next,
    terminate,
  } = state;

  const locked = isRevealing ? answers[idx] : null;

  function renderQuestion(qq: Question) {
    // Props communes — `lockedAnswer` est ajouté ensuite avec narrower
    // spécifique au format. On passe TOUJOURS toutes les props standardisées
    // par FormatProps : un format qui n'en a pas l'usage les ignore.
    const base = {
      q: qq,
      index: idx,
      total,
      accent,
      onSubmit: submit,
      revealPhase: phase,
      // Suivant vit hors des formats : RevealActionBar (bureau) et la barre
      // fixe de DossierPanelMobile (mobile), rendues ici. Le shell n'a plus
      // de second bouton Suivant mobile (il restait caché sous la barre
      // fixe) ; la prop est conservée pour la surface FormatProps.
      onNext: isRevealing && !isDesktop ? next : undefined,
      isLast,
      onAbort: terminate,
      hasAnyAnswer: answers.some((a) => a !== null),
      /// `onTerminate` mobile-only : sur desktop, le Terminer vit dans
      /// RevealActionBar (reveal) ou AskTerminerLink (ask), tous deux
      /// rendus par ce runner sous la question. Mobile l'utilise dans
      /// la MobileCtaBar à côté de Valider — y compris sur la dernière
      /// question (= session à 1 question type Question du jour) pour
      /// offrir un échappatoire symétrique au × du chrome.
      onTerminate: !isDesktop && !isRevealing ? terminate : undefined,
      /// Push du brouillon dans GameState à chaque changement utilisateur.
      /// Le format passe ça à son setter local. `setDraft` est typé
      /// `(Answer) => void` ; par contravariance c'est assignable au
      /// `(A) => void` attendu par chaque format.
      onDraft: setDraft,
    };
    const k = qq.id;
    if (qq.format === "estimation")
      return (
        <EstimationQuestionScreen
          key={k}
          {...base}
          q={qq}
          lockedAnswer={asNumber(locked)}
          draft={asNumber(draft)}
          liveStats={liveStats}
        />
      );
    if (qq.format === "vraifaux")
      return <VraiFauxQuestionScreen key={k} {...base} q={qq} lockedAnswer={asBoolean(locked)} draft={asBoolean(draft)} />;
    if (qq.format === "ab")
      return <AbQuestionScreen key={k} {...base} q={qq} lockedAnswer={as01(locked)} draft={as01(draft)} />;
    if (qq.format === "qcm")
      return (
        <QcmQuestionScreen
          key={k}
          {...base}
          q={qq}
          lockedAnswer={asNumber(locked)}
          draft={asNumber(draft)}
          liveStats={liveStats}
        />
      );
    if (qq.format === "classement")
      return (
        <ClassementQuestionScreen
          key={k}
          {...base}
          q={qq}
          lockedAnswer={asStringArray(locked)}
          draft={asStringArray(draft)}
          liveStats={liveStats}
        />
      );
    if (qq.format === "vraifaux_multi")
      return (
        <VraiFauxMultiQuestionScreen
          key={k}
          {...base}
          q={qq}
          lockedAnswer={asRecordBoolean(locked)}
          draft={asRecordBoolean(draft)}
          liveStats={liveStats}
        />
      );
    if (qq.format === "curseur_multi")
      return (
        <CurseurMultiQuestionScreen
          key={k}
          {...base}
          q={qq}
          lockedAnswer={asRecordNumber(locked)}
          draft={asRecordNumber(draft)}
          liveStats={liveStats}
        />
      );
    if (qq.format === "categorisation")
      return (
        <CategorisationQuestionScreen
          key={k}
          {...base}
          q={qq}
          lockedAnswer={asRecordString(locked)}
          draft={asRecordString(draft)}
          liveStats={liveStats}
        />
      );
    // pondere
    return (
      <PondereQuestionScreen
        key={k}
        {...base}
        q={qq}
        lockedAnswer={asRecordNumber(locked)}
        draft={asRecordNumber(draft)}
        liveStats={liveStats}
      />
    );
  }

  if (isDesktop) {
    return (
      <>
        <NavPaperSync paper={phase === "dossier"} />
        <div
          className="dt-page dt-game-page"
          style={{
            background: phase === "dossier" ? "var(--paper)" : "var(--cream)",
            transition: "background 0.6s ease 0.2s",
          }}
        >
          <div className="dt-content">
            <div key={`q-${idx}`}>{renderQuestion(q)}</div>

            {/* Phase ASK : Terminer link-style aligné sur la même colonne
                centrale, même CSS que le Terminer du reveal pour cohérence
                visuelle. Caché sur isLast (Valider termine déjà la session).
                En reveal, plus rien entre le verdict et le dossier : la barre
                d'action vient APRÈS le dossier (ci-dessous). */}
            {!isRevealing && !isLast ? (
              <div className="dt-focus dt-focus-actions">
                <div
                  className="dt-focus-center"
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    paddingTop: 4,
                  }}
                >
                  <AskTerminerLink
                    onTerminate={terminate}
                    skipConfirm={!answers.some((a) => a !== null)}
                  />
                </div>
              </div>
            ) : null}

            {phase === "dossier" ? <DossierPanel q={q} /> : null}

            {/* Action bar du reveal (Terminer / Partager / Suivant), rendue
                UNE seule fois ici plutôt que dans chaque format, APRÈS le
                dossier : entre le verdict et le dossier, elle invitait à
                partir sans lire. Collante en bas de la fenêtre
                (.dt-reveal-actions) tant que le dossier défile, pour rester
                trouvable ; elle se pose sous le dossier en fin de page.
                Montée avec le dossier (phase `dossier`) : plus tôt, elle
                apparaissait sous le verdict puis sautait sous le dossier au
                moment où il se dépliait. Wrapper dt-focus pour l'aligner sur
                la colonne de la question. */}
            {phase === "dossier" ? (
              <div className="dt-focus dt-focus-actions dt-reveal-actions">
                <div className="dt-focus-center">
                  <RevealActionBar
                    q={q}
                    onNext={next}
                    onTerminate={isLast ? undefined : terminate}
                    isLast={isLast}
                    total={total}
                    revealPhase={phase}
                    defi={defi}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  // Mobile : dès le début du reveal, on monte la languette du dossier en bas
  // de l'écran (animation slide-up CSS, cf. `.dossier-mobile-panel`) : le
  // verdict ET la languette apparaissent ensemble, ce qui se lit comme un
  // seul événement "tu as fini". À la phase `dossier`, le panneau s'ouvre
  // seul à mi-hauteur (cf. DossierPanelMobile).
  return (
    <div className="question-stage">
      <div key={`q-${idx}`}>{renderQuestion(q)}</div>
      {isRevealing ? (
        <DossierPanelMobile
          q={q}
          phase={phase}
          onNext={next}
          onTerminate={terminate}
          isLast={isLast}
          total={total}
          defi={defi}
        />
      ) : null}
    </div>
  );
}

/// Composant utilitaire : pousse l'état "paper" dans NavPaperContext via le
/// hook useSetNavPaper. Le séparer évite que tout le runner re-render à
/// chaque flip ask/dossier — le sync vit dans un sous-composant qui n'a
/// que cette responsabilité.
function NavPaperSync({ paper }: { paper: boolean }) {
  useSetNavPaper(paper);
  return null;
}
