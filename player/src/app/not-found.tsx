import Link from "next/link";

/// 404 — page custom. Le default Next est techniquement neutre et "casse"
/// le branding cream/yellow. On garde le ton de l'app : court, sourcé,
/// et un retour clair vers l'accueil.

export const metadata = {
  title: "Page introuvable",
};

export default function NotFound() {
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
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: "var(--ink-mute)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        404
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 36,
          letterSpacing: "-0.02em",
          marginBottom: 12,
          textWrap: "balance",
          maxWidth: 480,
        }}
      >
        Cette page n&apos;existe pas ou plus.
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
        Le défi a peut-être expiré, ou la question a été retirée. Reviens à
        l&apos;accueil pour piocher autre chose.
      </p>
      <Link
        href="/"
        className="btn-primary"
        style={{ padding: "12px 24px", textDecoration: "none" }}
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
