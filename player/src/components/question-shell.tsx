"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { QuestionChrome } from "./ui-bits";
import { QuestionBar } from "./desktop/question-rails";
import {
  PrecisionsDisclosure,
  MobileCtaBar,
} from "./formats/format-shared";
import { VerdictAnnouncer } from "./verdict-announcer";
import { ThemeIllustration } from "./theme-illustration";
import { themeMeta } from "@/lib/theme-colors";
import type { Answer, Question } from "@/lib/types";
import type { RevealPhase } from "@/lib/reveal-phase";
import { phaseAtLeast } from "@/lib/reveal-phase";
import { scrollVerdictIntoView } from "@/lib/scroll-verdict";

/// Scaffold partagé par tous les écrans de question — factorise le chrome
/// (top bar / rails desktop), le titre `display`, le popover Définition et
/// la barre de CTA bas (Valider / Suivant / Voir le récap / Terminer).
///
/// Choisit en interne mobile vs desktop via `useIsDesktop`. Chaque format
/// (estimation, ab, qcm, classement…) ne s'occupe plus que de son corps
/// spécifique (slider, grille de cartes, drag-and-drop, etc.) qu'il passe
/// en `children` — l'aspect "habillage" est mutualisé.
///
/// Le scaffold ne rend PAS l'action bar de la phase reveal (Terminer /
/// Partager / Suivant) : en bureau elle vit au niveau du runner
/// (`RevealActionBar`), en mobile dans la barre fixe du dossier
/// (`DossierPanelMobile`). L'ancien bouton « Question suivante » mobile du
/// scaffold doublonnait cette barre et restait caché dessous.
///
/// Accessibilité : l'énoncé est le `<h1>` de l'écran (tabIndex -1) et reçoit
/// le focus à chaque nouvelle question — sans ça, après « Question
/// suivante » le focus retombait sur <body> (le bouton cliqué est démonté) et
/// le lecteur d'écran restait muet. Le titre du document suit la progression.
/// Le VerdictAnnouncer (région live) est rendu en mobile ET en bureau.
export function QuestionShell({
  q,
  index,
  total,
  accent,
  phase,
  lockedAnswer,
  validateLabel,
  canSubmit,
  onSubmit,
  onAbort,
  onTerminate,
  hasAnyAnswer,
  title,
  children,
}: {
  q: Question;
  index: number;
  total: number;
  accent: string;
  phase: RevealPhase;
  /// Conservé pour compatibilité (les formats le transmettent) : le libellé
  /// « Voir le récap » est désormais porté par la barre d'action du reveal.
  isLast: boolean;
  /// Réponse verrouillée par le runner ; null = pas encore répondu. Utilisé
  /// par le scaffold pour le skipConfirm de la × en mode single-question
  /// ET passé au VerdictAnnouncer (a11y) en phase reveal.
  lockedAnswer: Answer;
  /// Libellé du bouton Valider en phase ask (ex. "Valider mon estimation").
  validateLabel: string;
  canSubmit: boolean;
  onSubmit: () => void;
  onAbort?: () => void;
  onTerminate?: () => void;
  /// Conservé pour compatibilité avec les formats (qui le transmettent tous)
  /// mais plus utilisé : la navigation reveal vit hors du scaffold (cf. en-tête).
  onNext?: () => void;
  /// Calculé par le runner depuis `answers.some(a => a !== null)`. Quand
  /// `false`, la × du chrome ferme directement sans modal de
  /// confirmation : il n'y a rien à perdre. Couple avec AppShell.onDone
  /// qui route vers la home (pas le récap) quand 0 réponse.
  hasAnyAnswer?: boolean;
  /// Override du titre. Par défaut, le scaffold rend `q.question` brut.
  /// Vrai/Faux passe `« q.question »` ici pour signaler une assertion
  /// plutôt qu'une question ouverte. Évite d'ajouter du wording
  /// format-specific dans le shell ou de polluer la data.
  title?: ReactNode;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const themeId = themeMeta(q.theme)?.id;
  const isRevealing = phase !== "ask";
  const showVerdict = phaseAtLeast(phase, "verdict");
  const hasAnswered = lockedAnswer !== null;
  /// Modal de confirmation skippée dans deux cas :
  ///   - one-shot déjà répondu (tout est révélé, rien à protéger)
  ///   - aucune réponse de session (il n'y a rien à confirmer)
  const skipConfirm =
    (total === 1 && hasAnswered) || hasAnyAnswer === false;

  const titleRef = useRef<HTMLHeadingElement>(null);
  // Nouvelle question (le runner remonte le format par `q.id`) : focus sur
  // l'énoncé + titre du document. preventScroll : le défilement est géré
  // ailleurs (scène / runner), on ne veut pas de saut. Une question isolée
  // (lien /q/…, total 1) garde le titre posé par la page.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    if (total > 1) {
      document.title = `Question ${index + 1} sur ${total} · Mon2027`;
    }
  }, [q.id, index, total]);

  // Révélation : si le verdict (élément `data-verdict`) est hors de l'écran
  // — formats longs où l'on a défilé jusqu'à Valider, pastille sous les
  // barres fixes du mobile —, on le ramène en vue, en douceur (instantané
  // si « Réduire les animations »). Rien ne bouge s'il est déjà visible.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showVerdict) return;
    const raf = requestAnimationFrame(() => scrollVerdictIntoView(rootRef.current));
    return () => cancelAnimationFrame(raf);
  }, [showVerdict, q.id]);

  if (isDesktop) {
    // Le runner desktop (`QuestionRunnerDT`) enveloppe lui-même avec
    // `.dt-page > .dt-content` — on rend juste la barre de question et le
    // `.dt-focus` (une colonne centrée, sans rails latéraux) ici.
    return (
      <>
        <QuestionBar q={q} index={index} total={total} accent={accent} />
        <div className="dt-focus">
        <div ref={rootRef} className="dt-focus-center">
          <VerdictAnnouncer q={q} answer={lockedAnswer} showVerdict={showVerdict} />
          <div className="dt-question-head">
            <h1 ref={titleRef} tabIndex={-1} className="dt-question" style={{ margin: 0 }}>
              {title ?? q.question}
            </h1>
            {themeId ? (
              <ThemeIllustration themeId={themeId} size={120} className="theme-art dt-question-art" />
            ) : null}
          </div>
          <PrecisionsDisclosure text={q.precisions} />
          {children}
          {!isRevealing ? (
            <div className="dt-submit-wrap">
              <button
                className="dt-btn-primary"
                disabled={!canSubmit}
                onClick={onSubmit}
              >
                {validateLabel}
                <ChevronRight />
              </button>
            </div>
          ) : null}
          {/* Phase reveal desktop : pas d'action bar ici. Le runner desktop
              rend RevealActionBar (Terminer / Partager / Suivant) sous tout
              le contenu, une seule fois par question. */}
        </div>
        </div>
      </>
    );
  }

  // Mobile
  return (
    <div ref={rootRef} className="scroll scroll--col" style={{ background: "var(--cream)" }}>
      <VerdictAnnouncer q={q} answer={lockedAnswer} showVerdict={showVerdict} />
      <QuestionChrome
        theme={q.theme}
        difficulte={q.difficulte}
        index={index}
        total={total}
        accent={accent}
        onAbort={onAbort}
        skipConfirm={skipConfirm}
      />

      <h1
        ref={titleRef}
        tabIndex={-1}
        className="display pop-in"
        style={{
          margin: 0,
          padding: "18px 24px 4px",
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.12,
          letterSpacing: "-0.02em",
          textWrap: "balance",
        }}
      >
        {title ?? q.question}
      </h1>

      <div style={{ padding: "0 24px" }}>
        <PrecisionsDisclosure text={q.precisions} />
      </div>

      {children}

      <div style={{ flex: 1, minHeight: 24 }} />

      {!isRevealing ? (
        <MobileCtaBar onTerminate={onTerminate} skipConfirm={hasAnyAnswer === false}>
          <button
            className="btn-primary"
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {validateLabel}
            <ChevronRight />
          </button>
        </MobileCtaBar>
      ) : (
        // Reveal : Suivant / Terminer vivent dans la barre fixe du dossier
        // (DossierPanelMobile : barre d'action + languette du dossier, ou
        // demi-panneau une fois le dossier ouvert). Cette réserve garde la fin
        // du contenu (verdict, toggle communauté, détail) défilable au-dessus
        // d'elles au lieu d'être masquée. Hauteur en CSS
        // (.reveal-bottom-reserve) : elle suit l'état du panneau.
        <div aria-hidden className="reveal-bottom-reserve" />
      )}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="m6 3 5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
