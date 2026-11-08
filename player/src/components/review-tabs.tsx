"use client";

import type { Question } from "@/lib/types";

/// Onglets de l'écran Réviser : "à retravailler / réussites / tout".
/// Mutualisé entre la version mobile et desktop ; le param `large` règle
/// le sizing (padding, font-size) et le layout (overflow horizontal mobile
/// vs wrap multi-ligne desktop).
export type ReviewTab = "todo" | "done" | "all";

export type ReviewBuckets = {
  todo: Question[];
  done: Question[];
  all: Question[];
};

export function ReviewTabs({
  tab,
  setTab,
  buckets,
  large = false,
}: {
  tab: ReviewTab;
  setTab: (t: ReviewTab) => void;
  buckets: ReviewBuckets;
  large?: boolean;
}) {
  // Label "À revoir" plutôt qu'"À refaire" : depuis le passage en répétition
  // espacée, le bucket todo agrège (1) les fautes et (2) les bonnes réponses
  // dont l'intervalle d'oubli est dépassé. "Refaire" suggère "fauté",
  // "Revoir" décrit mieux ce qu'on demande au joueur (rafraîchir, pas
  // forcément corriger).
  // « Programmées » plutôt qu'« Ancrées » : le bucket done contient les bonnes
  // réponses dont la prochaine révision est planifiée (1, 3, 7, 21 jours…).
  // Une seule bonne réponse ne fait pas une question « ancrée », et le mot
  // laissait croire que les erreurs y figuraient aussi.
  const items: Array<{ id: ReviewTab; label: string; count: number }> = [
    { id: "todo", label: large ? "À revoir maintenant" : "À revoir", count: buckets.todo.length },
    { id: "done", label: "Programmées", count: buckets.done.length },
    { id: "all", label: "Tout", count: buckets.all.length },
  ];
  return (
    <div
      role="tablist"
      className={large ? undefined : "hide-scrollbar"}
      style={
        large
          ? {
              marginTop: 40,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }
          : {
              marginTop: 16,
              display: "flex",
              gap: 6,
              overflowX: "auto",
              paddingBottom: 4,
              // Padding latéral pour éviter que le premier/dernier tab
              // soient collés/coupés quand on a scrollé.
              paddingLeft: 2,
              paddingRight: 16,
              marginLeft: -2,
              marginRight: -16,
            }
      }
    >
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setTab(it.id)}
            suppressHydrationWarning
            className={`pill${active ? " pill--active" : ""}`}
            style={{
              flexShrink: large ? undefined : 0,
              padding: large ? "10px 18px" : "8px 14px",
              color: active ? "var(--cream-warm)" : "var(--ink)",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: large ? 14 : 13,
            }}
          >
            {it.label}
            <span
              suppressHydrationWarning
              style={{
                marginLeft: large ? 8 : 6,
                fontFamily: "var(--font-mono)",
                fontSize: large ? 12 : 11,
                fontWeight: 500,
                color: active ? "var(--yellow)" : "var(--ink-mute)",
              }}
            >
              {it.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
