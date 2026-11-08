"use client";

/// Radar des 9 biais de perception du portrait civique.
///
/// Géométrie & sémantique (refonte 2026-05-22) :
///   - 9 axes répartis sur 360°, premier à 12h (-90°), sens horaire
///   - Le CERCLE MÉDIAN (50% du rayon) représente la RÉALITÉ — donc
///     "tu vois juste". Il est rendu en stroke marqué (plus visible que
///     les anneaux secondaires) pour servir de référence.
///   - Le polygone user passe AU-DESSUS du cercle réalité quand il
///     surestime, AU-DESSOUS quand il sous-estime. Lecture immédiate :
///     les BOSSES (vers l'extérieur) = surestimations, les CREUX
///     (vers le centre) = sous-estimations.
///   - Si community fournie : 2nd polygone en pointillés.
///   - Axes sans assez d'indices : le sommet est posé pile sur le cercle
///     réalité (= absence de signal), rendu en marker transparent.
///
/// Mapping mathématique :
///   normalizedRadius(score) = (score + 1) / 2
///   → score = -1 (forte sous-estime) → rayon 0 (centre)
///   → score =  0 (juste)             → rayon 0.5 (cercle réalité)
///   → score = +1 (forte sur-estime)  → rayon 1 (bord)
///
/// Volontairement implémenté en SVG pur, pas de lib — 9 axes en O(9),
/// rendu sub-ms.

import { useState } from "react";
import type { IndicatorBiasRow } from "@/lib/progress-stats";

// viewBox généreux pour donner de la place aux labels qui débordent
// du cercle (ex. "DÉMOCRATIE", "INÉGALITÉS"). Le SVG est responsive
// via maxWidth: 100% sur le wrapper, donc la taille en px ne dicte
// que le ratio.
const SIZE = 360;
const CENTER = SIZE / 2;
const MAX_RADIUS = 110;       // rayon "bord" = surestimation max
const REAL_RADIUS_RATIO = 0.5; // cercle de la réalité = milieu
const LABEL_RADIUS = MAX_RADIUS + 40; // marge confortable pour les labels

/// Position du n-ième axe sur 9, premier en haut (12h), horaire.
function axisAngle(i: number, total: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / total;
}

function pointOnAxis(i: number, total: number, normalizedRadius: number) {
  const a = axisAngle(i, total);
  const r = MAX_RADIUS * Math.max(0, Math.min(1, normalizedRadius));
  return { x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r };
}

/// Convertit un signedScore [-1, +1] en rayon normalisé [0, 1] :
/// -1 (sous-estime max) = centre, 0 (juste) = milieu, +1 (sur-estime) = bord.
function radiusFromScore(score: number): number {
  return (Math.max(-1, Math.min(1, score)) + 1) / 2;
}

