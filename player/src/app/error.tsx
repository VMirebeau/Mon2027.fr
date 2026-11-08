"use client";

/// Error boundary route-level — catché par Next quand un Server Component
/// ou un Client Component du sous-arbre throw au render.
///
/// Note : Next gère séparément `not-found.tsx` (404) et `global-error.tsx`
/// (erreur du root layout lui-même). Ici on n'attrape que les erreurs des
/// routes enfants. Logique : on évite les détails techniques côté joueur,
/// on propose un reset et un fallback maison.

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Trace côté serveur (Next l'imprime déjà avec le digest). Si un
    // monitoring est branché plus tard (Sentry, etc.), c'est ici qu'on
    // l'appellerait avec `error` + `error.digest`.
    console.error("[route error]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--cream)",
        color: "var(--ink)",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 32,
          letterSpacing: "-0.02em",
          marginBottom: 12,
          textWrap: "balance",
          maxWidth: 480,
        }}
      >
        Aïe, quelque chose a planté.
      </div>
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          color: "var(--ink-soft)",
          maxWidth: 420,
          lineHeight: 1.5,
          marginBottom: 24,
        }}
      >
        On n&apos;a pas réussi à charger cette page. Réessaie, ou reviens à
        l&apos;accueil : tes réponses sont sauvegardées localement.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={reset}
          className="btn-primary"
          style={{ padding: "12px 24px" }}
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="btn-secondary"
          style={{ padding: "12px 24px", textDecoration: "none" }}
        >
          Retour à l&apos;accueil
        </Link>
      </div>
      {error.digest ? (
        <div
          style={{
            marginTop: 32,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}
        >
          Code erreur : {error.digest}
        </div>
      ) : null}
    </div>
  );
}
