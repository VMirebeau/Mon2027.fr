import { notFound } from "next/navigation";
import { loadDefi } from "@/lib/defi-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { DefiPlayClient } from "./defi-play-client";
import { pageRateLimitOk } from "@/lib/page-rate-limit";
import { defiTopicPhrase } from "@/lib/defi-topic";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/// Metadata enrichies par défi : on insère le pseudo du créateur dans le
/// titre pour personnaliser l'aperçu dans les apps de messagerie. OG +
/// Twitter Card utilisent l'image globale (cf. app/opengraph-image.tsx).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}): Promise<Metadata> {
  const { shortCode } = await params;
  // Méta uniquement (pseudo, total, themeLabel, title) → pas besoin de
  // remonter la table DefiResponse, qui pourrait grossir si le défi part.
  const defi = await loadDefi(shortCode, { includeResponses: false });
  // Titre OG/Twitter : injecte le titre libre du militant s'il existe, sinon
  // tombe sur le label thématique pour rester contextuel. Le pseudo reste
  // prioritaire dans le préfixe "Défi de X".
  // Défi multi-thèmes (themeId null) : « te défie sur Questions diverses »
  // sonnait faux, on annonce plutôt le nombre de questions.
  const title = defi
    ? defi.title
      ? `${defi.title} · Défi de ${defi.creatorPseudo}`
      : `${defi.creatorPseudo} te défie sur ${defiTopicPhrase(defi.themeLabel, defi.total)}`
    : "Un défi Mon2027";
  const description = defi
    ? `${defi.creatorPseudo} t'envoie ${defi.total} questions sourcées sur la France. Joue, compare vos réponses.`
    : "5 questions sourcées pour ouvrir une conversation citoyenne sur la France.";
  return {
    title,
    description,
    // Canonical propre au défi : sans lui, la page héritait du canonical
    // global « / » (même bug que celui corrigé sur /p). Hors index Google via
    // noindex (robots.txt ne bloque plus /d/, sinon Twitter/LinkedIn ne
    // pouvaient pas lire l'aperçu, et Google ne voyait pas le noindex).
    alternates: { canonical: `/d/${shortCode}` },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/d/${shortCode}`,
      type: "website",
      siteName: "Mon2027",
      locale: "fr_FR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function DefiPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  if (!(await pageRateLimitOk("defi"))) notFound();
  // Page de jeu (welcome + game session) : ne consomme pas le détail des
  // amis ayant joué — économise la jointure DefiResponse.
  // En parallèle on récupère l'utilisateur courant éventuel : s'il est
  // connecté à son compte Mon2027, on pré-remplira son prénom dans B1
  // plutôt que de lui redemander. Le compte reste *facultatif* — un visiteur
  // anonyme joue exactement comme avant.
  const [defi, currentUser] = await Promise.all([
    loadDefi(shortCode, { includeResponses: false }),
    getCurrentUser(),
  ]);
  if (!defi) {
    notFound();
  }
  return (
    <DefiPlayClient
      shortCode={defi.shortCode}
      creatorPseudo={defi.creatorPseudo}
      creatorLevelRank={defi.creatorLevelRank}
      creatorScore={defi.creatorScore}
      questions={defi.questions}
      total={defi.total}
      themeLabel={defi.themeLabel}
      themeId={defi.themeId}
      title={defi.title}
      stale={defi.stale}
      isExpired={defi.isExpired}
      currentUserPseudo={currentUser?.displayPseudo ?? null}
    />
  );
}
