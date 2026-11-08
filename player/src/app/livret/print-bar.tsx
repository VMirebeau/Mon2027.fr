"use client";

/// Barre flottante au-dessus du livret avec le CTA "Imprimer / PDF" et un
/// retour. Masquée à l'impression via la classe `no-print` (cf. styles.tsx).
/// Le bouton lance simplement `window.print()` — le navigateur ouvre son
/// dialogue Imprimer où l'utilisateur choisit "Enregistrer en PDF". Sur iOS
/// Safari, l'option "Imprimer" propose une preview qu'on peut partager comme
/// PDF via le sheet OS (pinch-zoom le dernier preview).

import { useRouter } from "next/navigation";

export function PrintBar({
  count,
  withQr,
  toggleHref,
}: {
  count: number;
  withQr: boolean;
  /// URL pour basculer le toggle QR (calculée côté serveur dans page.tsx).
  toggleHref: string;
}) {
  const router = useRouter();
  return (
    <div className="livret-toolbar no-print">
      <div className="livret-toolbar-inner">
        <button
          type="button"
          onClick={() => router.back()}
          className="livret-toolbar-back"
          aria-label="Retour"
        >
          ← Retour
        </button>
        <div className="livret-toolbar-count">
          {count} question{count > 1 ? "s" : ""}
        </div>
        <a
          href={toggleHref}
          className="livret-toolbar-qr-toggle"
          aria-label={withQr ? "Masquer les QR codes" : "Afficher les QR codes"}
          title={withQr ? "QR codes activés" : "QR codes désactivés"}
        >
          {withQr ? "QR ✓" : "QR ✗"}
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="livret-toolbar-print"
        >
          Imprimer · PDF
        </button>
      </div>
      <div className="livret-toolbar-hint">
        {withQr
          ? "QR codes inclus pour scanner et rejouer chaque question. Choisis « Enregistrer en PDF » dans le dialogue d'impression."
          : "Sans QR codes. Choisis « Enregistrer en PDF » dans le dialogue d'impression."}
      </div>
    </div>
  );
}
