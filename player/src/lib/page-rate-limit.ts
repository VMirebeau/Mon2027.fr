import "server-only";
import { headers } from "next/headers";
import { getClientIp, LIMITS, rateLimit } from "./rate-limit";

/// Limite par IP pour les PAGES qui révèlent si un code existe (/d/…) :
/// sans elle, on pouvait balayer l'espace des codes de défi (seule l'API
/// était limitée) et récolter les prénoms affichés sur les résultats.
/// Retourne false si la limite est dépassée : la page répond alors 404,
/// sans distinguer « inconnu » de « trop de requêtes ».
export async function pageRateLimitOk(scope: string): Promise<boolean> {
  const ip = getClientIp(await headers());
  return rateLimit(`page:${scope}:ip:${ip}`, LIMITS.defiPagesPerIp).ok;
}

/// Limite par IP pour les images d'aperçu générées à la volée (Satori +
/// resvg, coûteuses en CPU) dont l'adresse n'est pas bornée (portraits).
/// Large : les robots des messageries passent par peu d'adresses.
export async function ogImageRateLimitOk(): Promise<boolean> {
  const ip = getClientIp(await headers());
  return rateLimit(`og:ip:${ip}`, LIMITS.ogImagesPerIp).ok;
}
