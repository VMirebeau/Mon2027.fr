"use client";

/// Pièces partagées entre MyDefisList (défis envoyés) et ReceivedDefisList
/// (défis reçus). Les deux listes partagent : le wrapper section/header/grid,
/// le bouton "Voir plus →", la mini-KPI compacte, et l'icône poubelle en coin
/// de carte. Le contenu interne des cartes diffère (KPIs spécifiques au
/// rôle), donc on factorise uniquement la chrome — pas le détail de carte.

import type React from "react";
import { TrashIcon } from "./icons";

/// Wrapper visuel d'une section de liste de défis. Header avec eyebrow mono
/// (subtitle) + titre principal display, puis grille rendue via children,
/// puis bouton "Voir plus →" si onSeeMore fourni.
export function DefiListSection({
  subtitle,
  title,
  large,
  children,
  remainingCount,
  onSeeMore,
}: {
  /// Eyebrow mono uppercase ("Défis envoyés", "Défis reçus").
  subtitle: string;
  /// Titre display ("N envoyé·s · M réponses", "N joué·s").
  title: React.ReactNode;
  /// Layout desktop : grille horizontale au lieu de pile verticale.
  large?: boolean;
  /// Cartes à rendre dans la grille — laissées à l'appelant car le contenu
  /// (rôle envoyé/reçu) diffère, mais le conteneur partage le même style.
  children: React.ReactNode;
  /// Nombre d'items au-delà du cap. Si > 0 ET onSeeMore défini, rend le
  /// bouton "Voir les N autres →".
  remainingCount: number;
  onSeeMore?: () => void;
}) {
  const hasMore = remainingCount > 0 && !!onSeeMore;
  return (
    <section
      style={{
        marginBottom: large ? 32 : 20,
        padding: large ? "20px 22px" : "16px 16px 18px",
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: large ? 20 : 16,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: large ? 14 : 10,
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
            }}
          >
            {subtitle}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: large ? 22 : 18,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {title}
          </div>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: large
            ? "repeat(auto-fill, minmax(280px, 1fr))"
            : "1fr",
          gap: large ? 12 : 10,
        }}
      >
        {children}
      </div>

      {hasMore ? (
        <button
          type="button"
          onClick={onSeeMore}
          className="mono"
          style={{
            marginTop: 12,
            background: "transparent",
            border: 0,
            padding: "6px 0",
            color: "var(--ink-soft)",
            fontSize: 11.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--ink-soft)";
          }}
        >
          Voir les {remainingCount} autres →
        </button>
      ) : null}
    </section>
  );
}

/// Bouton poubelle absolute top-right d'une carte défi. Stoppe la propagation
/// pour ne pas déclencher la navigation du <Link> parent.
export function CardTrashButton({
  ariaLabel,
  onActivate,
}: {
  ariaLabel: string;
  /// Appelé sur clic ou Enter/Espace. preventDefault/stopPropagation sont
  /// déjà gérés ici — l'appelant n'a qu'à effectuer son action métier.
  onActivate: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onActivate();
        }
      }}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 26,
        height: 26,
        display: "grid",
        placeItems: "center",
        borderRadius: 8,
        color: "var(--ink-mute)",
        cursor: "pointer",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(26,26,26,0.06)";
        e.currentTarget.style.color = "var(--ink)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--ink-mute)";
      }}
    >
      <TrashIcon size={13} />
    </span>
  );
}

/// Mini KPI : label mono uppercase + valeur display bold. Utilisé dans la
/// grille de KPIs de chaque carte défi (envoyé ou reçu). L'accent "good"
/// teinte la valeur en vert, pour mettre en évidence un score positif.
export function DefiCardMini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good";
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 17,
          letterSpacing: "-0.01em",
          lineHeight: 1,
          color: accent === "good" ? "var(--signal-good)" : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
