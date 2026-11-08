"use client";

/// CTA secondaire "Exporter en PDF". Utilisé depuis Recap (session jouée),
/// Favoris (étoiles), et Réviser (sélection multi). Ouvre `/livret?ids=...`
/// dans un nouvel onglet — l'utilisateur garde son contexte de jeu et peut
/// imprimer / "Enregistrer en PDF" via le navigateur.
///
/// `target="_blank"` plutôt que useRouter.push : sur mobile, le print
/// stylesheet remplacerait visuellement l'app si on naviguait sur place,
/// avec un retour back arbitraire selon où l'utilisateur s'arrête. Un
/// onglet à part isole bien l'usage.

const URL_LIMIT = 200; // protection : au-delà l'URL devient longue (~2.5kB)

export function ExportPdfLink({
  ids,
  from,
  label,
  variant = "link",
}: {
  ids: string[];
  from: "session" | "favorites" | "review";
  label?: string;
  /// "link" = lien souligné discret ; "button" = bouton plus visible
  variant?: "link" | "button";
}) {
  const count = ids.length;
  if (count === 0) return null;
  const capped = ids.slice(0, URL_LIMIT);
  const href = `/livret?ids=${capped.join(",")}&from=${from}`;
  const txt = label ?? `Exporter en PDF`;
  const overLimit = count > URL_LIMIT;

  if (variant === "button") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
          marginTop: 12,
        }}
      >
        <PdfIcon />
        {txt}
        {overLimit ? (
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-mute)",
              fontFamily: "var(--font-mono)",
            }}
          >
            ({URL_LIMIT} max)
          </span>
        ) : null}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 10,
        marginBottom: 4,
        fontFamily: "var(--font-display)",
        fontWeight: 500,
        fontSize: 13,
        color: "var(--ink-soft)",
        textDecoration: "underline",
        textDecorationColor: "var(--rule)",
        textUnderlineOffset: 3,
      }}
    >
      <PdfIcon />
      {txt}
      {overLimit ? (
        <span style={{ color: "var(--ink-mute)" }}>(limité à {URL_LIMIT})</span>
      ) : null}
    </a>
  );
}

function PdfIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}
