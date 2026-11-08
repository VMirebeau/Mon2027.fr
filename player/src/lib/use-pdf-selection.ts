"use client";

/// État local de la sélection "PDF" sur l'écran Réviser (mobile + desktop).
/// Pas persisté : sélection jetable, fermée après l'export. Extrait dans son
/// propre hook pour partager la même mécanique entre `screens/review.tsx` et
/// `desktop/review-dt.tsx` sans dupliquer le state.

import { useCallback, useState } from "react";

export type PdfSelection = {
  selectMode: boolean;
  selected: Set<string>;
  enterSelectMode: () => void;
  exitSelectMode: () => void;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
};

export function usePdfSelection(): PdfSelection {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const enterSelectMode = useCallback(() => {
    setSelectMode(true);
    setSelected(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  return { selectMode, selected, enterSelectMode, exitSelectMode, toggle, selectAll, clear };
}
