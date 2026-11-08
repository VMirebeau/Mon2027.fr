import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/brand-icon";
import { findPublishedBySlug } from "@/lib/content";

/// Image OpenGraph dynamique pour `/q/[slug]`. Quand quelqu'un partage le
/// lien d'une question via WhatsApp / Signal / Telegram / Bluesky, le
/// preview affiche le texte de LA question (pas le wording générique de
/// l'OG racine), avec le thème en éyebrow et une accroche "Et toi ?" qui
/// fait écho à l'éditorialisation "pas un score, une cartographie".
///
/// Le rendu est mis en cache par Next.js par slug, donc on ne paye le coût
/// qu'à la première requête de chaque question partagée. La page parente
/// est en `revalidate: 300` (cf. q/[slug]/page.tsx), même TTL ici.

export const alt = "Une question civique sourcée sur Mon2027";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/// Mêmes couleurs que le reste de l'app (cf. globals.css). On hardcode parce
/// que next/og ne lit pas les CSS variables — il rend une image avec un
/// sous-ensemble CSS strict.
const PALETTE = {
  cream: "#F5EFE2",
  paper: "#FAF5E6",
  ink: "#1A1A1A",
  inkSoft: "#4A4A4A",
  inkMute: "#7A7670",
  coral: "#E0625F",
  yellow: "#FFC845",
};

/// Tronque proprement à la fin d'un mot. Permet de garder un texte lisible
/// quand la question dépasse la zone d'affichage (rare, mais ça arrive).
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

const resolveSlug = findPublishedBySlug;

export default async function QuestionOG({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const q = await resolveSlug(slug);
  if (!q) notFound();

  /// Adapte la taille de la question selon sa longueur. Pour les questions
  /// très longues (>180 chars, surtout les V/F multi et les classement),
  /// on descend à 44px pour ne pas overflow.
  const text = truncate(q.question, 220);
  const fontSize = text.length > 180 ? 44 : text.length > 110 ? 54 : 64;

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
            <span>Mon&nbsp;</span>
            <span style={{ color: PALETTE.coral }}>2027</span>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 16,
              color: PALETTE.inkMute,
              letterSpacing: 1,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            <span style={{ display: "flex" }}>Civique · Non-partisan · Sourcé</span>
          </div>
        </div>

        {/* Theme eyebrow */}
        <div
          style={{
            marginTop: 56,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 18px",
              borderRadius: 99,
              background: PALETTE.yellow,
              color: PALETTE.ink,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            <span style={{ display: "flex" }}>{q.theme}</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: PALETTE.inkMute,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            <span style={{ display: "flex" }}>Question</span>
          </div>
        </div>

        {/* Question text */}
        <div
          style={{
            marginTop: 28,
            fontSize,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            color: PALETTE.ink,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex" }}>{text}</span>
        </div>

        {/* Spacer + footer */}
        <div style={{ flex: 1, display: "flex" }} />
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
              maxWidth: 760,
              lineHeight: 1.25,
            }}
          >
            <span style={{ display: "flex" }}>
              Et toi, tu pensais quoi ?{" "}
              <span style={{ color: PALETTE.coral, marginLeft: 8 }}>
                Joue, vérifie.
              </span>
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
