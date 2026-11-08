"use client";

/// "Cette session a enrichi ton profil" — bloc affiché sur le recap après
/// une session de jeu. Montre concrètement l'impact des questions jouées
/// sur les 9 indicateurs du portrait civique + CTA vers Mon profil.
///
/// Pourquoi : la valeur du système d'indicateurs est invisible si on ne la
/// surface que dans la page Profile. En la montrant DANS LE MOMENT où le
/// user vient de répondre (recap), on crée un lien causal direct entre
/// "je joue" et "mon profil évolue" — c'est ce qui donne envie d'aller
/// voir le radar et de continuer à jouer.

import { useMemo } from "react";
import { ArrowRight, Compass } from "lucide-react";
import type { AnsweredItem } from "@/lib/recap-helpers";
import { INDICATORS, type IndicatorId } from "@/lib/indicators";
import type { NavTarget } from "@/lib/types";

export function ProfileImpactBlock({
  items,
  variant = "mobile",
  onNavigate,
}: {
  items: AnsweredItem[];
  variant?: "mobile" | "desktop";
  /// Nav vers la scène Profile au clic. Passé par Recap qui le tient
  /// d'AppShell. On évite router.push("/?s=profile") car AppShell ne
  /// re-lit pas searchParams après le mount initial — donc l'URL change
  /// mais la scène pas. Le pattern `navTo` interne d'AppShell est le seul
  /// chemin fiable pour changer de scène intra-app.
  onNavigate?: (target: NavTarget) => void;
}) {
  // Compte les questions de cette session qui touchent chaque indicateur.
  // Une question peut peser sur plusieurs indicateurs simultanément
  // (ex. "mal-logés" touche precarite + logement) — on compte chaque
  // contribution séparément, c'est la même logique que computeIndicatorBiases.
  const touched = useMemo<Array<{ id: IndicatorId; count: number }>>(() => {
    const acc = new Map<IndicatorId, number>();
    for (const item of items) {
      const indicators = item.q.indicators;
      if (!indicators?.length) continue;
      for (const { id } of indicators) {
        acc.set(id, (acc.get(id) ?? 0) + 1);
      }
    }
    return Array.from(acc.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  // Si aucune question de la session n'est taguée (rare mais possible —
  // composites non taggués, questions techniques sans polarité), on ne
  // rend rien. Mieux que d'afficher un bloc vide.
  if (touched.length === 0) return null;

  const totalIndices = touched.reduce((s, t) => s + t.count, 0);

  return (
    <div
      style={{
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 16,
        padding: variant === "desktop" ? "20px 22px" : "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Compass size={13} strokeWidth={2.2} aria-hidden />
        Ton portrait s&apos;enrichit
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: variant === "desktop" ? 18 : 17,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          lineHeight: 1.3,
          textWrap: "balance",
        }}
      >
        Cette session a ajouté{" "}
        <span style={{ color: "var(--coral)" }}>
          {totalIndices} indice{totalIndices > 1 ? "s" : ""}
        </span>{" "}
        à ton portrait, sur {touched.length} dimension
        {touched.length > 1 ? "s" : ""}.
      </div>
      {/* Liste compacte des indicateurs touchés. Pas de jauge ici (c'est sur
          Profile) — juste un chip-list pour donner une idée de l'étendue. */}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {touched.map(({ id, count }) => (
          <li
            key={id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 11px",
              background: "var(--paper)",
              border: "1px solid var(--rule-soft)",
              borderRadius: 999,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 500,
              color: "var(--ink)",
              letterSpacing: "0.02em",
              lineHeight: 1.1,
            }}
          >
            <span style={{ textTransform: "uppercase", fontWeight: 600 }}>
              {INDICATORS[id].label}
            </span>
            <span style={{ color: "var(--ink-mute)" }}>
              +{count}
            </span>
          </li>
        ))}
      </ul>
      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate("profile")}
          style={{
            alignSelf: "flex-start",
            marginTop: 4,
            background: "var(--ink)",
            color: "var(--cream-warm)",
            border: "1.5px solid var(--ink)",
            borderRadius: 999,
            padding: "9px 16px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          Voir mon portrait
          <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
