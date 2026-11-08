"use client";

import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/use-client-only";
import { useDialogFocus } from "./use-dialog-focus";

export type ModalSize = "sm" | "md" | "lg";

/// Durée de l'animation de sortie (cf. `app-modal-*-out` dans globals.css) :
/// la modale reste montée ce temps-là après `open` → false.
const EXIT_MS = 160;

/// Fige le contenu pendant l'animation de sortie. Les consommateurs vident
/// souvent leur état à la fermeture (`pendingDelete` → null, formulaire
/// remis à zéro après « Merci ! ») : sans ce gel, la carte afficherait son
/// contenu vide ou l'écran précédent pendant qu'elle disparaît. Tant que
/// `open` est faux, memo considère les props inchangées et garde le dernier
/// rendu.
const FrozenWhileClosing = memo(
  function FrozenWhileClosing({ children }: { open: boolean; children: React.ReactNode }) {
    return <>{children}</>;
  },
  (_prev, next) => !next.open,
);

/// Modal générique réutilisable. Gère :
///   - le rendu en portail vers document.body (cf. plus bas)
///   - le backdrop semi-transparent et le clic-outside pour fermer
///   - les transitions : fondu de l'overlay, « pop » de la carte à
///     l'ouverture, sortie brève avec contenu figé (cf. EXIT_MS)
///   - la touche Escape
///   - le scroll lock du body tant qu'elle est ouverte
///   - le focus : entrée dans la modale, piège Tab/Maj+Tab, retour à
///     l'élément d'origine à la fermeture (cf. use-dialog-focus.ts)
///   - le clavier mobile : le backdrop suit le viewport visuel, la carte
///     défile en interne et le champ actif reste visible
///   - le reset de `white-space` (la modal peut être rendue à
///     l'intérieur d'un parent qui a `nowrap`, par ex. la nav desktop)
///   - une scrollbar customisée pour le contenu débordant
///   - un bouton de fermeture (X) discret en haut à droite
///
/// L'enfant `children` est le contenu *à l'intérieur* de la carte ;
/// la modal s'occupe du conteneur. Pour des bordures / sections plus
/// élaborées, le consommateur peut ajouter ses propres divs dans
/// `children`.
export function Modal({
  open,
  onClose,
  ariaLabel,
  size = "md",
  showClose = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  size?: ModalSize;
  showClose?: boolean;
  children: React.ReactNode;
}) {
  // Portail vers document.body, uniquement une fois hydraté (pas de
  // document côté serveur). Rendue dans l'arbre courant, la modale héritait
  // des ancêtres : ouverte depuis le dossier mobile (`.dossier-mobile-panel`,
  // transform + overflow:hidden), elle restait coincée dedans — titre et ×
  // coupés, bouton d'envoi sous la barre fixe, seul le dossier assombri en
  // bureau, et la police serif du dossier déteignait. Même motif que
  // l'IndicatorDetailModal du Portrait.
  const mounted = useHydrated();
  const visible = open && mounted;
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, visible);

  // Animation de sortie : `present` reste vrai EXIT_MS après la fermeture,
  // le temps que l'overlay et la carte s'effacent (data-state="closing").
  // Passage à vrai calé pendant le rendu (pas d'effet en cascade) ; une
  // réouverture en cours de sortie annule le minuteur et rejoue l'entrée.
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const closing = present && !open;
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setPresent(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  // Lock scroll du body tant que la modal est affichée — sortie comprise,
  // sinon la barre de défilement revient et la page saute sous l'overlay
  // qui s'efface.
  useEffect(() => {
    if (!present) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [present]);

  // Fermeture sur Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Clavier virtuel mobile : ni iOS ni Chrome Android ne redimensionnent le
  // viewport de mise en page quand le clavier sort — un backdrop `fixed`
  // plein écran garde alors sa carte centrée derrière le clavier. On cale le
  // backdrop sur le viewport VISUEL (variables CSS lues par
  // .app-modal-backdrop / .app-modal dans globals.css) et on ramène le champ
  // focalisé dans la zone visible.
  useEffect(() => {
    if (!visible) return;
    const vv = window.visualViewport;
    const el = backdropRef.current;
    if (!vv || !el) return;
    const apply = () => {
      el.style.setProperty("--app-vv-height", `${vv.height}px`);
      el.style.setProperty("--app-vv-top", `${vv.offsetTop}px`);
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        el.contains(active) &&
        active.matches("input, textarea, select")
      ) {
        active.scrollIntoView({ block: "nearest" });
      }
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [visible]);

  // L'event `click` fire sur l'ancêtre commun de mousedown et mouseup.
  // Si un utilisateur commence à sélectionner du texte dans la modal
  // puis relâche en dehors, on aurait fermé la modal — pas le bon
  // comportement. On track donc où le press a commencé : la modal ne
  // se ferme que si le press *et* le release sont tous deux sur le
  // backdrop lui-même.
  const pressStartedOnBackdrop = useRef(false);

  if (!mounted || !present) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="app-modal-backdrop"
      data-state={closing ? "closing" : "open"}
      // Pendant la sortie : plus cliquable ni focalisable, et retirée de
      // l'arbre d'accessibilité — un double clic ne la rouvre pas.
      inert={closing}
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          pressStartedOnBackdrop.current &&
          e.target === e.currentTarget
        ) {
          onClose();
        }
        pressStartedOnBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        className={"app-modal app-modal-" + size}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        // Cible de focus de repli quand aucun enfant n'est marqué
        // data-autofocus : le lecteur d'écran annonce le dialogue, Tab mène
        // au premier contrôle.
        tabIndex={-1}
      >
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            className="app-modal-close"
            aria-label="Fermer"
          >
            ×
          </button>
        ) : null}
        <FrozenWhileClosing open={open}>{children}</FrozenWhileClosing>
      </div>
    </div>,
    document.body,
  );
}
