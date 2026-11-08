"use client";

import type { NavTarget } from "@/lib/types";

export function OnboardingDT({
  onStart,
  onNavigate,
}: {
  onStart: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  return (
    <>
      <div className="dt-page">
        <div className="dt-content">
          <div className="dt-hero">
            <div className="dt-hero-left">
              <div
                className="mono"
                style={{
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-mute)",
                  marginBottom: 24,
                }}
              >
                Civique · Non-partisan · Sourcé
              </div>
              <h1>
                Teste ce que tu crois savoir{" "}
                <span style={{ color: "var(--coral)" }}>sur la France.</span>
              </h1>
              <p className="dt-hero-sub">
                5 questions, 3 minutes. Tu verras la réponse, ses sources
                publiques, et surtout pourquoi la plupart se trompent.{" "}
                <strong style={{ color: "var(--ink)" }}>
                  Prépare ton vote 2027.
                </strong>
              </p>
              <button className="dt-hero-cta" onClick={onStart}>
                Commencer
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path
                    d="m6 3 5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {/* Affordance "Se connecter" directement sous le CTA primaire.
                  Avant : la connexion était cachée derrière l'icône user en
                  haut à droite — abstraite pour un visiteur qui découvre
                  l'app, et son sens "compte existant" non évident. Position
                  ici + copy "Pas besoin de compte pour jouer" garantit que
                  l'utilisateur sait que la connexion est possible MAIS
                  facultative. Le lien est en ink (pas ink-mute) pour qu'il
                  soit lisible sans concurrencer le CTA Commencer (qui reste
                  le seul gros bouton noir). */}
              {onNavigate ? (
                <div
                  style={{
                    marginTop: 16,
                    fontSize: 14,
                    color: "var(--ink-mute)",
                    lineHeight: 1.5,
                    maxWidth: 460,
                  }}
                >
                  Pas besoin de compte pour jouer.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      // Pré-injecte ?tab=login dans l'URL avant le push de
                      // scène : pushScene préserve les autres params, donc
                      // AccountBody le verra et démarrera sur l'onglet
                      // Connexion plutôt que Créer un compte. Le user n'a
                      // pas à chercher l'onglet à cliquer.
                      if (typeof window !== "undefined") {
                        const sp = new URLSearchParams(window.location.search);
                        sp.set("tab", "login");
                        window.history.replaceState(
                          window.history.state,
                          "",
                          `/?${sp.toString()}`,
                        );
                      }
                      onNavigate("account");
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      fontWeight: 600,
                      color: "var(--ink)",
                      textDecorationLine: "underline",
                      textUnderlineOffset: 3,
                      cursor: "pointer",
                    }}
                  >
                    Déjà un compte ? Se connecter
                  </button>
                </div>
              ) : null}
              {/* Lien Méthode seul, sans la prose "Toutes les réponses sont
                  sourcées sur des données publiques — INSEE, Eurostat…" :
                  l'info est déjà portée par l'eyebrow `CIVIQUE · NON-PARTISAN
                  · SOURCÉ` en haut du hero ET par le bandeau de garanties en
                  bas (`SOURCES PUBLIQUES · NON-PARTISAN · SANS EMAIL · OPEN
                  DATA`). Triple mention = bruit. On garde uniquement l'action
                  cliquable. */}
              {onNavigate ? (
                <div
                  style={{
                    marginTop: 18,
                    fontSize: 13,
                    color: "var(--ink-mute)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onNavigate("methode")}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      color: "var(--ink-soft)",
                      textDecorationLine: "underline",
                      textUnderlineOffset: 3,
                      cursor: "pointer",
                    }}
                  >
                    Méthode et corrections →
                  </button>
                </div>
              ) : null}
            </div>
            <div className="dt-hero-cards">
              <div
                className="dt-fact-wrap dt-fact-wrap--c1"
                style={{ top: 0, left: 10, width: 340, zIndex: 3 }}
              >
                <div
                  className="dt-fact-card"
                  style={{ background: "var(--yellow)" }}
                >
                  <div className="tag">Immigration</div>
                  <div className="figure">3,7&nbsp;%</div>
                  <div className="text">
                    de l&apos;humanité vit dans un pays différent de celui où
                    elle est née.
                  </div>
                </div>
              </div>
              <div
                className="dt-fact-wrap dt-fact-wrap--c2"
                style={{ top: 130, left: 130, width: 360, zIndex: 2 }}
              >
                <div
                  className="dt-fact-card"
                  style={{ background: "var(--teal)" }}
                >
                  <div className="tag">Économie</div>
                  <div className="figure">2&nbsp;190&nbsp;€</div>
                  <div className="text">
                    le salaire médian dans le privé. La moitié des salariés gagne moins.
                  </div>
                </div>
              </div>
              <div
                className="dt-fact-wrap dt-fact-wrap--c3"
                style={{ top: 270, left: 30, width: 340, zIndex: 1 }}
              >
                <div
                  className="dt-fact-card"
                  style={{
                    background: "var(--coral)",
                    color: "var(--cream-warm)",
                  }}
                >
                  <div
                    className="tag"
                    style={{ color: "rgba(255,255,255,0.85)" }}
                  >
                    Sécurité
                  </div>
                  <div className="figure">3,3 ×</div>
                  <div className="text">
                    plus de morts sur la route que d&apos;homicides en France
                    en 2024.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="dt-hero-strip"
            style={{
              marginTop: 32,
              padding: "20px 0",
              borderTop: "1px solid var(--rule-soft)",
              borderBottom: "1px solid var(--rule-soft)",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 32,
            }}
          >
            {[
              { k: "Sources publiques", v: "INSEE, Eurostat, OCDE, OIM, SSMSI" },
              { k: "Non-partisan", v: "Aucun parti, aucune campagne" },
              { k: "Sans email", v: "Compte optionnel, pas de tracking" },
              { k: "Open data", v: "Toutes les questions auditables" },
            ].map((c) => (
              <div key={c.k}>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                  }}
                >
                  {c.k}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 14,
                    color: "var(--ink-soft)",
                  }}
                >
                  {c.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
