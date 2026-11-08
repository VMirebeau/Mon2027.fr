"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { SceneId } from "@/lib/types";

/** Sections used by the dev panel.
 *  Reflète l'état réel des composants joueur : 3 formats classiques + 5
 *  composite formats + écrans hors-jeu (recap, défi, kit). Chaque scene
 *  format instancie le vrai runner avec une seule question — donc le reveal
 *  in-place (DossierPanel) qu'on voit en dev est exactement celui du jeu. */
const SECTIONS: { heading: string; items: { id: SceneId; label: string }[] }[] =
  [
    {
      heading: "Boucle de jeu",
      items: [
        { id: "onboarding", label: "Onboarding" },
        { id: "home", label: "Accueil" },
        { id: "game", label: "Partie (5 questions)" },
        { id: "recap", label: "Récap" },
        { id: "challenge", label: "Défi async" },
      ],
    },
    {
      heading: "Formats classiques",
      items: [
        { id: "q-estim", label: "Estimation numérique" },
        { id: "q-tf", label: "Vrai / Faux" },
        { id: "q-ab", label: "A / B comparatif" },
        { id: "q-qcm", label: "QCM (N choix)" },
      ],
    },
    {
      heading: "Nouveaux formats composite",
      items: [
        { id: "q-classement", label: "Classement (drag)" },
        { id: "q-vftf-multi", label: "V/F multiple" },
        { id: "q-curseur-multi", label: "Curseur multi-points" },
        { id: "q-cat", label: "Catégorisation (drag)" },
        { id: "q-pondere", label: "Pondéré 100 pts" },
      ],
    },
    {
      heading: "Pages annexes",
      items: [
        { id: "themes", label: "Thèmes" },
        { id: "methode", label: "Méthode" },
        { id: "apropos", label: "À propos" },
      ],
    },
  ];

export function SceneNav({
  scene,
  onScene,
}: {
  scene: SceneId;
  onScene: (s: SceneId) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 1000,
          background: "rgba(20,17,14,0.92)",
          color: "#FAF8F3",
          borderRadius: 10,
          padding: "6px 10px",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.04em",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        dev
        <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
      </button>
    );
  }
  return (
    <div className="scene-nav">
      <div
        className="title"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span>Dev · catalogue</span>
        <button
          onClick={() => setOpen(false)}
          style={{ padding: "0 6px", fontSize: 12, opacity: 0.7 }}
        >
          ×
        </button>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.heading} style={{ marginTop: 8 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.5,
              padding: "4px 4px 2px",
            }}
          >
            {section.heading}
          </div>
          {section.items.map((s) => (
            <button
              key={s.id}
              onClick={() => onScene(s.id)}
              className={scene === s.id ? "active" : ""}
            >
              {s.label}
            </button>
          ))}
        </div>
      ))}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.1)",
          marginTop: 8,
          paddingTop: 6,
          fontSize: 10,
          opacity: 0.5,
          padding: "8px 4px 0",
          lineHeight: 1.45,
        }}
      >
        Viewport auto via <code>useIsDesktop</code>. Les nouveaux formats
        utilisent les questions Q-TST-* (brouillons) si pas de version
        publiée disponible.
      </div>
    </div>
  );
}
