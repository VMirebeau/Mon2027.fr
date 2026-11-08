import { headers } from "next/headers";
import { redirect } from "next/navigation";

/// redirect() compatible avec le basePath (/admin en prod).
///
/// Contournement d'un bug de Next 16.2.6 : depuis une server action,
/// `redirect("/compte")` renvoie au navigateur l'URL SANS basePath ; quand
/// Next se rabat sur une navigation complète, on atterrit sur
/// mon2027.fr/compte (404, ou pire : l'app publique). Constaté en test le
/// 2026-11-07 après une connexion.
///
/// Parade : rediriger vers l'URL absolue, basePath compris, construite depuis
/// l'en-tête Origin (envoyé par le navigateur avec chaque server action).
/// Next reconnaît alors une redirection interne — même hôte, sous le
/// basePath — et la traite correctement dans tous les cas. Sans Origin (rendu
/// de page classique, où redirect() fonctionne déjà), chemin relatif.
export async function appRedirect(path: string): Promise<never> {
  const origin = (await headers()).get("origin");
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) {
    redirect(`${origin}${process.env.NEXT_BASE_PATH ?? ""}${path}`);
  }
  redirect(path);
}
