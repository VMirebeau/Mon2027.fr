import { createHash } from "node:crypto";

/// Empreinte et diff du contenu d'une question.
///
/// ⚠️ Implémentation jumelle dans scripts/content-sync.cjs (exécuté en prod
/// hors de Next). Les deux DOIVENT produire les mêmes empreintes : le test
/// content-hash.test.ts le vérifie. Toute modification se fait des deux côtés.

/// Champs qui définissent le *contenu* d'une question : une validation porte
/// sur eux. Exclus volontairement : statut, auteur, valideurs, dates — les
/// changer ne rend pas une validation caduque.
export const CONTENT_FIELDS = [
  "customId",
  "slug",
  "theme",
  "sousTheme",
  "format",
  "sensibilite",
  "difficulte",
  "question",
  "precisions",
  "explication",
  "contextePedagogique",
  "miseEnPerspective",
  "indicators",
  "unite",
  "plageMin",
  "plageMax",
  "reponseNumerique",
  "toleranceVerte",
  "toleranceOrange",
  "payload",
  "dateDonnee",
] as const;

/// Champs suivis par l'historique (contenu + méta éditoriale).
export const TRACKED_FIELDS = [...CONTENT_FIELDS, "statut", "auteur"] as const;

export type SourceLike = { nom: string; url: string; type: string; ordre: number };
type Row = Record<string, unknown>;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/// Tri par ordre puis URL, en comparaison binaire (pas localeCompare, qui
/// dépend de la locale et pourrait différer entre deux environnements).
function canonicalSources(sources: readonly SourceLike[]): [string, string, string, number][] {
  return sources
    .map((s): [string, string, string, number] => [s.nom, s.url, s.type, s.ordre])
    .sort((a, b) => a[3] - b[3] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

export function contentHash(q: Row, sources: readonly SourceLike[]): string {
  const values = CONTENT_FIELDS.map((f) => q[f] ?? null);
  return sha256(JSON.stringify([values, canonicalSources(sources)]));
}

/// Empreinte contenu + statut : sert à la synchro local ↔ prod, où le statut
/// local voyage avec le contenu.
export function stateHash(q: Row, sources: readonly SourceLike[]): string {
  return sha256(`${contentHash(q, sources)}|${String(q.statut ?? "")}`);
}

export type Changes = Record<string, [unknown, unknown]>;

/// Champs modifiés entre deux versions : `{ champ: [avant, après] }`.
export function diffQuestion(
  before: Row,
  beforeSources: readonly SourceLike[],
  after: Row,
  afterSources: readonly SourceLike[],
): Changes {
  const changes: Changes = {};
  for (const f of TRACKED_FIELDS) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (a !== b) changes[f] = [a, b];
  }
  const sa = canonicalSources(beforeSources);
  const sb = canonicalSources(afterSources);
  if (JSON.stringify(sa) !== JSON.stringify(sb)) {
    const toObj = ([nom, url, type]: [string, string, string, number]) => ({ nom, url, type });
    changes.sources = [sa.map(toObj), sb.map(toObj)];
  }
  return changes;
}

export function contentChanged(changes: Changes): boolean {
  return Object.keys(changes).some((k) => k !== "statut" && k !== "auteur");
}
