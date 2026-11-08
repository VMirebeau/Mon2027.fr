"use client";

/// Composant client qui génère et affiche un QR code à partir d'une URL.
/// La lib `qrcode` est lourde (~30 KB) ; on ne la charge que quand le
/// composant est monté, via import dynamique. État local : "loading" →
/// "ready" | "error". Si la génération échoue (rare), on n'affiche rien
/// — le code appelant peut garder son fallback (lien copiable, etc.).

import { useEffect, useState } from "react";

export function QrDisplay({
  value,
  size = 140,
  label,
}: {
  value: string;
  size?: number;
  /// Texte d'aide en dessous du QR (ex. "Scanne pour ouvrir le défi").
  label?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { qrSvg } = await import("@/lib/qr-svg");
        const out = await qrSvg(value, size);
        if (!cancelled) setSvg(out);
      } catch {
        if (!cancelled) setSvg(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!svg) {
    return (
      <div
        style={{
          width: size,
          height: size,
          border: "1.5px dashed var(--rule)",
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          color: "var(--ink-mute)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
        }}
        aria-label="Génération du QR code en cours"
      >
        QR…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          padding: 8,
          background: "var(--cream-warm)",
          border: "1.5px solid var(--ink)",
          borderRadius: 12,
          color: "var(--ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {label ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.03em",
            textAlign: "center",
            maxWidth: size + 40,
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
