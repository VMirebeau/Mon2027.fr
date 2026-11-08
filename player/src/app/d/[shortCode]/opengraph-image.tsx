import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/brand-icon";
import { loadDefi } from "@/lib/defi-loader";
import { isMixedTheme } from "@/lib/defi-topic";
import { ogImageRateLimitOk } from "@/lib/page-rate-limit";

/// Image OpenGraph dynamique pour `/d/[shortCode]`. Personnalise le preview
/// avec le pseudo du créateur et le nombre de questions : quand l'ami reçoit
/// le lien WhatsApp/Signal, il voit "Léa te défie sur 5 questions" plutôt
/// que le wording générique. Conversion vers le clic en hausse nette.
///
/// Pas d'`alt` qui exposerait le pseudo en clair sur la portion HTML
/// `<meta property="og:image:alt">` — on garde un alt générique côté metadata.
///
/// Le rendu est cache par Next.js par shortCode. Comme on a `force-dynamic`
/// sur la page parente (cf. d/[shortCode]/page.tsx), on garde aussi un
/// rendu à la demande ici pour rester aligné avec la fraîcheur des défis.

export const alt = "Un défi Mon2027 : 5 questions civiques sourcées";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const PALETTE = {
  cream: "#F5EFE2",
  paper: "#FAF5E6",
  ink: "#1A1A1A",
  inkSoft: "#4A4A4A",
  inkMute: "#7A7670",
  coral: "#E0625F",
  yellow: "#FFC845",
  teal: "#5BAFA4",
};

export default async function DefiOG({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  // Rendu Satori coûteux en CPU et adresse non bornée : même garde par IP
  // que les autres images d'aperçu générées à la volée.
  if (!(await ogImageRateLimitOk())) notFound();
  const { shortCode } = await params;
  // Image OG : on n'a besoin que de la méta (pseudo, total, themeLabel,
  // title). Skip la jointure DefiResponse.
  const defi = await loadDefi(shortCode, { includeResponses: false });
  if (!defi) notFound();

  const pseudo = defi.creatorPseudo;
  const total = defi.total;
  const isExpired = defi.isExpired;
  const themeLabel = defi.themeLabel;
  const title = defi.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PALETTE.cream,
          display: "flex",
          flexDirection: "column",
          padding: "64px 80px 56px",
          color: PALETTE.ink,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", width: 56, height: 56 }}>
            <BrandIcon size={56} />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            {/* « Mon2027 » d'un seul tenant, comme le logo de l'appli. */}
            <span>Mon</span>
            <span style={{ color: PALETTE.coral }}>2027</span>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              padding: "8px 18px",
              borderRadius: 99,
              background: isExpired ? PALETTE.inkMute : PALETTE.teal,
              color: PALETTE.paper,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            <span style={{ display: "flex" }}>
              {isExpired ? "Défi expiré" : "Défi en attente"}
            </span>
          </div>
        </div>

        {/* Headline personnalisée */}
        <div
          style={{
            marginTop: 72,
            display: "flex",
            flexWrap: "wrap",
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            color: PALETTE.ink,
          }}
        >
          <span style={{ color: PALETTE.coral, display: "flex" }}>
            {truncate(pseudo, 28)}&nbsp;
          </span>
          <span style={{ display: "flex" }}>te défie sur&nbsp;</span>
          <span style={{ display: "flex" }}>{total} questions.</span>
        </div>

        {/* Sous-ligne thématique : "Sur Économie" ou "Questions diverses".
            Donne au destinataire un signal clair de quoi va parler le défi
            avant même de cliquer (preview WhatsApp/Signal). */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            fontSize: 38,
            fontWeight: 600,
            color: PALETTE.inkSoft,
            letterSpacing: -0.5,
          }}
        >
          <span style={{ display: "flex" }}>
            {/* Défi multi-thèmes : « Sur Questions diverses » ne voulait
                rien dire. */}
            {isMixedTheme(themeLabel)
              ? "Tous thèmes mélangés"
              : `Sur ${truncate(themeLabel, 40)}`}
          </span>
        </div>

        {/* Titre libre éventuel du militant — affiché entre guillemets
            italiques sous le sous-titre thématique. Cap à 60 chars enforcé
            au save, donc on n'a pas à se soucier des overflows. */}
        {title ? (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              fontSize: 30,
              fontStyle: "italic",
              fontWeight: 500,
              color: PALETTE.ink,
              maxWidth: 980,
              lineHeight: 1.3,
            }}
          >
            <span style={{ display: "flex" }}>« {title} »</span>
          </div>
        ) : null}

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Footer accroche */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 600,
              color: PALETTE.inkSoft,
              maxWidth: 800,
              lineHeight: 1.3,
            }}
          >
            <span style={{ display: "flex" }}>
              {isExpired
                ? "Ce défi est terminé. Explore l'app pour en créer un."
                : "Joue à ton rythme. Vous comparez vos réponses à la fin."}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: PALETTE.inkMute,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            <span style={{ display: "flex" }}>mon2027.fr</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}
