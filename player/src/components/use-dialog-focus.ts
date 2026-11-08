"use client";

/// Gestion du focus d'un dialogue modal (WAI-ARIA « dialog (modal) ») :
///   - à l'ouverture, le focus entre dans le dialogue : sur l'élément marqué
///     `data-autofocus` s'il existe (ex. « Continuer la partie », l'action
///     sûre), sinon sur le conteneur lui-même (qui doit porter tabIndex={-1}).
///     Si un enfant s'est déjà focalisé (autoFocus d'un champ), on ne le
///     déloge pas ;
///   - piège du focus : Tab / Maj+Tab bouclent sur les éléments focalisables
///     du dialogue au lieu de filer dans la page masquée derrière ;
///   - à la fermeture, le focus revient à l'élément qui avait ouvert le
///     dialogue (s'il est encore dans le document — une fermeture qui change
///     de scène le démonte, et c'est alors la scène qui place le focus).
///
/// Partagé par `Modal` (components/modal.tsx) et les dialogues maison
/// (IndicatorDetailModal du Portrait) pour un comportement identique.

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // getClientRects vide = display:none / hors rendu (pot à miel caché,
    // section repliée…) : pas une cible de tabulation réelle.
    (el) => el.getClientRects().length > 0 && el.getAttribute("aria-hidden") !== "true",
  );
}

export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    // L'élément déclencheur a encore le focus à ce stade (le rendu ne le
    // déplace pas) — sauf autoFocus d'un champ du dialogue, auquel cas il
    // n'y a pas de déclencheur connu et on ne restaure rien.
    const opener =
      document.activeElement instanceof HTMLElement &&
      !root.contains(document.activeElement)
        ? document.activeElement
        : null;
    if (!root.contains(document.activeElement)) {
      const target =
        root.querySelector<HTMLElement>("[data-autofocus]") ?? root;
      target.focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const node = ref.current;
      if (!node) return;
      const items = focusablesIn(node);
      if (items.length === 0) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!node.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && (current === first || current === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
