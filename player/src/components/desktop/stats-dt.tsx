"use client";

/// Page "Mes stats" desktop. Hero éditorial à gauche (eyebrow + titre coral
/// + description), carte méta `StatsAside` à droite (statut compte, dernière
/// session, favoris, défis) — évite la moitié droite vide en hero sans
/// compresser les visus de données dessous, qui restent à pleine largeur.
///
/// L'aside réutilise les agrégats `computeHero` / `computeChallenges` pour
/// rester DRY avec StatsBody : on calcule ici les chiffres déjà visibles
/// plus bas, mais sous une forme "récap contextuel" plutôt qu'analytique.

import { useMemo } from "react";
import { AppFooter } from "./app-nav";
import { HeroBlock, StatsBody } from "../screens/stats";
import { useAuth, type AuthUser } from "@/lib/use-auth";
import { useProgress } from "@/lib/use-progress";
import { useMyDefis } from "@/lib/use-my-defis";
import { answeredCount } from "@/lib/progress";
import {
  computeChallenges,
  computeHero,
  formatDayKey,
} from "@/lib/progress-stats";
import type { NavTarget, Question, Theme } from "@/lib/types";

export function StatsDT({
  questions,
  themes,
  onNavigate,
}: {
  questions: Question[];
  themes: Theme[];
  onNavigate?: (target: NavTarget) => void;
}) {
  const { user, ready: authReady } = useAuth();
  const { progress, hydrated } = useProgress();
  const answered = hydrated ? answeredCount(progress) : 0;

  const hero = useMemo(
    () => computeHero(progress, questions.length),
    [progress, questions.length],
  );
  // Défis envoyés : source serveur (le local n'en garde plus trace). La
  // requête est partagée avec StatsBody (cf. useMyDefis).
  const myDefis = useMyDefis();
  const sentDefis = myDefis.status === "ok" ? myDefis.defis : null;
  const challenges = useMemo(
    () => computeChallenges(progress, sentDefis),
    [progress, sentDefis],
  );

  return (
    <>
      <div className="dt-page">
        <div
          className="dt-content"
          style={{ paddingTop: 32, paddingBottom: 48 }}
        >
          {hydrated && answered > 0 ? (
            <>
              <div className="dt-stats-hero-grid">
                <header className="dt-stats-hero-head">
                  <StatsEyebrow />
                  <StatsHeading authReady={authReady} user={user} />
                  <StatsDescription empty={false} />
                </header>

                <StatsAside
                  lastPlayedDay={hero.lastPlayedDay}
                  favoritesCount={hero.favorites}
                  challengesPlayed={challenges.receivedPlayed}
                  challengesSent={challenges.sentCount}
                  isSynced={authReady && !!user}
                  pseudo={user?.displayPseudo}
                  onNavigate={onNavigate}
                />

                <div className="dt-stats-hero-kpi">
                  <HeroBlock hero={hero} variant="desktop" />
                </div>
              </div>

              <div style={{ marginTop: 40, maxWidth: 880 }}>
                <StatsBody
                  questions={questions}
                  themes={themes}
                  onNavigate={onNavigate}
                  variant="desktop"
                  skipHero
                />
              </div>
            </>
          ) : (
            <>
              <header style={{ maxWidth: 720 }}>
                <StatsEyebrow />
                <StatsHeading authReady={authReady} user={user} />
                <StatsDescription empty />
              </header>

              <div style={{ marginTop: 40, maxWidth: 880 }}>
                <StatsBody
                  questions={questions}
                  themes={themes}
                  onNavigate={onNavigate}
                  variant="desktop"
                />
              </div>
            </>
          )}
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Hero pieces — partagés entre la branche "avec data" (grille 2 colonnes
// header + KPI band + aside) et la branche "empty state" (header simple
// pleine largeur, max 720). Extraits pour éviter de dupliquer le markup
// du eyebrow / h1 / description.
// ---------------------------------------------------------------------------

function StatsEyebrow() {
  return (
    <div
      className="mono"
      style={{
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--ink-mute)",
        marginBottom: 12,
      }}
    >
      Mes stats · Progression
    </div>
  );
}

function StatsHeading({
  authReady,
  user,
}: {
  authReady: boolean;
  user: AuthUser | null;
}) {
  return (
    <h1
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: "clamp(40px, 4.6vw, 64px)",
        lineHeight: 1,
        letterSpacing: "-0.035em",
        margin: 0,
        textWrap: "balance",
      }}
    >
      {authReady && user ? (
        <>
          Ton parcours,{" "}
          <span style={{ color: "var(--coral)" }}>{user.displayPseudo}</span>.
        </>
      ) : (
        <>
          Ton parcours{" "}
          <span style={{ color: "var(--coral)" }}>en chiffres</span>.
        </>
      )}
    </h1>
  );
}

