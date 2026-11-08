"use client";

import { useEffect, useRef, useState } from "react";

const EM_DASH = "\u2014";

/// Champs du formulaire dont le texte finit sous les yeux des joueurs, dans
/// l'ordre de la fiche. Sources et réponse attendue passent par des champs
/// cachés (JSON) que leurs éditeurs tiennent à jour.
const FIELDS: [name: string, label: string][] = [
  ["question", "Question"],
  ["precisions", "Précisions"],
  ["unite", "Unité"],
  ["payload", "Réponse attendue"],
  ["explication", "Explication"],
  ["miseEnPerspective", "Mise en perspective"],
  ["contextePedagogique", "Contexte pédagogique"],
  ["sourcesJson", "Sources"],
  ["sousTheme", "Sous-thème"],
];

function scan(form: HTMLFormElement): string[] {
  return FIELDS.filter(([name]) => {
    const el = form.elements.namedItem(name);
    return el && "value" in el && typeof el.value === "string" && el.value.includes(EM_DASH);
  }).map(([name]) => name);
}

/// Signale les tirets cadratins encore présents dans la fiche (règle
/// éditoriale du 2026-11-08 : aucun tiret cadratin dans les textes). Non bloquant ;
/// un clic mène au premier champ concerné. À placer dans le <form>.
export function EmDashNotice() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [found, setFound] = useState<string[]>([]);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      // Après le rendu : les éditeurs mettent leurs champs cachés à jour
      // juste après l'événement de saisie.
      timer = setTimeout(() => setFound(scan(form)), 150);
    };
    schedule();
    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    // Un champ caché modifié par React change son attribut value.
    const observer = new MutationObserver(schedule);
    observer.observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ["value"] });
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
      observer.disconnect();
    };
  }, []);

  function goToFirst() {
    const form = anchor.current?.closest("form");
    const el = found[0] ? form?.elements.namedItem(found[0]) : null;
    if (!(el instanceof HTMLElement)) return;
    const details = el.closest("details");
    if (details) details.open = true;
    if (el instanceof HTMLInputElement && el.type === "hidden") {
      (el.closest("section, fieldset") ?? el.parentElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
  }

  const labels = found.map((name) => FIELDS.find(([n]) => n === name)?.[1] ?? name);
  return (
    <span ref={anchor} className="contents">
      {labels.length > 0 && (
        <button
          type="button"
          onClick={goToFirst}
          className="inline-flex items-center gap-1.5 rounded-sm text-left text-amber-800 underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-amber-300"
          title="Aller au premier champ concerné"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
          Tiret cadratin « {EM_DASH} » dans : {labels.join(", ")}. Remplace-le par une virgule, un
          deux-points ou des parenthèses.
        </button>
      )}
    </span>
  );
}
