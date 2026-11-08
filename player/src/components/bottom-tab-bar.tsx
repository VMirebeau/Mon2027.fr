"use client";

/// Bottom tab bar mobile — navigation principale.
///
/// 4 items équivalents (Question du jour / Découvrir / Réviser / Défier),
/// position: fixed bottom + safe-area-inset-bottom pour iOS. Cohérence
/// visuelle avec l'AppNav desktop : magic underline via framer-motion
/// LayoutGroup + motion.span layoutId.
///
/// La barre n'apparaît que sur les scènes "exploratoires" (home, themes,
/// review, favorites, challenge wizard landing, methode, apropos). Elle est
/// retirée pendant les flows immersifs (game, recap, onboarding) — gérée par
/// app-shell qui décide quand la rendre.

import Link from "next/link";
import { LayoutGroup, motion } from "framer-motion";
import type { MouseEvent } from "react";
import type { NavTarget } from "@/lib/types";
import { useUnseenDefis } from "@/lib/use-unseen-defis";

type TabId = Extract<NavTarget, "daily" | "themes" | "review" | "challenge">;

function hrefFor(id: TabId): string {
  return `/?s=${id}`;
}

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "daily", label: "Du jour", icon: <IconDaily /> },
  { id: "themes", label: "Découvrir", icon: <IconDiscover /> },
  { id: "review", label: "Réviser", icon: <IconReview /> },
  { id: "challenge", label: "Défier", icon: <IconChallenge /> },
];

export function BottomTabBar({
  active,
  onNavigate,
}: {
  /// activeMode courant. Si la valeur n'est pas un des 4 tabs (ex: "favorites",
  /// "methode"), aucun tab n'est souligné — comportement voulu : ces écrans
  /// secondaires ne squattent pas un highlight d'un mode primaire.
  active: NavTarget;
  onNavigate: (target: NavTarget) => void;
}) {
  // Pastille de notif sur "Défier" : visible dès qu'au moins une réponse non
  // vue traîne pour un défi envoyé. Source = polling /api/defis/mine/unseen
  // monté dans AppShell (cf. UnseenDefisProvider). Hors AppShell le hook
  // retourne 0 — pas de pastille parasite sur les pages standalone.
  const { total: unseenTotal } = useUnseenDefis();

  return (
    <nav className="bottom-tab-bar" aria-label="Navigation principale">
      <LayoutGroup id="bottom-tab-bar">
        {TABS.map((t) => {
          const isActive = active === t.id;
          const showBadge = t.id === "challenge" && unseenTotal > 0;
          return (
            <Link
              key={t.id}
              href={hrefFor(t.id)}
              onClick={(e) => {
                // Click gauche → pushScene en interne. Middle/Ctrl → laisse
                // Next.js ouvrir un nouvel onglet via le href canonique.
                if (isPlainLeftClick(e)) {
                  e.preventDefault();
                  onNavigate(t.id);
                }
              }}
              aria-current={isActive ? "page" : undefined}
              aria-label={
                showBadge
                  ? `${t.label}, ${unseenTotal} nouvelle${unseenTotal > 1 ? "s" : ""} réponse${unseenTotal > 1 ? "s" : ""}`
                  : undefined
              }
              className={"bottom-tab" + (isActive ? " active" : "")}
            >
              <span
                className="bottom-tab-icon"
                aria-hidden
                style={{ position: "relative" }}
              >
                {t.icon}
                {showBadge ? <UnseenDot count={unseenTotal} /> : null}
              </span>
              <span className="bottom-tab-label">{t.label}</span>
              {isActive ? (
                <motion.span
                  layoutId="bottom-tab-indicator"
                  className="bottom-tab-indicator"
                  // Spring doux : assez nerveux pour être perçu comme une
                  // réponse, assez amorti pour ne pas overshoot brutalement.
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              ) : null}
            </Link>
          );
        })}
      </LayoutGroup>
    </nav>
  );
}

/// Pastille rouge en coin de l'icône onglet "Défier". On affiche un compteur
/// tant que c'est lisible (≤9), sinon un "9+" — au-delà la précision
/// n'apporte rien et la pastille gonfle visuellement. Positionnée en
/// absolute sur l'icône, donc la div parent (`bottom-tab-icon`) doit avoir
/// `position: relative` — appliqué en inline-style pour ne pas dépendre
/// d'une règle CSS qui pourrait régresser sans qu'on s'en aperçoive.
function UnseenDot({ count }: { count: number }) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: -4,
        right: -6,
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 999,
        background: "var(--coral, #e0524a)",
        color: "var(--cream-warm, #faf6ed)",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: 10,
        lineHeight: "16px",
        textAlign: "center",
        boxShadow: "0 0 0 2px var(--cream, #f4eee0)",
      }}
    >
      {label}
    </span>
  );
}

// ============================================================================
// Icônes monoline. Volontairement simples : la barre doit rester lisible
// sans bruit visuel. Stroke 1.75, viewBox 24, currentColor.
// ============================================================================

function IconDaily() {
  // Soleil — métaphore "du jour", motif déjà présent dans l'identité visuelle
  // (le yellow de la palette).
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={4} />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  );
}

function IconDiscover() {
  // Boussole — explore. Diamant central pour l'aiguille.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={9} />
      <path d="m15.5 8.5-2.5 5-5 2.5 2.5-5 5-2.5z" />
    </svg>
  );
}

function IconReview() {
  // Flèche circulaire — "rejouer / ancrer en mémoire".
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function IconChallenge() {
  // Avion en papier — "envoyer un défi". Même métaphore que defi-bits.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 9.5 22 2" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}
