"use client";

/// Hook générique : pagine une liste en mémoire et expose un sentinel ref
/// à poser en fin de liste. Quand le sentinel entre dans la viewport (avec
/// un rootMargin généreux pour pre-fetch), on charge la page suivante.
///
/// Reset le compteur à chaque changement de référence `items` (utile quand
/// un filtre amont change la liste).
///
/// Pas de virtualisation — on rend tous les DOM nodes accumulés. Adapté à
/// quelques centaines d'items, pas à plusieurs milliers.

import { useEffect, useRef, useState } from "react";

export const DEFAULT_PAGE_SIZE = 30;

export function useInfiniteList<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [count, setCount] = useState(pageSize);
  // Garde la dernière référence d'items dans le state lui-même : pattern
  // documenté React 19 « Adjusting some state when a prop changes »
  // (react.dev/learn/you-might-not-need-an-effect). On évite la cascade
  // car setCount n'est appelé qu'à la transition de référence.
  const [lastItems, setLastItems] = useState(items);
  if (lastItems !== items) {
    setLastItems(items);
    setCount(pageSize);
  }
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    if (count >= items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + pageSize, items.length));
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [count, items.length, pageSize]);

  return {
    visible: items.slice(0, count),
    sentinelRef,
    hasMore: count < items.length,
    shownCount: Math.min(count, items.length),
  };
}