function StatsDescription({ empty }: { empty: boolean }) {
  return (
    <p
      style={{
        marginTop: 20,
        fontSize: 18,
        lineHeight: 1.5,
        color: "var(--ink-soft)",
        textWrap: "balance",
      }}
    >
      {empty
        ? "Pour l'instant, rien à montrer ici : joue ta première question et tes stats commenceront à se remplir."
        : "Ce que tu maîtrises par thème et par format, tes défis et ton historique."}
    </p>
  );
}

// ---------------------------------------------------------------------------
// StatsAside — carte méta à droite du hero.
// ---------------------------------------------------------------------------

function StatsAside({
  lastPlayedDay,
  favoritesCount,
  challengesPlayed,
  challengesSent,
  isSynced,
  pseudo,
  onNavigate,
}: {
  lastPlayedDay: string | null;
  favoritesCount: number;
  challengesPlayed: number;
  challengesSent: number;
  isSynced: boolean;
  pseudo?: string;
  onNavigate?: (target: NavTarget) => void;
}) {
  return (
    <aside className="dt-stats-aside" aria-label="Récap d'activité">
      <div className="dt-stats-aside-eyebrow">Activité</div>

      <div className="dt-stats-aside-row">
        <div className="dt-stats-aside-label">Statut</div>
        <div className="dt-stats-aside-value">
          <span
            className="dt-stats-aside-dot"
            data-on={isSynced ? "true" : "false"}
            aria-hidden
          />
          {isSynced ? (
            <>
              Synchronisé{" "}
              <span style={{ color: "var(--ink-mute)" }}>· {pseudo}</span>
            </>
          ) : (
            "Pas de compte"
          )}
        </div>
        {!isSynced && onNavigate ? (
          <button
            type="button"
            className="dt-stats-aside-link"
            onClick={() => onNavigate("account")}
          >
            Se connecter →
          </button>
        ) : null}
      </div>

      <div className="dt-stats-aside-row">
        <div className="dt-stats-aside-label">Dernière session</div>
        <div className="dt-stats-aside-value">
          {lastPlayedDay ? formatDayKey(lastPlayedDay) : "Aucune"}
        </div>
        {lastPlayedDay ? (
          <div className="dt-stats-aside-sub">{relativeDay(lastPlayedDay)}</div>
        ) : null}
      </div>

      <div className="dt-stats-aside-grid">
        <button
          type="button"
          className="dt-stats-aside-tile"
          onClick={() => onNavigate?.("favorites")}
          disabled={!onNavigate}
        >
          <div className="dt-stats-aside-tile-label">Favoris</div>
          <div className="dt-stats-aside-tile-value">{favoritesCount}</div>
        </button>
        <button
          type="button"
          className="dt-stats-aside-tile"
          onClick={() => onNavigate?.("challenge")}
          disabled={!onNavigate}
        >
          <div className="dt-stats-aside-tile-label">Défis</div>
          <div className="dt-stats-aside-tile-value">
            {challengesPlayed + challengesSent}
          </div>
        </button>
      </div>
    </aside>
  );
}

/// Distance approximative entre `dayKey` (YYYY-MM-DD) et aujourd'hui, en
/// langage naturel ("aujourd'hui", "hier", "il y a 3 jours", "il y a 2 mois").
/// Calculé côté client uniquement — pas appelé en SSR (StatsAside ne rend
/// que quand `hydrated && answered > 0`).
function relativeDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "";
  const then = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const diffDays = Math.round((today - then) / 86_400_000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) {
    const w = Math.round(diffDays / 7);
    return w === 1 ? "Il y a 1 semaine" : `Il y a ${w} semaines`;
  }
  const months = Math.round(diffDays / 30);
  return months === 1 ? "Il y a 1 mois" : `Il y a ${months} mois`;
}
