import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { decodePortraitCode, isCanonicalPortraitCode } from "@/lib/portrait-url";
import { loadPublishedQuestions } from "@/lib/content";
import { withoutDossier } from "@/lib/question-dossier";
import { PortraitPageClient } from "./portrait-page-client";

export const dynamic = "force-dynamic";

/// Page partagée d'un portrait : reçoit un code de 10 chars en path,
/// décode les 9 scores d'indicateurs et rend un radar isolé + CTA
/// "Génère ton portrait".
///
/// Stateless : le code EST la donnée (cf. lib/portrait-url.ts). Pas
/// d'auth, pas de DB read, pas de tracking — juste un partage de
/// signature visuelle.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const payload = decodePortraitCode(code);
  if (!payload) {
    return {
      title: "Portrait Mon2027",
      robots: { index: false, follow: false },
      // Override le canonical global (`/`) pour ne pas faire pointer
      // les crawlers vers la home (sinon ils utilisent l'OG de la home).
      alternates: { canonical: `/p/${code}` },
    };
  }
  const title = "Un portrait civique Mon2027";
  const description =
    "Voici sur quoi cette personne sur ou sous-estime la réalité française. Et toi, sur quoi te trompes-tu ?";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    // CRITICAL : override le canonical global défini dans app/layout.tsx
    // (qui pointe vers "/"). Sans ça, Facebook/Twitter/LinkedIn suivent
    // le canonical "/" et utilisent l'OG de la home (générique Mon2027)
    // au lieu de l'OG dynamique de cette page (portrait personnalisé).
    alternates: { canonical: `/p/${code}` },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Mon2027",
      locale: "fr_FR",
      url: `/p/${code}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PortraitPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const payload = isCanonicalPortraitCode(code) ? decodePortraitCode(code) : null;
  if (!payload) notFound();
  // Questions chargées server-side pour permettre au client de calculer le
  // portrait du visiteur (s'il a déjà joué) et afficher la comparaison.
  // Sans leurs dossiers (explications, sources) : le calcul du portrait
  // n'utilise que les réponses et les indicateurs, et la page pèse ~3× moins.
  const questions = (await loadPublishedQuestions()).map(withoutDossier);
  return (
    <PortraitPageClient code={code} payload={payload} questions={questions} />
  );
}
