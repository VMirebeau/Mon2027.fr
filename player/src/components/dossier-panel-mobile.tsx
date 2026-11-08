"use client";

/// Conteneur mobile du dossier : une feuille fixée en bas, AU-DESSUS de la
/// barre d'action (Terminer + Suivant), en trois états.
///
/// `peek` (au verdict) :
///   - une languette fine qui dit ce qu'il y a dedans (« Le chiffre en
///     détail · sources ») suivie du début du premier texte, tronqué ;
///   - la question et le verdict restent pleinement visibles au-dessus.
///
/// `half` (automatique à la phase `dossier`) :
///   - le panneau s'ouvre à mi-hauteur, SANS voile : le verdict reste visible
///     au-dessus (on le ramène en vue si le panneau allait le couvrir, cf.
///     lib/scroll-verdict) ; le corps défile dans le panneau.
///
/// `full` (tap sur la languette repliée) :
///   - ~70dvh, voile grisé + flou sur la zone question ; tap sur le voile ou
///     la languette → repli.
///
/// La languette ouverte (mi-hauteur ou pleine) se replie au tap. Dès que le
/// joueur a touché la languette, son choix prime sur l'ouverture automatique.
///
/// L'action bar (Terminer + Suivant) reste fixe en bas dans les trois états.
/// Mobile-only : sur desktop, le runner rend DossierPanel inline sous la
/// question.

import { useEffect, useState } from "react";
import { DossierPanel, DossierSections } from "./dossier-panel";
import { FavoriteToggle } from "./favorite-toggle";
import type { Question } from "@/lib/types";
import { phaseAtLeast, type RevealPhase } from "@/lib/reveal-phase";
import { dossierSummary } from "@/lib/dossier-summary";
import { useQuestionWithDossier } from "@/lib/use-question-dossier";
import { scrollVerdictIntoView } from "@/lib/scroll-verdict";
import { QuitConfirmModal } from "./quit-confirm-modal";

type SheetMode = "peek" | "half" | "full";

export function DossierPanelMobile({
  q,
  phase,
  onNext,
  onTerminate,
  isLast,
  total = 0,
  defi = false,
}: {
  q: Question;
  /// Phase du reveal : à `dossier`, le panneau s'ouvre seul à mi-hauteur.
  phase: RevealPhase;
  onNext: () => void;
  onTerminate: () => void;
  isLast: boolean;
  /// total === 1 + isLast (=== seule question) : le bouton final passe en
  /// "Découvrir" plutôt que "Voir le récap" (cf. note dans RevealActionBar).
  total?: number;
  /// Contexte création de défi : le bouton final devient « Partager le défi »
  /// (il mène à l'écran de création/partage du défi, pas à un récap).
  defi?: boolean;
}) {
  /// null = le joueur n'a pas encore touché la languette : l'état suit la
  /// phase (languette au verdict, mi-hauteur au dossier). Dérivé au rendu
  /// plutôt que synchronisé par un effet.
  const [userMode, setUserMode] = useState<SheetMode | null>(null);
  const autoMode: SheetMode = phaseAtLeast(phase, "dossier") ? "half" : "peek";
  const mode = userMode ?? autoMode;
  const open = mode !== "peek";
  /// « Terminer » est collé à « Suivant » : on passe par la confirmation
  /// « Quitter la partie ? » (même modale que la × du chrome) plutôt que de
  /// couper la partie sur un tap d'à-côté.
  const [quitOpen, setQuitOpen] = useState(false);
  // Languette : résumé tiré du dossier, chargé à part sur l'accueil.
  const summary = dossierSummary(useQuestionWithDossier(q).q);

  // Ouverture automatique à mi-hauteur : le panneau monte sur ~45 % de
  // l'écran. Si le verdict se retrouvait dessous, on le remonte en vue (les
  // marges de défilement suivent l'état du panneau, cf. globals.css).
  const autoHalf = userMode === null && mode === "half";
  useEffect(() => {
    if (!autoHalf) return;
    const raf = requestAnimationFrame(() => scrollVerdictIntoView());
    return () => cancelAnimationFrame(raf);
  }, [autoHalf]);

  return (
    <>
      {/* Voile derrière le panneau déplié en grand — couvre la zone question.
          Tap = repli. Pas de voile à mi-hauteur : le verdict doit rester
          lisible au-dessus. */}
      {mode === "full" ? (
        <button
          type="button"
          aria-label="Replier le dossier"
          className="dossier-overlay"
          onClick={() => setUserMode("peek")}
        />
      ) : null}

      {/* Panel : position fixed en bas, hauteur selon l'état. L'action bar
          est rendue séparément en dessous (toujours visible) pour ne pas être
          dans le scrollable. */}
      <div className={"dossier-mobile-panel " + mode}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="dossier-mobile-body"
          onClick={() => setUserMode(open ? "peek" : "full")}
          className="dossier-mobile-header"
        >
          <span className="dossier-mobile-header-text">
            <span className="dossier-tab">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                <rect x="1" y="2" width="8" height="6" rx="1" />
              </svg>
              <span className="dossier-tab-label">{summary.label}</span>
            </span>
            {summary.excerpt ? (
              <span className="dossier-mobile-excerpt">{summary.excerpt}</span>
            ) : null}
          </span>
          <span
            className={"dossier-mobile-chevron" + (open ? " up" : "")}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </span>
        </button>

        {/* Le contenu réel n'est rendu qu'une fois ouvert : pas la peine de
            mettre 300 lignes de DOM en place pendant la phase languette. */}
        {open ? (
          <div id="dossier-mobile-body" className="dossier-mobile-body">
            <DossierPanelBody q={q} />
          </div>
        ) : null}
      </div>

      {/* Action bar bas — toujours visible pendant la reveal.
          Sur la dernière question, "Suivant" devient "Voir le récap" qui fait
          exactement la même chose que "Terminer" (les deux appellent onDone
          avec les réponses courantes). On ne rend qu'un seul bouton plein
          largeur dans ce cas, pour ne pas dédoubler l'action. */}
      <div
        className={"dossier-action-bar" + (isLast ? " single" : "")}
      >
        {isLast ? null : (
          <button
            type="button"
            className="dossier-action-end"
            onClick={() => setQuitOpen(true)}
          >
            Terminer
          </button>
        )}
        <button
          type="button"
          className="dossier-action-next"
          onClick={onNext}
        >
          {isLast
            ? defi
              ? "Partager le défi"
              : total === 1
                ? "Continuer"
                : "Voir le récap"
            : "Suivant"}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <QuitConfirmModal
        open={quitOpen}
        onCancel={() => setQuitOpen(false)}
        onConfirm={() => {
          setQuitOpen(false);
          onTerminate();
        }}
      />
    </>
  );
}

/// Corps du dossier (sans la barre d'actions, déjà extraite dans l'action
/// bar) : favori + les mêmes sections que le bureau (DossierSections), dans
/// le même ordre.
function DossierPanelBody({ q }: { q: Question }) {
  return (
    <div className="dossier-mobile-body-inner">
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 6,
        }}
      >
        <FavoriteToggle questionId={q.id} size="md" />
      </div>

      <DossierSections q={q} />
    </div>
  );
}

/// Réexport du DossierPanel original pour les chemins desktop (RevealDT).
export { DossierPanel };
