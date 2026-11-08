"use client";

import type { Question } from "@/lib/types";
import { hasText } from "@/lib/dossier-summary";
import { useQuestionWithDossier } from "@/lib/use-question-dossier";
import { SuggestionTrigger } from "./suggestion-modal";

/// Réexport historique : la variante mobile importait `hasText` d'ici.
export { hasText };

/** Le « dossier documenté » — section qui se déplie sous la zone du verdict
 *  une fois que le joueur a soumis sa réponse (bureau). La variante mobile
 *  (dossier-panel-mobile.tsx) rend les mêmes sections via `DossierSections`.
 *  Le composant n'est monté qu'à la phase `dossier` par le runner ; l'entrée
 *  est portée par une animation CSS qui joue automatiquement au mount, ce qui
 *  évite de réserver de l'espace vide dans la page pendant que le joueur
 *  réfléchit à la question. */
export function DossierPanel({ q }: { q: Question }) {
  return (
    <div className="dossier-panel">
      <div className="dossier-tab">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <rect x="1" y="2" width="8" height="6" rx="1" />
        </svg>
        Dossier · {q.theme}
      </div>
      {/* L'étoile favori vit maintenant dans le header (AppNav), aux côtés
          du bouton compte — toujours accessible pendant le jeu sans avoir
          à scroller jusqu'au dossier. */}

      <DossierSections q={q} />

      {/* Plus de rangée d'actions ici : Terminer / Partager / Suivant vivent
          dans `<RevealActionBar>` (cf. format-shared.tsx), rendue une seule
          fois par le runner, juste APRÈS ce dossier (collante en bas de la
          fenêtre tant qu'il défile). */}
    </div>
  );
}

/// Sections du dossier, partagées bureau / mobile, dans l'ordre de lecture :
///   1. « Le chiffre, en détail » (q.explain) — ce que le joueur vient de
///      voir, expliqué : la suite naturelle du verdict ;
///   2. la section contexte (q.why) — bloc isolé, cf. DossierContexteSection ;
///   3. « Mise en perspective » ;
///   4. les sources (+ signalement).
/// Une section dont le texte est vide n'est pas rendue : un titre suivi de
/// rien se lisait comme un bug (questions en cours de rédaction).
export function DossierSections({ q: raw }: { q: Question }) {
  // Sur l'accueil, les questions arrivent sans dossier (page allégée) : il
  // est chargé à part, en général bien avant la réponse (cf.
  // lib/use-question-dossier.ts). Ailleurs, l'objet est déjà complet.
  const { q, status, retry } = useQuestionWithDossier(raw);
  return (
    <>
      {status === "loading" ? (
        <p className="dossier-status" role="status">
          Chargement du dossier…
        </p>
      ) : status === "error" ? (
        <p className="dossier-status" role="status">
          Le dossier n&apos;a pas pu être chargé (connexion ?).{" "}
          <button type="button" className="dossier-status-retry" onClick={retry}>
            Réessayer
          </button>
        </p>
      ) : null}
      <DossierExplainSection q={q} />
      <DossierContexteSection q={q} />
      <DossierPerspectiveSection q={q} />
      <DossierSourcesSection q={q} />
    </>
  );
}

function DossierExplainSection({ q }: { q: Question }) {
  if (!hasText(q.explain)) return null;
  return (
    <section className="dossier-section">
      <h3>
        Le chiffre, en détail <span className="badge">Données</span>
      </h3>
      {/* Section de tête : plus en gris atténué (`muted`), elle se lit en
          premier. */}
      <p>{q.explain}</p>
    </section>
  );
}

/// Section contexte — DÉCISION ÉDITORIALE EN ATTENTE : son sort (garder,
/// renommer, fusionner, supprimer) est traité à part. Titre et champ (q.why)
/// inchangés, bloc volontairement isolé pour pouvoir y toucher seul ; seule
/// sa position a changé (après « Le chiffre, en détail »).
function DossierContexteSection({ q }: { q: Question }) {
  if (!hasText(q.why)) return null;
  return (
    <section className="dossier-section">
      <h3>
        Du contexte pour mieux comprendre <span className="badge">Contexte</span>
      </h3>
      <p>{q.why}</p>
    </section>
  );
}

function DossierPerspectiveSection({ q }: { q: Question }) {
  if (!hasText(q.miseEnPerspective)) return null;
  return (
    <section className="dossier-section dossier-perspective">
      <h3>
        Mise en perspective <span className="badge">Repères</span>
      </h3>
      <p>{q.miseEnPerspective}</p>
    </section>
  );
}

/// Sans source, pas de « Sources · Vérifiables » au-dessus d'une liste vide
/// (promesse non tenue) : seul le lien de signalement reste.
function DossierSourcesSection({ q }: { q: Question }) {
  return (
    <section className="dossier-section">
      {q.sources.length > 0 ? (
        <h3>
          Sources <span className="badge">Vérifiables</span>
        </h3>
      ) : null}
      {q.sources.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="dossier-source"
        >
          <div className="dossier-source-inner">
            <div className="dossier-source-text">
              <div className="dossier-source-tag">{s.tag}</div>
              <div className="dossier-source-name">{s.name}</div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 14 14"
              fill="none"
              className="dossier-source-arrow"
            >
              <path
                d="M5 3h6v6M11 3 4 10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </a>
      ))}
      <SuggestionTrigger target={{ id: q.id, question: q.question }} />
    </section>
  );
}
