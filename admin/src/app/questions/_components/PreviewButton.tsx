"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createQuestionPreview } from "@/lib/preview-actions";

/// Comme `new FormData(form)`, mais avec les champs désactivés : en lecture
/// seule (question publiée ouverte par un contributeur), la fiche est dans un
/// <fieldset disabled>, et FormData les ignore — l'aperçu partait vide.
function collectFormData(form: HTMLFormElement): FormData {
  const fd = new FormData();
  for (const el of Array.from(form.elements)) {
    if (
      !(el instanceof HTMLInputElement) &&
      !(el instanceof HTMLTextAreaElement) &&
      !(el instanceof HTMLSelectElement)
    ) {
      continue;
    }
    if (!el.name) continue;
    if (el instanceof HTMLInputElement) {
      if (["file", "submit", "button", "reset", "image"].includes(el.type)) continue;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
    }
    if (el instanceof HTMLSelectElement && el.multiple) {
      for (const o of Array.from(el.selectedOptions)) fd.append(el.name, o.value);
      continue;
    }
    fd.append(el.name, el.value);
  }
  return fd;
}

/// « Prévisualiser » : joue la question telle qu'elle est dans le formulaire
/// (même non enregistrée), dans un nouvel onglet, avec l'interface réelle du
/// player. À placer À L'INTÉRIEUR du <form> de la question : le bouton lit
/// le formulaire qui l'englobe.
export function PreviewButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    if (!form) return;
    setError(null);
    setBusy(true);
    // L'onglet est ouvert tout de suite, pendant le clic : ouvert après
    // l'attente du serveur, le navigateur le bloquerait comme une popup.
    const win = window.open("about:blank", "_blank");
    try {
      const res = await createQuestionPreview(collectFormData(form));
      if (res.ok) {
        if (win) {
          win.opener = null;
          win.location.href = res.url;
        } else {
          window.open(res.url, "_blank", "noopener");
        }
      } else {
        win?.close();
        setError(res.error);
      }
    } catch {
      win?.close();
      setError("Aperçu impossible pour le moment. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="outline" onClick={onClick} disabled={busy}>
        <Eye className="mr-1 h-4 w-4" aria-hidden />
        {busy ? "Préparation…" : "Prévisualiser"}
      </Button>
      {error ? (
        <span role="alert" className="max-w-xs text-right text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
