"use client";

import { useEffect, useState } from "react";
import type { Theme } from "@/lib/types";
import { QuitConfirmModal } from "./quit-confirm-modal";
import { DifficultyChip } from "./formats/format-shared";
import { ThemeBadge } from "./theme-badge";
import { BrandIcon } from "./brand-icon";

/// Libellé concis pour une carte de thème : le seul chiffre
/// actionnable pour le joueur ("combien il me reste à faire").
/// Tant qu'aucune réponse n'a été enregistrée, on affiche le total brut
/// ("47 questions") — l'ancien libellé "nouvelles" sous-entendait
/// "récemment publiées" alors qu'on parle de "non répondues par toi".
/// Dès qu'il y a au moins une réponse, on bascule sur "X à jouer" pour
/// signaler le restant. "Terminé" ferme la boucle quand tout est vu.
export function newQuestionsLabel(t: Theme): string {
  const total = t.count;
  const answered = Math.max(0, Math.min(t.answered ?? 0, total));
  const remaining = total - answered;
  if (remaining <= 0) return "Terminé";
  if (answered === 0) return `${total} question${total > 1 ? "s" : ""}`;
  return `${remaining} à jouer`;
}

export function StatusBar({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [time, setTime] = useState("--:--");
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTime(
        d.getHours().toString().padStart(2, "0") +
          ":" +
          d.getMinutes().toString().padStart(2, "0")
      );
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);
  const fill = tone === "light" ? "#FAF8F3" : "#1A1A1A";
  return (
    <div className="statusbar no-select" style={{ color: fill }}>
      <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
        {time}
      </div>
      <div className="icons">
        <svg width="18" height="11" viewBox="0 0 18 11" fill={fill}>
          <rect x="0" y="7" width="3" height="4" rx="0.5" />
          <rect x="5" y="5" width="3" height="6" rx="0.5" />
          <rect x="10" y="2.5" width="3" height="8.5" rx="0.5" />
          <rect x="15" y="0" width="3" height="11" rx="0.5" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill={fill}>
          <path d="M8 11a1.4 1.4 0 1 0 0-2.8A1.4 1.4 0 0 0 8 11Zm3.2-3.6a4.5 4.5 0 0 0-6.4 0L3.5 6.1a6.3 6.3 0 0 1 9 0l-1.3 1.3Zm2.5-2.5a8 8 0 0 0-11.4 0L1 3.6a9.8 9.8 0 0 1 14 0l-1.3 1.3Z" />
        </svg>
        <svg width="26" height="11" viewBox="0 0 26 11">
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="10"
            rx="2.4"
            fill="none"
            stroke={fill}
            strokeOpacity="0.4"
          />
          <rect
            x="24"
            y="3.5"
            width="1.6"
            height="4"
            rx="0.6"
            fill={fill}
            fillOpacity="0.5"
          />
          <rect x="2" y="2" width="16" height="7" rx="1.2" fill={fill} />
        </svg>
      </div>
    </div>
  );
}

/// Logo Mon2027 hors HomeHeader (Méthode, À propos, AppHeader) : même marque
/// que l'en-tête principal (pictogramme BrandIcon 28 px + « Mon2027 » en
/// 17 px, « 2027 » en coral). Remplace l'ancien carré noir « M », qui faisait
/// coexister deux logos dans l'appli.
export function Logo({ size = 17 }: { size?: number }) {
  return (
    <div
      className="display no-select"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--ink)",
      }}
    >
      <span
        aria-hidden
        style={{ display: "inline-flex", width: 28, height: 28 }}
      >
        <BrandIcon size={28} />
      </span>
      <span
        style={{ fontWeight: 700, fontSize: size, letterSpacing: "-0.02em" }}
      >
        Mon<span style={{ color: "var(--coral)" }}>2027</span>
      </span>
    </div>
  );
}

export function AppHeader({
  title,
  right,
  onBack,
}: {
  title?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div
      className="no-select"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 20px 12px",
        color: "var(--ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack ? (
          <button
            type="button"
            aria-label="Retour"
            onClick={onBack}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "rgba(0,0,0,0.04)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3 5 8l5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <Logo />
        )}
        {title ? (
          <div
            className="display"
            style={{ fontWeight: 700, fontSize: 18 }}
          >
            {title}
          </div>
        ) : null}
      </div>
      <div>{right}</div>
    </div>
  );
}

