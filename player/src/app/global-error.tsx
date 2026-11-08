"use client";

/// global-error.tsx — catché par Next quand l'erreur survient dans le
/// root layout lui-même (cas rare mais critique). Doit fournir son propre
/// <html> et <body> car le layout du root est en faute.
///
/// On reste minimal : pas de fonts custom, pas de variables CSS, juste
/// inline. Si on tombe ici, c'est que la chaîne providers/CSS est cassée.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#F5EFE2",
          color: "#1A1A1A",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>
          Erreur fatale
        </div>
        <p style={{ maxWidth: 420, lineHeight: 1.5, color: "#4A4A4A", marginBottom: 24 }}>
          On n&apos;a pas pu charger l&apos;application. Réessaie ou recharge la
          page entièrement.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#1A1A1A",
            color: "#F5EFE2",
            border: "none",
            borderRadius: 12,
            padding: "12px 24px",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
        {error.digest ? (
          <div style={{ marginTop: 32, fontSize: 11, color: "#999" }}>
            Code erreur : {error.digest}
          </div>
        ) : null}
      </body>
    </html>
  );
}