export function IndicatorRadar({
  biases,
  community,
  minSamples = 3,
}: {
  biases: IndicatorBiasRow[];
  community?: IndicatorBiasRow[];
  minSamples?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const n = biases.length;
  if (n === 0) return null;

  // Points du polygone user. Axes sans data → posés sur le cercle réalité
  // (rayon 0.5) pour que le polygone ne fasse pas d'aberration.
  const userPoints = biases.map((b, i) => {
    const enough = b.count >= minSamples;
    const r = enough ? radiusFromScore(b.signedScore) : REAL_RADIUS_RATIO;
    return { ...pointOnAxis(i, n, r), bias: b, enough };
  });

  const communityPoints =
    community?.length === n
      ? community.map((b, i) => {
          const enough = b.count >= minSamples;
          const r = enough ? radiusFromScore(b.signedScore) : REAL_RADIUS_RATIO;
          return pointOnAxis(i, n, r);
        })
      : null;

  const userPath =
    "M " +
    userPoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") +
    " Z";
  const communityPath = communityPoints
    ? "M " +
      communityPoints
        .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" L ") +
      " Z"
    : null;

  const hovered = hoverIdx !== null ? userPoints[hoverIdx] : null;

  return (
    <div style={{ position: "relative", width: "100%" }}>
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      // Pas de width/height intrinsèques : on laisse CSS dicter la taille
      // via le parent. width: 100% fait grossir jusqu'à remplir le conteneur,
      // height: auto préserve le ratio carré du viewBox.
      style={{ display: "block", width: "100%", height: "auto" }}
      role="img"
      aria-label="Radar des biais de perception sur 9 dimensions"
    >
      {/* Anneaux secondaires (25%, 75%) en très discret — repères mais
          pas le focus visuel principal. */}
      {[0.25, 0.75].map((r) => (
        <circle
          key={r}
          cx={CENTER}
          cy={CENTER}
          r={MAX_RADIUS * r}
          fill="none"
          stroke="rgba(0,0,0,0.05)"
          strokeWidth={1}
        />
      ))}
      {/* Cercle de la RÉALITÉ : à 50% du rayon, marqué (plus visible).
          C'est la référence — le polygone user passe au-dessus ou
          en-dessous selon qu'il sur/sous-estime. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={MAX_RADIUS * REAL_RADIUS_RATIO}
        fill="none"
        stroke="rgba(0,0,0,0.22)"
        strokeWidth={1.5}
      />
      {/* Cercle extérieur (1.0) — bord max */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={MAX_RADIUS}
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={1}
      />
      {/* Axes radiaux */}
      {biases.map((_, i) => {
        const end = pointOnAxis(i, n, 1);
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={end.x}
            y2={end.y}
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={1}
          />
        );
      })}
      {/* Petite étiquette "réalité" sur l'anneau référence — au point en
          haut (au-dessus de PRÉCARITÉ), légèrement décalé vers l'intérieur. */}
      <text
        x={CENTER}
        y={CENTER - MAX_RADIUS * REAL_RADIUS_RATIO - 4}
        textAnchor="middle"
        style={{
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          // ink-mute plutôt qu'un noir à 40 % (≈ 2,8:1 sur le fond).
          fill: "var(--ink-mute)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        réalité
      </text>
      {/* Polygone communauté (si fourni) en pointillés */}
      {communityPath ? (
        <path
          d={communityPath}
          fill="none"
          stroke="var(--ink-mute)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      ) : null}
      {/* Polygone user — coral plein, déformé par rapport au cercle réalité.
          Bosses vers l'extérieur = surestimes, creux vers le centre = sous-
          estimes. C'est la signature visuelle du portrait. */}
      <path
        d={userPath}
        fill="var(--coral)"
        fillOpacity={0.2}
        stroke="var(--coral)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Points sur chaque sommet — petits si enough, transparents sinon.
          Chaque point a une cible de hit élargie (r=14, transparente) pour
          déclencher le popover au survol/focus clavier — la cible visible
          reste petite mais le hover est tolérant. */}
      {userPoints.map((p, i) => {
        const isHover = hoverIdx === i;
        return (
          <g key={i}>
            {/* Halo affiché uniquement au hover/focus — confirme visuellement
                quel sommet est concerné par le popover. */}
            {isHover ? (
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill={p.enough ? "var(--coral)" : "rgba(0,0,0,0.25)"}
                opacity={0.25}
                pointerEvents="none"
              />
            ) : null}
            <circle
              cx={p.x}
              cy={p.y}
              r={isHover ? (p.enough ? 6 : 5) : p.enough ? 4 : 3}
              fill={p.enough ? "var(--coral)" : "rgba(0,0,0,0.18)"}
              stroke="var(--paper)"
              strokeWidth={p.enough ? 1.5 : 0}
              style={{ transition: "r 0.15s ease-out" }}
              pointerEvents="none"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={14}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={tooltipMessage(p.bias, minSamples)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
              style={{ cursor: "pointer", outline: "none" }}
            />
          </g>
        );
      })}
      {/* Labels à l'extrémité de chaque axe */}
      {biases.map((b, i) => {
        const pt = pointOnAxis(i, n, LABEL_RADIUS / MAX_RADIUS);
        // Anchor selon la position angulaire pour éviter le débordement
        const a = axisAngle(i, n);
        const cos = Math.cos(a);
        const anchor: "start" | "middle" | "end" =
          Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <text
            key={b.id}
            x={pt.x}
            y={pt.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fill: b.count >= minSamples ? "var(--ink)" : "var(--ink-mute)",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {b.label}
          </text>
        );
      })}
    </svg>
    {hovered ? (
      <div
        role="tooltip"
        style={{
          position: "absolute",
          // Coords du point converties en % du viewBox (le SVG est carré
          // et responsive, donc % = position visuelle correcte).
          left: `${(hovered.x / SIZE) * 100}%`,
          top: `${(hovered.y / SIZE) * 100}%`,
          // Décalage selon le quadrant pour que le popover ne sorte pas
          // du cadre : à droite si le point est à gauche, en bas si en haut.
          transform: `translate(${hovered.x < CENTER ? "-100%" : "0"}, ${hovered.y < CENTER ? "8px" : "calc(-100% - 8px)"})`,
          marginLeft: hovered.x < CENTER ? -8 : 8,
          maxWidth: 220,
          padding: "8px 10px",
          background: "var(--paper)",
          border: "1px solid rgba(0,0,0,0.15)",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: "var(--ink)",
          lineHeight: 1.4,
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {tooltipMessage(hovered.bias, minSamples)}
      </div>
    ) : null}
    </div>
  );
}

/// Compose le message du popover à partir de la qualitative + subjectShort.
/// "forte_sur/sur" → tu surestimes, "sous/forte_sous" → tu sous-estimes,
/// "juste" → tu vois juste. Si count < minSamples : message "pas assez
/// d'indices" pour ne pas induire en erreur sur un signal trop bruité.
function tooltipMessage(b: IndicatorBiasRow, minSamples: number): string {
  if (b.count < minSamples) {
    return `${b.label} : pas assez d'indices pour l'instant (${b.count}/${minSamples})`;
  }
  const phrases: Record<IndicatorBiasRow["qualitative"], string> = {
    forte_sur: `Tu surestimes fortement ${b.subjectShort}`,
    sur: `Tu surestimes ${b.subjectShort}`,
    juste: `Tu vois juste sur ${b.subjectShort}`,
    sous: `Tu sous-estimes ${b.subjectShort}`,
    forte_sous: `Tu sous-estimes fortement ${b.subjectShort}`,
  };
  return `${phrases[b.qualitative]} (${b.count} indices)`;
}