/// Chrome unifié en haut de chaque écran de question mobile. Remplace
/// l'ancien `FormatChrome` qui faisait la même chose en plus simple
/// pour les formats composites — un seul rendu pour tous les formats
/// (estimation, ab, vraifaux, qcm, classement, ...).
///
/// Layout : [ThemeChip] [QUESTION X / Y · ×] / barre de progression.
/// Le ThemeChip est rendu ICI plutôt que par chaque format en dessous
/// — sinon l'index/timer flotte tout seul à droite et la chrome perd
/// son équilibre visuel. Cohérent avec le pattern de la
/// `dossier-action-bar` (deux éléments par row) du reveal.
export function QuestionChrome({
  theme,
  difficulte,
  index,
  total,
  accent,
  onAbort,
  skipConfirm = false,
}: {
  /// Libellé du thème (ex. "Sécurité"). Le chip choisit sa couleur de
  /// fond automatiquement via `themeAccent` côté format-shared.
  theme: string;
  /// Difficulté 1..5 affichée en pastille discrète à droite du ThemeChip.
  /// Optionnelle (les vieilles questions / la dev-scene peuvent ne pas
  /// l'avoir) ; quand absente, on ne rend rien.
  difficulte?: number;
  index: number;
  total: number;
  accent: string;
  /// Quitter la partie. Quand fourni, affiche un bouton × en haut à droite
  /// qui ouvre une modal de confirmation. Sur confirmation, on appelle
  /// `onAbort` — c'est au parent de gérer la suite (typiquement bubble
  /// vers `state.terminate` qui finalise la session avec les réponses
  /// partielles et renvoie au récap).
  onAbort?: () => void;
  /// Bypass la modal de confirmation et appelle `onAbort` directement. Utilisé
  /// quand la session est un one-shot déjà répondu (total === 1 + lockedAnswer)
  /// : l'utilisateur n'a rien à perdre, le double-clic « X → Confirmer » est
  /// du bruit.
  skipConfirm?: boolean;
}) {
  /// Progression dans la partie (question courante incluse).
  const pct = total > 0 ? ((index + 1) / total) * 100 : 100;
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="no-select" style={{ padding: "8px 20px 14px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {/* Mobile chrome de question : variant "solid" — c'est le foyer
              de la session, on assume la couleur thème (cohérent avec le
              rail desktop). Cf. components/theme-badge.tsx. */}
          <ThemeBadge label={theme} variant="solid" size="sm" />
          {difficulte != null ? <DifficultyChip difficulte={difficulte} /> : null}
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <div
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--ink-soft)",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--ink)" }}>
              {String(index + 1).padStart(2, "0")}
            </span>{" "}
            / {String(total).padStart(2, "0")}
          </div>
          {onAbort ? (
          <button
            type="button"
            aria-label="Quitter la partie"
            onClick={() => {
              if (skipConfirm) {
                onAbort();
                return;
              }
              setConfirmOpen(true);
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "rgba(0,0,0,0.05)",
              display: "grid",
              placeItems: "center",
              border: 0,
              cursor: "pointer",
              color: "var(--ink)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
        </div>
      </div>

      {onAbort ? (
        <QuitConfirmModal
          open={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onAbort();
          }}
        />
      ) : null}
      {/* Une seule barre continue = progression dans la partie (le minuteur
          a été supprimé le 2026-11-07 : pas de pression du temps). Pas de
          segment par question, illisible au-delà de quelques questions.
          Masquée pour une question isolée (lien partagé /q/…). */}
      {total > 1 ? (
      <div
        role="progressbar"
        aria-label="Progression de la partie"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        style={{
          height: 4,
          borderRadius: 99,
          background: "var(--cream-deep)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: accent || "var(--yellow)",
            transform: `translateX(${-100 + pct}%)`,
            transition: "transform 0.4s ease-out",
          }}
        />
      </div>
      ) : null}
    </div>
  );
}

/// Note : il existait ici une `ThemeChip` (basique, accent override).
/// Supprimée au profit de la version canonique de `format-shared.tsx`
/// qui pioche sa couleur via `themeAccent(theme)` — une seule source
/// de vérité pour la couleur par thème. Si tu cherchais `ThemeChip`,
/// `import { ThemeChip } from "./formats/format-shared"`.
