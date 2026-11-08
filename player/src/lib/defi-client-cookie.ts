import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/// Cookie httpOnly qui lie le device à son `clientId` (UUID localStorage)
/// de façon vérifiable par le serveur.
///
/// Pourquoi : la page /d/[shortCode]/resultats doit décider d'exposer ou
/// non `creatorAnswers` et les réponses détaillées des autres répondeurs.
/// Sans preuve serveur que le visiteur EST le créateur (ou un répondeur),
/// n'importe quel porteur du lien public verrait ces données — ce qui est
/// une fuite de données politiques sensibles.
///
/// Le cookie contient `<clientId>.<hmac(clientId)>`. Le serveur calcule
/// le HMAC avec un secret d'env (DEFI_SIGN_SECRET) et compare. Pas de
/// rotation prévue : si le secret tourne, tous les cookies signés
/// expirent en bloc (les utilisateurs devront rejouer un défi pour
/// repouvoir consulter les résultats privés — pas dramatique).
///
/// Le cookie est posé au POST /api/defis (création) ou au POST
/// /api/defis/[shortCode]/responses (réponse). Persiste 90 jours.

const COOKIE_NAME = "mon2027_defi_client";
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

/// Flag interne pour ne logger le warning "secret manquant" qu'une fois
/// au boot, pas à chaque requête. Évite de spammer les logs prod en cas
/// d'oubli, tout en restant visible.
let warnedAboutMissingSecret = false;

function getSecret(): string {
  const s = process.env.DEFI_SIGN_SECRET;
  if (!s || s.length < 16) {
    // Fail-secure : pas de secret = pas de signature = on ne signe rien.
    // Le caller appelant `getDefiClientId()` retournera null et la page
    // se rabattra sur le rendu public (sans creatorAnswers détaillés).
    if (!warnedAboutMissingSecret) {
      warnedAboutMissingSecret = true;
      console.warn(
        "[defi-client-cookie] DEFI_SIGN_SECRET absent ou trop court (<16 chars). " +
          "Les pages de résultats de défi tombent sur le rendu public-only, " +
          "les visiteurs ne verront jamais les réponses détaillées du créateur. " +
          "Génère un secret avec : node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
    return "";
  }
  return s;
}

function sign(clientId: string, secret: string): string {
  return createHmac("sha256", secret).update(clientId).digest("base64url");
}

/// Pose le cookie `defi_client=<clientId>.<sig>` httpOnly sur la réponse
/// courante. Si le secret n'est pas configuré, ne fait rien (et silencieux).
export async function setDefiClientCookie(clientId: string): Promise<void> {
  const secret = getSecret();
  if (!secret) return;
  const sig = sign(clientId, secret);
  const c = await cookies();
  c.set(COOKIE_NAME, `${clientId}.${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

/// Lit le cookie et vérifie sa signature. Retourne le clientId si valide,
/// sinon `null` (cookie absent, mal formé, ou signature qui ne matche pas).
export async function getDefiClientId(): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const c = await cookies();
  const raw = c.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const sep = raw.lastIndexOf(".");
  if (sep < 0) return null;
  const clientId = raw.slice(0, sep);
  const sig = raw.slice(sep + 1);
  const expected = sign(clientId, secret);
  // Comparaison à temps constant. timingSafeEqual exige des Buffers de
  // même longueur — si les sig ne font pas la même taille on rejette
  // direct (pas de risque, sig est toujours base64url(sha256) = 43 chars).
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return clientId;
}
