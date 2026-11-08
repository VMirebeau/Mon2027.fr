"use client";

/// Le logo Mon2027 + UserMenu (header "inapp") est rendu globalement par
/// AppShell pour la scène "onboarding" — cf. SCENES_WITH_HOME_HEADER. On ne
/// dessine donc plus de logo localement ici, et la première section démarre
/// directement avec la bento de stats.

export function Onboarding({
  onStart,
  onShowMethode,
  onLogin,
}: {
  onStart: () => void;
  /// Optionnel : si fourni, le lien "Méthode et corrections" devient
  /// cliquable. Sinon le lien est masqué (plutôt qu'un href="#" cassé).
  onShowMethode?: () => void;
  /// Optionnel : route vers l'écran Mon compte sur l'onglet Connexion. Sans
  /// ce lien sur l'onboarding, les utilisateurs déjà inscrits sur un autre
  /// appareil ne devinaient pas que la connexion était possible (l'icône
  /// user en haut à droite est trop abstraite pour servir d'affordance).
  onLogin?: () => void;
}) {
  return (
    <div
      className="scroll"
      style={{
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          padding: "0 28px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Hero — playful collage of "facts cards" */}
        <div style={{ position: "relative", height: 300 }}>
          <div
            className="display onb-hero-card onb-hero-card--c1"
            style={{
              position: "absolute",
              top: 18,
              left: 0,
              right: 30,
              background: "var(--yellow)",
              padding: "16px 18px",
              borderRadius: 18,
              border: "1.5px solid var(--ink)",
              boxShadow: "4px 4px 0 var(--ink)",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
                marginBottom: 6,
              }}
            >
              IMMIGRATION
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>
              3,7&nbsp;%
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {" "}
                de l&apos;humanité vit dans un pays autre que celui où elle est
                née.
              </span>
            </div>
          </div>

          <div
            className="display onb-hero-card onb-hero-card--c2"
            style={{
              position: "absolute",
              top: 110,
              left: 40,
              right: 8,
              background: "var(--teal)",
              padding: "16px 18px",
              borderRadius: 18,
              border: "1.5px solid var(--ink)",
              boxShadow: "4px 4px 0 var(--ink)",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
                marginBottom: 6,
              }}
            >
              ÉCONOMIE
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>
              2&nbsp;190&nbsp;€
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {" "}
                : le salaire médian dans le privé. La moitié des salariés gagne moins.
              </span>
            </div>
          </div>

          <div
            className="display onb-hero-card onb-hero-card--c3"
            style={{
              position: "absolute",
              top: 200,
              left: 12,
              right: 50,
              background: "var(--coral)",
              padding: "14px 18px",
              borderRadius: 16,
              border: "1.5px solid var(--ink)",
              boxShadow: "4px 4px 0 var(--ink)",
              color: "var(--cream-warm)",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: 0.7,
                marginBottom: 4,
              }}
            >
              SÉCURITÉ
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>
              3,3&nbsp;×
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {" "}
                plus de morts sur la route que d&apos;homicides.
              </span>
            </div>
          </div>
        </div>

        {/* Pitch */}
        <div
          className="display onb-anim onb-anim--1"
          style={{
            marginTop: 28,
            fontSize: 38,
            lineHeight: 1.02,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Teste ce que tu crois savoir{" "}
          <span style={{ color: "var(--coral)" }}>sur la France.</span>
        </div>
        <div
          className="onb-anim onb-anim--2"
          style={{
            marginTop: 14,
            fontSize: 16,
            color: "var(--ink-soft)",
            lineHeight: 1.45,
            maxWidth: 320,
          }}
        >
          5 questions, 3 minutes. Tu verras la réponse, ses sources, et
          surtout pourquoi la plupart se trompent.
        </div>
      </div>

      <div style={{ padding: "20px 24px 16px" }}>
        <button
          className="btn-primary onb-anim onb-anim--3"
          onClick={onStart}
          style={{ background: "var(--ink)", color: "var(--cream-warm)" }}
        >
          Commencer
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="m6 3 5 5-5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {/* Lien Connexion : positionné directement sous le CTA principal et
            préfixé par "Pas besoin de compte pour jouer" pour qu'il soit
            limpide que la connexion n'est pas un prérequis — on ne veut pas
            qu'un visiteur reparte en pensant qu'il faut un compte. Visuel
            volontairement plus mat que Commencer pour ne pas concurrencer
            le CTA primaire. */}
        {onLogin ? (
          <div
            className="onb-anim onb-anim--3"
            style={{
              marginTop: 14,
              fontSize: 13,
              color: "var(--ink-mute)",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Pas besoin de compte pour jouer.{" "}
            <button
              type="button"
              onClick={onLogin}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--ink)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                font: "inherit",
                fontWeight: 600,
              }}
            >
              Déjà un compte ? Se connecter
            </button>
          </div>
        ) : null}
        {/* Plus de prose "Toutes les réponses sont sourcées…" : le sous-titre
            du hero mentionne déjà "ses sources", et lister les organismes
            (INSEE, Eurostat, OCDE) au moment du clic sur Commencer est du
            bruit informationnel. On garde juste l'action vers la Méthode pour
            les curieux. */}
        {onShowMethode ? (
          <div
            className="onb-anim onb-anim--4"
            style={{
              marginTop: 14,
              fontSize: 12,
              color: "var(--ink-mute)",
              textAlign: "center",
              lineHeight: 1.5,
              padding: "0 8px 12px",
            }}
          >
            <button
              type="button"
              onClick={onShowMethode}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--ink-soft)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                font: "inherit",
              }}
            >
              Méthode et corrections →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
