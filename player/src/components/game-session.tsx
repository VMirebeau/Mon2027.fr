"use client";

import { useEffect } from "react";
import { QuestionRunner } from "./question-runner";
import { useSetCurrentQuestion } from "./desktop/app-nav";
import { useGameState } from "@/lib/use-game-state";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { slugForQuestion } from "@/lib/question-slug";
import { usePreviewMode } from "@/lib/preview-mode";
import type { Answer, Question } from "@/lib/types";

/** Hôte stable de l'état de partie. Vit en dehors du branchement
 *  desktop/mobile d'AppShell : flipper le breakpoint ne change que le runner
 *  rendu (DT vs mobile), pas le state owner — donc idx/answers/phase/timers
 *  sont préservés au resize.
 *
 *  Ne rend PAS d'AppNav : le chrome est posé par le shell appelant
 *  (AppShell pour la home + scènes, QuestionPlayClient pour /q/[slug]),
 *  au-dessus de GameSession. GameSession se concentre sur l'état + le
 *  runner — séparation des responsabilités qui évite que l'AppNav
 *  démonte à chaque changement de scène. */
export function GameSession({
  questions,
  onDone,
  defi = false,
  initialIdx,
  initialAnswers,
  onProgress,
}: {
  questions: Question[];
  onDone: (answers: Answer[]) => void;
  /// Contexte création de défi : adapte la barre d'action du reveal (cf.
  /// QuestionRunner → RevealActionBar / DossierPanelMobile). Le bouton final
  /// devient « Partager le défi » et le partage par-question est masqué.
  defi?: boolean;
  /// Reprise de session (cf. lib/active-session) : index + réponses de départ.
  initialIdx?: number;
  initialAnswers?: Answer[];
  /// Notifié à chaque changement d'état persistable, pour la reprise après
  /// reload. Cf. AppShell.
  onProgress?: (idx: number, answers: Answer[]) => void;
}) {
  const state = useGameState({
    questions,
    onDone,
    initialIdx,
    initialAnswers,
    onProgress,
  });
  const isDesktop = useIsDesktop();

  // Pousse l'id de la question courante dans le contexte (consommé par
  // l'AppNav pour afficher le FavoriteToggle dans le header pendant le
  // jeu). Le provider est monté par AppShell au-dessus de l'AppNav (ou par
  // QuestionPlayClient pour la route standalone /q/[slug]) — d'où le
  // pattern push-via-hook plutôt que wrap. Si aucun provider n'est au-
  // dessus, le hook est un no-op silencieux.
  useSetCurrentQuestion(state.q?.id ?? null);

  // URL bar cosmétique : pendant le jeu, on reflète la question courante
  // dans la barre d'adresse via window.history.replaceState. C'est purement
  // visuel — Next.js router ne navigue pas. AppShell ne dérive plus sa
  // scène depuis useSearchParams (cf. AppShell refactor), donc ce change
  // d'URL ne déclenche pas de boucle. Le bénéfice : l'utilisateur peut
  // copier l'URL à tout moment pour partager LA question affichée.
  //
  // Dep stable sur state.q?.id (string) plutôt que state.q (référence qui
  // change à chaque render via mergeStats).
  //
  // Pas de cleanup à l'unmount : si la prochaine destination est une
  // navigation Next.js (router.push depuis un Link de l'AppNav, ou
  // pushScene depuis AppShell qui fait elle-même son pushState), elle
  // gère sa propre URL. Re-poser l'URL ici saboterait cette navigation.
  // Aperçu contributeur : l'adresse /apercu/<jeton> doit rester (un
  // rechargement rejoue l'aperçu ; /q/<slug> montrerait la version publiée,
  // ou une 404 pour un brouillon).
  const preview = usePreviewMode();
  const slug = state.q && !preview ? slugForQuestion(state.q) : null;
  useEffect(() => {
    if (typeof window === "undefined" || !slug) return;
    const next = `/q/${slug}`;
    if (window.location.pathname !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [slug]);

  // QuestionRunner gère mobile vs desktop en interne via useIsDesktop —
  // GameSession ne fait plus de switch ; on garde juste le wrap shell
  // mobile (app-shell > page) qui n'est pas dans le runner.
  if (isDesktop) {
    return <QuestionRunner state={state} defi={defi} />;
  }
  return (
    <div className="app-shell">
      <div className="page">
        <QuestionRunner state={state} defi={defi} />
      </div>
    </div>
  );
}
