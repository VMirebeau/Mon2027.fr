import type { MetadataRoute } from "next";

/// robots.txt généré au build (convention Next 16 app router).
///
/// On veut être indexable : la viralité du quiz dépend du référencement
/// (pages /q/[slug] partagées sur les réseaux). Les défis privés
/// /d/[shortCode]/* ne doivent pas l'être : ils contiennent du contenu
/// associé à un militant et n'ont pas vocation à apparaître dans Google.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mon2027.fr";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/q/"],
        // /d/ n'est PAS bloqué : les robots de prévisualisation (Twitter,
        // LinkedIn) respectent robots.txt et ne pouvaient plus lire l'aperçu
        // des défis. Les pages de défi restent hors index via noindex.
        disallow: ["/api/", "/apercu/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
