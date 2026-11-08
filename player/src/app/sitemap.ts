import type { MetadataRoute } from "next";
import { loadSitemapData } from "@/lib/content";
import { slugForQuestion } from "@/lib/question-slug";

/// sitemap.xml généré au build/runtime — convention Next 16.
///
/// Contient :
///   - la racine / (priorité max) ;
///   - toutes les questions publiées sous /q/[slug], datées de leur vraie
///     dernière modification (Google ignore un lastModified toujours égal à
///     « maintenant »).
///
/// N'y figurent pas :
///   - /?s=methode, /?s=apropos : leur canonical est « / » (écrans de l'app
///     monopage), les lister envoyait des signaux contradictoires ;
///   - les pages /d/[shortCode] et /p/[code] : contenus personnels, en
///     noindex.
///
/// Revalidation : 1 heure. Si tu publies plus de questions par jour,
/// baisser ce TTL pour que Google les voie plus vite.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mon2027.fr";
  const { questions, lastModified } = await loadSitemapData();

  return [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1.0,
    },
    ...questions.map(({ question, updatedAt }) => ({
      url: `${baseUrl}/q/${slugForQuestion(question)}`,
      lastModified: updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
