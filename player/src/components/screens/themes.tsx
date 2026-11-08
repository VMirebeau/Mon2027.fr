"use client";

import { useMemo, useState } from "react";
import { newQuestionsLabel } from "../ui-bits";
import { SearchInput } from "../filter-bar";
import { ThemeBadge } from "../theme-badge";
import { ThemeIllustration } from "../theme-illustration";
import { searchQuestions } from "@/lib/question-search";
import type { NavTarget, Question, Theme } from "@/lib/types";

export function Themes({
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
  /// On arrive de la question du jour : la carte « 5 questions mélangées »
  /// devient une invitation explicite à enchaîner.
  afterDaily?: boolean;
  onPickTheme: (themeId: string) => void;
  /** Tire 5 questions au hasard parmi toutes les publiées et lance la partie. */
  onShuffle?: () => void;
  /// Conservé pour rester compat avec AppShell ; le HomeHeader est désormais
  /// rendu par AppShell (persistant entre scènes), pas par l'écran.
  onNavigate?: (target: NavTarget) => void;
  /// Catalogue complet pour la recherche. Optionnel pour rester compatible
  /// avec les call sites historiques qui ne le passaient pas — sans questions,
  /// l'input de recherche n'est pas rendu.
  questions?: Question[];
  /// Callback quand l'utilisateur clique sur un résultat de recherche →
  /// lance une session 1-question. Optionnel : pas de search si absent.
  onPickQuestion?: (q: Question) => void;
}) {
  void onNavigate;
  const open = themes.filter((t) => t.count > 0);
  const upcoming = themes.filter((t) => t.count === 0);
  const canShuffle = !!onShuffle && totalQuestions >= 5;
  const canSearch = !!questions && !!onPickQuestion && questions.length > 0;
  const [search, setSearch] = useState("");
  // Cap à 30 résultats pour éviter qu'une recherche très large (ex. "France")
  // produise une liste interminable sur mobile. Les 30 plus pertinents
  // (matches sur le titre d'abord) suffisent à un trouvage manuel ; au-delà,
  // l'utilisateur affinera sa requête.
  const searchResults = useMemo(() => {
    if (!canSearch || !questions || !search.trim()) return [] as Question[];
    return searchQuestions(questions, search, 30);
  }, [canSearch, questions, search]);
  const isSearching = search.trim().length > 0;
  return (
    <div
      className="scroll"
      style={{
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "0 24px 32px", flex: 1 }}>
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
          {totalQuestions} questions · {totalSources} sources publiques
        </div>
        <h1
          className="display"
          style={{
            fontWeight: 700,
            fontSize: 36,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            margin: 0,
            textWrap: "balance",
          }}
        >
          Explore les{" "}
          <span style={{ color: "var(--coral)" }}>chiffres</span>.
        </h1>

        {canSearch ? (
          <div style={{ marginTop: 20 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Chercher un mot, un sujet…"
              ariaLabel="Rechercher dans toutes les questions"
            />
          </div>
        ) : null}

        {isSearching ? (
          <SearchResults
            results={searchResults}
            onPick={onPickQuestion!}
            query={search}
          />
        ) : null}

        {!isSearching && canShuffle ? (
          <button
            type="button"
            onClick={onShuffle}
            className="pop-card"
            style={{
              marginTop: 24,
              width: "100%",
              background: "var(--yellow)",
              color: "var(--ink)",
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              fontFamily: "var(--font-display)",
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ink-soft)",
                }}
              >
                {afterDaily ? "Question du jour faite ✓ · on enchaîne ?" : "Au hasard · 3 min"}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontWeight: 700,
                  fontSize: 22,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                {afterDaily ? "Continue avec 5 questions" : "5 questions mélangées"}
              </div>
              <div
                className="mono"
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  color: "var(--ink-soft)",
                }}
              >
                {afterDaily ? "Mélangées, tous thèmes · 3 min" : "Pioche parmi tous les thèmes"}
              </div>
            </div>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-sm)",
                background: "var(--ink)",
                color: "var(--yellow)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
              aria-hidden
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5" />
                <path d="M4 20 21 3" />
                <path d="M21 16v5h-5" />
                <path d="m15 15 6 6" />
                <path d="M4 4l5 5" />
              </svg>
            </span>
          </button>
        ) : null}

        {!isSearching && canShuffle ? (
          <div
            className="mono"
            style={{
              marginTop: 28,
              paddingBottom: 8,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
            }}
          >
            Ou choisis un thème
          </div>
        ) : null}

        <div
          style={{
            marginTop: canShuffle ? 12 : 24,
            display: isSearching ? "none" : "grid",
            gridTemplateColumns: "1fr",
            gap: 12,
          }}
        >
          {open.map((t) => (
            <button
              key={t.id}
              onClick={() => onPickTheme(t.id)}
              className="display pop-card"
              style={{
                textAlign: "left",
                background: t.color,
                color: "var(--ink)",
                padding: "18px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <ThemeIllustration
                themeId={t.id}
                size={56}
                className="theme-art"
                style={{ margin: "-6px 2px -6px -4px" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  {t.label}
                </div>
                <div
                  className="mono"
                  suppressHydrationWarning
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    opacity: 0.8,
                  }}
                >
                  {newQuestionsLabel(t)}
                </div>
              </div>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--ink)",
                  color: "var(--yellow)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="m6 3 5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          ))}

          {upcoming.length > 0 ? (
            <>
              <div
                style={{
                  marginTop: 20,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--rule-soft)",
                  fontSize: 13,
                  color: "var(--ink-mute)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Bientôt
              </div>
              {upcoming.map((t) => (
                <div
                  key={t.id}
                  style={{
                    /* Variante "en préparation" : dashed border pour signifier
                       inactif, sinon mêmes proportions que soft-row. */
                    background: "var(--cream-warm)",
                    color: "var(--ink-soft)",
                    border: "1.5px dashed var(--rule)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{t.label}</div>
                  <div
                    className="mono"
                    style={{ fontSize: 11, color: "var(--ink-mute)" }}
                  >
                    en préparation
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/// Liste des résultats de recherche, rendue à la place de la grille de
/// thèmes quand l'utilisateur tape une requête. Click sur une ligne =
/// jeu single-question via onPick (cf. AppShell.startGame).
///
/// Pas d'infinite scroll : la lib `searchQuestions` cap à 30 résultats par
/// défaut, ce qui se charge instantanément même sur mobile lent.
function SearchResults({
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
          marginTop: 18,
          padding: "20px 18px",
          background: "var(--cream-warm)",
          border: "1.5px dashed var(--rule)",
          borderRadius: 14,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 14,
          color: "var(--ink-soft)",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Aucune question ne matche{" "}
        <strong style={{ fontStyle: "normal", color: "var(--ink)" }}>
          « {query} »
        </strong>
        .
        <br />
        Essaie un autre mot, ou explore par thème.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 10,
        }}
      >
        {results.length} résultat{results.length > 1 ? "s" : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((q) => (
          <SearchResultRow key={q.id} q={q} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function SearchResultRow({
  q,
  onPick,
}: {
  q: Question;
  onPick: (q: Question) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(q)}
      className="soft-row"
      style={{
        textAlign: "left",
        padding: "12px 14px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width: "100%",
        background: "var(--paper)",
      }}
    >
      <ThemeBadge label={q.theme} size="xs" />
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 14.5,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          lineHeight: 1.3,
          textWrap: "pretty",
        }}
      >
        {q.question}
      </div>
    </button>
  );
}
