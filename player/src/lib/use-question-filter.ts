"use client";

/// Hook générique : à partir d'une liste de questions, retourne :
/// - une liste filtrée par recherche texte + thèmes actifs (multi-select)
/// - les thèmes disponibles avec leur compteur (post-search)
/// - les setters et toggles
///
/// Utilisé par Réviser et Favoris pour la même UX (recherche + chips de thèmes).
/// La sélection de thèmes est en OR (un question matche si son thème est dans
/// le set actif). Sans thème actif, on n'applique pas de filtre thématique.

import { useMemo, useState } from "react";
import type { Question } from "@/lib/types";

export function useQuestionFilter(items: Question[]) {
  const [search, setSearch] = useState("");
  const [activeThemes, setActiveThemes] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return items.filter((q) => {
      if (text && !q.question.toLowerCase().includes(text)) return false;
      if (activeThemes.size > 0 && !activeThemes.has(q.theme)) return false;
      return true;
    });
  }, [items, search, activeThemes]);

  /// Liste de thèmes avec compteur post-recherche, pré-filtre thème.
  /// L'utilisateur voit "combien de questions par thème matchent ma recherche
  /// actuelle", indépendamment des thèmes déjà sélectionnés.
  const themesWithCounts = useMemo(() => {
    const text = search.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const q of items) {
      if (text && !q.question.toLowerCase().includes(text)) continue;
      counts.set(q.theme, (counts.get(q.theme) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count);
  }, [items, search]);

  function toggleTheme(theme: string) {
    setActiveThemes((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) next.delete(theme);
      else next.add(theme);
      return next;
    });
  }

  function clearThemes() {
    setActiveThemes(new Set());
  }

  return {
    filtered,
    search,
    setSearch,
    activeThemes,
    themesWithCounts,
    toggleTheme,
    clearThemes,
  };
}
