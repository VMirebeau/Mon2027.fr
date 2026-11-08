"use client";

import { useMemo, useState } from "react";
import { AppFooter } from "./app-nav";
import { newQuestionsLabel } from "../ui-bits";
import { SearchInput } from "../filter-bar";
import { ThemeBadge } from "../theme-badge";
import { ThemeIllustration } from "../theme-illustration";
import { searchQuestions } from "@/lib/question-search";
import type { NavTarget, Question, Theme } from "@/lib/types";

export function ThemesDT({
  themes,
  totalQuestions,
  totalSources,
  afterDaily = false,
  onPickTheme,
  onShuffle,
  onNavigate,
  questions,
  onPickQuestion,
}: {
  themes: Theme[];
  totalQuestions: number;
  /// Sources citées (calcul serveur unique, partagé avec la page Méthode).
  totalSources: number;
  /// On arrive de la question du jour : cf. Themes (mobile).
  afterDaily?: boolean;
  onPickTheme: (themeId: string) => void;
  /** Tire 5 questions au hasard parmi toutes les publiées et lance la partie. */
  onShuffle?: () => void;
  onNavigate?: (target: NavTarget) => void;
  /// Catalogue complet pour la recherche cross-thèmes. Optionnel pour rester
  /// compatible avec les call sites historiques.
  questions?: Question[];
  /// Clic sur un résultat de recherche → lance une session 1-question.
  onPickQuestion?: (q: Question) => void;
}) {
  const open = themes.filter((t) => t.count > 0);
  const upcoming = themes.filter((t) => t.count === 0);
  const canShuffle = !!onShuffle && totalQuestions >= 5;
  const canSearch = !!questions && !!onPickQuestion && questions.length > 0;
  const [search, setSearch] = useState("");
  // Cap plus généreux sur desktop (50 vs 30 mobile) car la largeur permet
  // d'afficher plus de lignes sans scroll fastidieux.
  const searchResults = useMemo(() => {
    if (!canSearch || !questions || !search.trim()) return [] as Question[];
    return searchQuestions(questions, search, 50);
  }, [canSearch, questions, search]);
  const isSearching = search.trim().length > 0;

  return (
    <>
      <div className="dt-page">
        <div className="dt-content">
          <div className="dt-themes-page">
            <div className="dt-doc-eyebrow">
              {totalQuestions} questions · {totalSources} sources publiques
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(40px, 5vw, 64px)",
                lineHeight: 1,
                letterSpacing: "-0.035em",
                margin: "16px 0 0",
                textWrap: "balance",
                maxWidth: 760,
              }}
            >
              Explore les{" "}
              <span style={{ color: "var(--coral)" }}>chiffres</span>.
            </h1>
            <p
              style={{
                marginTop: 20,
                fontSize: 18,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
                maxWidth: 640,
                textWrap: "balance",
              }}
            >
              Pioche 5 questions au hasard pour une partie rapide, ou choisis un
              thème à creuser. Les chiffres sont sourcés sur des données
              publiques, jamais inventés.
            </p>

            {canSearch ? (
              <div style={{ marginTop: 28, maxWidth: 520 }}>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  large
                  placeholder="Chercher un mot, un sujet…"
                  ariaLabel="Rechercher dans toutes les questions"
                />
              </div>
            ) : null}

            {isSearching ? (
              <DesktopSearchResults
                results={searchResults}
                onPick={onPickQuestion!}
                query={search}
              />
            ) : null}

            {!isSearching && canShuffle ? (
              <ShuffleHero onShuffle={onShuffle!} afterDaily={afterDaily} />
            ) : null}

            {!isSearching && canShuffle ? (
              <div
                className="mono"
                style={{
                  marginTop: 48,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink-mute)",
                }}
              >
                Ou choisis un thème à creuser
              </div>
            ) : null}

            <div
              className="dt-themes-page-grid"
              style={{
                ...(canShuffle ? { marginTop: 16 } : undefined),
                ...(isSearching ? { display: "none" } : undefined),
              }}
            >
              {open.map((t) => (
                <button
                  key={t.id}
                  className="dt-themes-card"
                  style={{ background: t.color, color: "var(--ink)" }}
                  onClick={() => onPickTheme(t.id)}
                >
                  <ThemeIllustration themeId={t.id} size={112} className="theme-art art" />
                  <div className="name">{t.label}</div>
                  <div className="count">
                    <span
                      className="mono"
                      suppressHydrationWarning
                      style={{ letterSpacing: "0.04em", fontSize: 13 }}
                    >
                      {newQuestionsLabel(t)}
                    </span>
                    <span className="play" aria-hidden="true">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="m6 3 5 5-5 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {upcoming.length > 0 ? (
              <>
                <div
                  className="dt-section-head"
                  style={{ marginTop: 64 }}
                >
                  <h2>Bientôt</h2>
                  <div className="sub">
                    Aucune question publiée pour ces thèmes, en cours
                    d&apos;écriture.
                  </div>
                </div>
                <div className="dt-themes-page-grid" style={{ marginTop: 16 }}>
                  {upcoming.map((t) => (
                    <button
                      key={t.id}
                      className="dt-themes-card"
                      disabled
                      title="Bientôt disponible : aucune question publiée pour l'instant"
                    >
                      {/* Sticker grisé : annonce le thème sans le donner pour jouable. */}
                      <ThemeIllustration
                        themeId={t.id}
                        size={112}
                        className="theme-art art"
                        style={{ filter: "grayscale(1)", opacity: 0.35 }}
                      />
                      <div className="tag" style={{ color: "var(--ink-mute)" }}>
                        Bientôt
                      </div>
                      <div
                        className="name"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t.label}
                      </div>
                      <div
                        className="count"
                        style={{ color: "var(--ink-mute)" }}
                      >
                        <span
                          className="mono"
                          style={{ letterSpacing: "0.04em", fontSize: 13 }}
                        >
                          en préparation
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}

/// Liste des résultats de recherche desktop. Layout grille 2 colonnes pour
/// utiliser la largeur tout en gardant chaque carte lisible.
function DesktopSearchResults({
  results,
  onPick,
  query,
}: {
  results: Question[];
  onPick: (q: Question) => void;
  query: string;
}) {
  if (results.length === 0) {
    return (
      <div
        style={{
          marginTop: 28,
          padding: "28px 32px",
          background: "var(--cream-warm)",
          border: "1.5px dashed var(--rule)",
          borderRadius: 18,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 16,
          color: "var(--ink-soft)",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 520,
        }}
      >
        Aucune question ne matche{" "}
        <strong style={{ fontStyle: "normal", color: "var(--ink)" }}>
          « {query} »
        </strong>
        . Essaie un autre mot, ou explore par thème.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 24 }}>
      <div
        className="mono"
        style={{
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 14,
        }}
      >
        {results.length} résultat{results.length > 1 ? "s" : ""}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 12,
        }}
      >
        {results.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onPick(q)}
            className="soft-row"
            style={{
              textAlign: "left",
              padding: "14px 18px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: "var(--paper)",
            }}
          >
            <ThemeBadge label={q.theme} size="sm" />
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
                lineHeight: 1.3,
                textWrap: "pretty",
              }}
            >
              {q.question}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/// Carte CTA pour la partie rapide 5 questions au hasard.
/// Reprend le langage visuel de la home (yellow + bordure ink + shadow offset)
/// pour signaler que c'est l'action proéminente de la page.
function ShuffleHero({
  onShuffle,
  afterDaily,
}: {
  onShuffle: () => void;
  afterDaily: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onShuffle}
      style={{
        marginTop: 32,
        width: "100%",
        background: "var(--yellow)",
        color: "var(--ink)",
        border: "1.5px solid var(--ink)",
        borderRadius: 22,
        padding: "28px 32px",
        boxShadow: "4px 6px 0 var(--ink)",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 24,
        alignItems: "center",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        textAlign: "left",
        transition: "transform 0.18s cubic-bezier(.2,.7,.2,1), box-shadow 0.18s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translate(-2px, -2px)";
        e.currentTarget.style.boxShadow = "6px 8px 0 var(--ink)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translate(0, 0)";
        e.currentTarget.style.boxShadow = "4px 6px 0 var(--ink)";
      }}
    >
      <div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
          }}
        >
          {afterDaily
            ? "Question du jour faite ✓ · on enchaîne ?"
            : "Partie rapide · 3 min · tous thèmes"}
        </div>
        <div
          style={{
            marginTop: 8,
            fontWeight: 700,
            fontSize: 32,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          {afterDaily ? "Continue avec 5 questions" : "5 questions mélangées"}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-body)",
            fontWeight: 400,
            fontSize: 14,
            color: "var(--ink-soft)",
            lineHeight: 1.4,
          }}
        >
          Pioche au hasard parmi toutes les questions publiées.
        </div>
      </div>
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "var(--ink)",
          color: "var(--yellow)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
        aria-hidden
      >
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 3h5v5" />
          <path d="M4 20 21 3" />
          <path d="M21 16v5h-5" />
          <path d="m15 15 6 6" />
          <path d="M4 4l5 5" />
        </svg>
      </span>
    </button>
  );
}
