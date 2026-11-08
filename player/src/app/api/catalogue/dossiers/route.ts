import { NextResponse } from "next/server";
import { loadPublishedDossiers } from "@/lib/content";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/catalogue/dossiers — dossiers de toutes les questions publiées.
 *
 * La page d'accueil envoie le catalogue sans les dossiers (cf.
 * lib/question-dossier.ts) ; le navigateur les charge ici, une fois, en tâche
 * de fond. Réponse précalculée en mémoire (cf. content.ts), étiquetée par la
 * version du contenu : le navigateur la garde et revalide à chaque visite,
 * ce qui coûte un 304 de quelques octets tant que rien n'est publié.
 */
export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`dossiers:ip:${ip}`, LIMITS.dossiersPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  const { version, json } = await loadPublishedDossiers();
  const etag = `"${version}"`;
  const headers = {
    ETag: etag,
    // Toujours revalider (une publication doit se voir), mais garder la
    // copie : la revalidation est un simple 304.
    "Cache-Control": "public, no-cache",
  };
  const inm = req.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(json, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
