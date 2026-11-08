/// Identité dans un défi : on évite d'exposer les clientId raw (UUID stable
/// par navigateur) dans les réponses publiques de l'API, sinon un tiers
/// peut corréler les défis créés par un même militant ou la participation
/// d'un même ami à plusieurs défis. À la place, on expose des "tags" :
///
///   tag = sha256(`${shortCode}:${clientId}`) tronqué à 16 bytes hex.
///
/// Salé par le shortCode du défi, donc le même clientId produit un tag
/// différent pour chaque défi. Pas de corrélation cross-défi possible.
/// Tronqué à 16 hex (64 bits) car le défi a au plus N=O(10) réponses :
/// la résistance aux collisions est confortable, et ça allège le payload.
///
/// Utilisable côté serveur (Node `crypto.createHash`) et côté client
/// (`crypto.subtle.digest` async). Les deux exposent une API distincte
/// car le serveur n'a pas accès à SubtleCrypto en runtime Edge.

const TAG_LENGTH = 16; // 64 bits hex, suffisant pour ce nombre d'identités

export async function computeIdentityTagClient(
  shortCode: string,
  clientId: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${shortCode}:${clientId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, TAG_LENGTH);
}
