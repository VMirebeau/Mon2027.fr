/// UUID stable par navigateur, persisté en localStorage.
/// Sert d'identifiant pour le créateur d'un défi (creatorClientId) et pour
/// l'ami qui joue (amiClientId). Le même navigateur partage le même UUID
/// dans les deux rôles — la distinction se fait via le contexte (création
/// vs réponse à un défi d'autrui).
///
/// Pas de PII : un UUID v4 random sans info. SSR-safe : retourne null si
/// localStorage indisponible (n'écrit pas non plus, le caller gère le
/// pré-hydratation côté UI).

const STORAGE_KEY = "mon2027:clientId";

export function getOrCreateClientId(): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : fallbackUuid();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

function fallbackUuid(): string {
  // crypto.randomUUID est disponible partout en >=2022 mais on garde un
  // fallback minimal pour les vieux WebView sans crypto.subtle.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}
