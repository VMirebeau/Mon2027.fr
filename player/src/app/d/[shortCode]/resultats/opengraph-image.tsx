import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/brand-icon";
import { loadDefi } from "@/lib/defi-loader";
import { isMixedTheme } from "@/lib/defi-topic";
import { ogImageRateLimitOk } from "@/lib/page-rate-limit";

/// OpenGraph dynamique pour `/d/[shortCode]/resultats` — la page de
/// comparaison post-jeu. Cas typique de partage : le militant qui partage
/// cette URL à l'ami "tiens, voilà ce que tu as répondu vs moi" pour
/// rouvrir la discussion plus tard.
///
/// On reste fidèle au ton non-compétitif : on n'affiche PAS les scores
/// dans le preview. On annonce juste qui a comparé quoi, avec le nombre
/// de questions, et l'accroche conversation.
///
/// Si l'ami n'a pas encore joué, on bascule sur un wording "en attente".

export const alt = "Comparaison des réponses · Mon2027";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const PALETTE = {
  cream: "#F5EFE2",
  ink: "#1A1A1A",
  inkSoft: "#4A4A4A",
  inkMute: "#7A7670",
  coral: "#E0625F",
  yellow: "#FFC845",
  teal: "#5BAFA4",
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

export default async function DefiResultsOG({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  // Rendu Satori coûteux en CPU et adresse non bornée : même garde par IP
  // que les autres images d'aperçu générées à la volée.
  if (!(await ogImageRateLimitOk())) notFound();
  const { shortCode } = await params;
  const defi = await loadDefi(shortCode);
  if (!defi) notFound();

  const creator = truncate(defi.creatorPseudo, 24);
  const firstResponse = defi.responses[0];
  const responderName = firstResponse
    ? truncate(firstResponse.amiLabel, 24)
    : null;
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
        {/* Header brand + état */}
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
              background: isExpired
                ? PALETTE.inkMute
                : responderName
                  ? PALETTE.teal
                  : PALETTE.yellow,
              color: isExpired
                ? "#FAF5E6"
                : responderName
                  ? "#FAF5E6"
                  : PALETTE.ink,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            <span style={{ display: "flex" }}>
              {isExpired
                ? "Défi expiré"
                : responderName
                  ? "Résultats partagés"
                  : "En attente"}
            </span>
          </div>
        </div>

        {/* Headline contextuelle */}
        <div
          style={{
            marginTop: 72,
            display: "flex",
            flexWrap: "wrap",
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            color: PALETTE.ink,
          }}
        >
          {responderName ? (
            <>
              <span style={{ color: PALETTE.coral, display: "flex" }}>
                {creator}&nbsp;
              </span>
              <span style={{ display: "flex" }}>et&nbsp;</span>
              <span style={{ color: PALETTE.coral, display: "flex" }}>
                {responderName}&nbsp;
              </span>
              <span style={{ display: "flex" }}>ont comparé leurs réponses.</span>
            </>
          ) : (
            <>
              <span style={{ color: PALETTE.coral, display: "flex" }}>
                {creator}&nbsp;
              </span>
              <span style={{ display: "flex" }}>attend une réponse.</span>
            </>
          )}
        </div>

        {/* Sous-ligne thématique + titre libre éventuel, mêmes règles que
            l'OG d'accueil du défi. Permet au preview du partage de la page
            résultats de garder le contexte ("Sur Économie · « Pour ma sœur
            sceptique sur le climat »"). */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            fontSize: 34,
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
        {title ? (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              fontSize: 26,
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
              fontSize: 28,
              fontWeight: 600,
              color: PALETTE.inkSoft,
              maxWidth: 820,
              lineHeight: 1.3,
            }}
          >
            <span style={{ display: "flex" }}>
              {responderName
                ? `${total} questions civiques sourcées. La discussion peut commencer.`
                : `${total} questions civiques sourcées. Joue, on compare ensuite.`}
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
