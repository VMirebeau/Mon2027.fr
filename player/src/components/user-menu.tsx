"use client";

/// Menu utilisateur — bouton icône user, dropdown qui route vers les scènes
/// Mon compte, Mes stats, Mes favoris.
///
/// Anciennement, "Mon compte" et "Mes stats" ouvraient une AccountModal (la
/// page stats n'existait pas — c'était un placeholder qui retombait sur le
/// compte). Aujourd'hui les trois entrées sont de vraies scènes plein écran,
/// dans la même convention que le reste de l'app : pas de modal pour des
/// surfaces aussi larges, l'AppNav reste cohérente, le bouton back marche.

import { useEffect, useMemo, useRef, useState } from "react";
import { useProgress } from "@/lib/use-progress";
import { computeLevel, computeXp } from "@/lib/gamification";
import type { NavTarget } from "@/lib/types";

export function UserMenu({
  onNavigate,
}: {
  onNavigate?: (target: NavTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { progress, hydrated } = useProgress();
  /// Niveau courant — affiché en en-tête du dropdown comme indicateur
  /// d'identité. Gating sur `hydrated` pour éviter de flasher "Niveau 1"
  /// pour un utilisateur qui en est en réalité au niveau 6 avant que le
  /// localStorage soit lu.
  const level = useMemo(
    () => (hydrated ? computeLevel(computeXp(progress)) : null),
    [progress, hydrated]
  );

  // Click extérieur + touche Escape → ferme le menu.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(target: NavTarget) {
    setOpen(false);
    onNavigate?.(target);
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mon compte et favoris"
        className="icon-btn"
        style={{
          width: 38,
          height: 38,
          /* État "ouvert" : background renforcé pour signifier l'actif —
             surcharge le hover bg de .icon-btn. */
          background: open ? "var(--hover-bg-strong)" : undefined,
          color: "var(--ink)",
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 240,
            background: "var(--paper)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 14,
            boxShadow:
              "0 1px 0 rgba(26,26,26,0.04), 0 12px 32px -10px rgba(26,26,26,0.22)",
            padding: 6,
            zIndex: 100,
            fontFamily: "var(--font-body)",
          }}
        >
          {/* En-tête niveau : motive en montrant la progression et permet à
              l'utilisateur d'identifier rapidement où il en est. Cliquable —
              redirige vers la page Récompenses pour le détail. Skipped pour
              tant que progress n'est pas hydraté (pas de flash trompeur). */}
          {level ? (
            <button
              type="button"
              onClick={() => go("rewards")}
              style={{
                width: "100%",
                background: "var(--cream-warm)",
                border: 0,
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 6,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--cream-deep)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--cream-warm)";
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ink-mute)",
                  marginBottom: 3,
                }}
              >
                Niveau {level.current.rank}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: "-0.01em",
                  color: "var(--coral)",
                  lineHeight: 1.2,
                }}
              >
                {level.current.name}
              </div>
              {level.next ? (
                <div
                  style={{
                    marginTop: 8,
                    height: 4,
                    borderRadius: 999,
                    background: "rgba(26,26,26,0.08)",
                    overflow: "hidden",
                  }}
                  aria-hidden
                >
                  <div
                    style={{
                      width: `${Math.round(level.progressInLevel * 100)}%`,
                      height: "100%",
                      background: "var(--coral)",
                      transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
                    }}
                  />
                </div>
              ) : null}
            </button>
          ) : null}

          <MenuItem
            icon={<UserIcon />}
            label="Mon compte"
            sub="Connexion · pseudo · synchro"
            onClick={() => go("account")}
          />
          <MenuItem
            icon={<RadarIcon />}
            label="Mon portrait"
            sub="Score, biais et radar civique"
            onClick={() => go("profile")}
          />
          <MenuItem
            icon={<ChartIcon />}
            label="Mes stats"
            sub="Progression et historique"
            onClick={() => go("stats")}
          />
          <MenuItem
            icon={<TrophyIcon />}
            label="Mes récompenses"
            sub="Badges · niveau · missions"
            onClick={() => go("rewards")}
          />
          <MenuItem
            icon={<StarIcon />}
            label="Mes favoris"
            sub="Questions marquées"
            onClick={() => go("favorites")}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "transparent",
        border: 0,
        borderRadius: 10,
        color: "var(--ink)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "var(--cream-warm)",
          border: "1px solid var(--rule-soft)",
          display: "grid",
          placeItems: "center",
          color: "var(--ink)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: "block",
            marginTop: 1,
            fontSize: 11.5,
            color: "var(--ink-mute)",
            lineHeight: 1.3,
          }}
        >
          {sub}
        </span>
      </span>
    </button>
  );
}

function UserIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M7 16V11" />
      <path d="M12 16V8" />
      <path d="M17 16V13" />
    </svg>
  );
}

/// Icône "radar" pour Mon profil — un pentagone schématique évoque la
/// signature du portrait civique sans copier le radar à 9 axes du composant.
function RadarIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 3 21 9 18 19 6 19 3 9" />
      <polygon points="12 8 17 11 15.5 16 8.5 16 7 11" />
      <line x1="12" y1="3" x2="12" y2="8" />
      <line x1="21" y1="9" x2="17" y2="11" />
      <line x1="18" y1="19" x2="15.5" y2="16" />
      <line x1="6" y1="19" x2="8.5" y2="16" />
      <line x1="3" y1="9" x2="7" y2="11" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 4h8v6a4 4 0 1 1-8 0zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3M9 18h6l1 3H8z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
