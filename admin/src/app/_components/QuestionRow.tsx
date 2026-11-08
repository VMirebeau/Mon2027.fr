"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

/// Éléments de la ligne qui gardent leur propre clic (suppression…).
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button'], [role='dialog']";

/// Ligne de la liste des questions : un clic n'importe où l'ouvre. Le lien
/// posé sur le texte de la question (marqué `data-row-link`) reste l'accès
/// clavier (Tab puis Entrée) et sert pour l'ouverture dans un nouvel onglet.
/// Rien ne s'ouvre sur un clic dans un autre élément interactif de la ligne
/// ni à la fin d'une sélection de texte.
export function QuestionRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  const open = (e: MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as Element;
    // Clic dans un portail (fenêtre de confirmation de suppression) :
    // l'événement React remonte jusqu'ici sans que la cible soit dans la ligne.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
      // Adresse complète (avec le basePath de prod) : celle du lien.
      const link = e.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]");
      if (link) window.open(link.href, "_blank", "noopener");
      return;
    }
    router.push(href);
  };

  return (
    <TableRow
      onClick={open}
      onAuxClick={(e) => {
        if (e.button === 1) open(e);
      }}
      className="cursor-pointer focus-within:bg-muted/50"
    >
      {children}
    </TableRow>
  );
}
