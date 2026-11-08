import { notFound } from "next/navigation";
import { findPublishedBySlug } from "@/lib/content";
import { slugForQuestion } from "@/lib/question-slug";
import { QuestionPlayClient } from "./question-play-client";

/// Page publique d'une question — `/q/[slug]`.
/// Friction zéro : pas de compte, pas d'install prompt. Le visiteur joue la
/// question puis voit le reveal. Modèle calé sur `/d/[shortCode]` (le défi).
///
/// Stratégie de cache : 5 minutes. Le contenu des questions change peu en
/// prod (publication via admin), et la latence de re-validation après une
/// édition est acceptable.
export const revalidate = 300;

/// Slug → question publiée : slug court en base, ou auto-slug des anciens
/// liens. Résolu dans le catalogue en mémoire (cf. content.ts), et un slug
/// mal formé est refusé d'emblée.
const resolveSlug = findPublishedBySlug;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const q = await resolveSlug(slug);
  if (!q) return { title: "Question" };
  // Pas de « · Mon2027 » ici : le modèle de titre du layout l'ajoute déjà
  // (on obtenait « … · Mon2027 · Mon2027 »).
  const title = q.question;
  // Description sans la réponse (un aperçu de lien ne doit pas divulgâcher
  // le quiz), mais propre à la question via son thème.
  const description = `Thème ${q.theme} : devine, puis découvre le chiffre réel et ses sources publiques.`;
  // OpenGraph + Twitter Card : améliore le rendu dans les apps de
  // messagerie (WhatsApp, Signal, Telegram) et sur les réseaux. L'image
  // est générée par opengraph-image.tsx au niveau /q/[slug] (override de
  // l'OG racine) — preview avec le texte EXACT de la question et son thème.
  return {
    title,
    description,
    // Canonical = slug canonique de la question, pas celui demandé (un ancien
    // slug auto-généré pointerait sinon vers lui-même).
    alternates: { canonical: `/q/${slugForQuestion(q)}` },
    openGraph: {
      title,
      description,
      type: "article",
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

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const q = await resolveSlug(slug);
  if (!q) notFound();
  // Canonicalise le slug : si l'utilisateur arrive sur une variante (ex avec
  // espaces ou casse), la page rend mais le client component référencera le
  // slug propre.
  const canonicalSlug = slugForQuestion(q);
  return <QuestionPlayClient question={q} slug={canonicalSlug} />;
}
