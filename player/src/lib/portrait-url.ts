/// Encodage/décodage du portrait civique dans une URL partageable.
///
/// Format de l'URL : `/p/{code}` où code est une chaîne courte qui encode
/// les 9 scores d'indicateurs + le score Lucidité calculé côté player +
/// le nombre d'axes effectivement mesurés. Pas d'auth, pas de DB : le code
/// EST la donnée.
///
/// Stratégie d'encoding (compact, URL-safe) :
///   - Chaque score ∈ [-1, +1] → entier 0..63 via (score+1)/2 * 63
///   - 64 valeurs par axe → 1 caractère base64-url chacun (alphabet
///     ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_)
///   - 9 axes = 9 chars + 1 char view (m/c/b) + 1 char lucidity (0-63
///     mappé à 0-100 → précision ±1) + 1 char measuredCount (0-9, encodé
///     directement dans l'alphabet) = **12 chars**.
///
/// Pourquoi encoder lucidity+measuredCount alors qu'on pourrait recalculer ?
/// Sans ces deux champs, l'OG ne peut pas distinguer "axe juste (score=0)"
/// de "axe non mesuré (par défaut 0)". Du coup le score calculé OG-side
/// diverge du score affiché in-app (l'in-app filtre les axes non mesurés).
/// En encodant le score canonique, on garantit zéro divergence entre
/// l'affichage de la page Indicateurs et l'image OG partagée.
///
/// Backward compat : on tolère les codes de 10 chars (ancienne version)
/// — dans ce cas lucidity/measuredCount sont null, le caller doit
/// recomputer ou afficher dégradé.

import { INDICATOR_IDS, type IndicatorId } from "./indicators";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Encode un score [-1, +1] vers un char unique de l'alphabet base64-url.
/// Hors range → clamp avant encoding.
function encodeScore(score: number): string {
  const norm = Math.max(0, Math.min(1, (score + 1) / 2));
  const idx = Math.round(norm * 63);
  return ALPHABET[idx];
}

/// Inverse : char → score [-1, +1]. Char inconnu → 0 (juste).
function decodeScore(char: string): number {
  const idx = ALPHABET.indexOf(char);
  if (idx < 0) return 0;
  return (idx / 63) * 2 - 1;
}

export type PortraitView = "me" | "community" | "both";
const VIEW_FLAGS: Record<PortraitView, string> = {
  me: "m",
  community: "c",
  both: "b",
};
function decodeViewFlag(c: string): PortraitView {
  if (c === "c") return "community";
  if (c === "b") return "both";
  return "me";
}

export type PortraitCodePayload = {
  /// Score par indicateur, dans l'ordre canonique INDICATOR_IDS.
  scores: Record<IndicatorId, number>;
  /// Mode d'affichage du radar lors de l'export.
  view: PortraitView;
  /// Score Lucidité calculé côté player (0-100) — encodé pour éviter la
  /// divergence avec l'OG. null pour les codes legacy 10 chars (caller
  /// doit retomber sur un recalcul approximatif).
  lucidity: number | null;
  /// Nombre d'axes effectivement mesurés (≥ seuil) — affiché à côté
  /// du score pour honnêteté. null pour les codes legacy.
  measuredCount: number | null;
};

/// Encode un score 0-100 sur 1 char de l'alphabet (64 valeurs → mapping
/// `idx = round(score / 100 * 63)`, perte de précision ±1 acceptable).
function encodeLucidity(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  return ALPHABET[Math.round((clamped / 100) * 63)];
}
function decodeLucidity(char: string): number {
  const idx = ALPHABET.indexOf(char);
  if (idx < 0) return 0;
  return Math.round((idx / 63) * 100);
}

/// Encode 0-9 sur 1 char (les 10 premiers de l'alphabet). Au-delà de 9,
/// on cappe à 9 (il n'y a que 9 indicateurs dans la taxonomie).
function encodeMeasuredCount(n: number): string {
  return ALPHABET[Math.max(0, Math.min(9, n))];
}
function decodeMeasuredCount(char: string): number {
  const idx = ALPHABET.indexOf(char);
  return idx < 0 ? 0 : Math.min(9, idx);
}

const CODE_LENGTH_LEGACY = INDICATOR_IDS.length + 1; // 10 — 9 scores + view
const CODE_LENGTH_CURRENT = CODE_LENGTH_LEGACY + 2; // 12 — + lucidity + measuredCount

/// Encode un payload en code URL-safe de longueur fixe (12 chars).
export function encodePortraitCode(payload: PortraitCodePayload): string {
  const scoresChars = INDICATOR_IDS.map((id) =>
    encodeScore(payload.scores[id] ?? 0),
  ).join("");
  const view = VIEW_FLAGS[payload.view];
  const lucidity = encodeLucidity(payload.lucidity ?? 0);
  const measured = encodeMeasuredCount(payload.measuredCount ?? 0);
  return scoresChars + view + lucidity + measured;
}

/// Décode un code URL en payload. Tolère les codes corrompus (chars
/// invalides → score 0) et les codes legacy 10 chars (lucidity et
/// measuredCount à null, caller doit gérer).
export function decodePortraitCode(
  code: string,
): PortraitCodePayload | null {
  if (typeof code !== "string") return null;
  const isLegacy = code.length === CODE_LENGTH_LEGACY;
  const isCurrent = code.length === CODE_LENGTH_CURRENT;
  if (!isLegacy && !isCurrent) return null;
  const scores = {} as Record<IndicatorId, number>;
  for (let i = 0; i < INDICATOR_IDS.length; i++) {
    scores[INDICATOR_IDS[i]] = decodeScore(code[i]);
  }
  const view = decodeViewFlag(code[INDICATOR_IDS.length]);
  if (isLegacy) {
    return { scores, view, lucidity: null, measuredCount: null };
  }
  const lucidity = decodeLucidity(code[INDICATOR_IDS.length + 1]);
  const measuredCount = decodeMeasuredCount(code[INDICATOR_IDS.length + 2]);
  // Convention : measuredCount = 0 signifie "pas de lucidity significative"
  // (le caller a passé null car pas assez d'indicateurs mesurés ; null est
  // encodé comme 0). On retourne null dans ce cas pour permettre un
  // affichage conditionnel ("—" plutôt qu'un faux 0/100).
  if (measuredCount === 0) {
    return { scores, view, lucidity: null, measuredCount: null };
  }
  return { scores, view, lucidity, measuredCount };
}

/// Vrai si le code est exactement celui que produit l'encodeur pour son
/// propre contenu. Le décodeur tolère les caractères invalides (lus comme 0),
/// si bien qu'une infinité de variantes donnaient le même portrait : autant
/// d'URL distinctes à rendre (image d'aperçu coûteuse). Les pages /p/…
/// n'acceptent donc que la forme canonique. Les anciens codes à 10
/// caractères restent acceptés s'ils sont canoniques sur ces 10 caractères.
export function isCanonicalPortraitCode(code: string): boolean {
  const payload = decodePortraitCode(code);
  if (!payload) return false;
  const encoded = encodePortraitCode(payload);
  return code.length === CODE_LENGTH_LEGACY
    ? encoded.slice(0, CODE_LENGTH_LEGACY) === code
    : encoded === code;
}

/// Compose l'URL absolue de partage à partir du payload. Utilise
/// window.location.origin si dispo (client), sinon "" pour un path relatif.
export function buildPortraitShareUrl(payload: PortraitCodePayload): string {
  const code = encodePortraitCode(payload);
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  return `${origin}/p/${code}`;
}
