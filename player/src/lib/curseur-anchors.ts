import type { CurseurMultiQuestion } from "./types";

/// Repères des questions « Placer sur une échelle » (curseur_multi).
///
/// Ces questions superposent deux difficultés : situer l'échelle dans son
/// ensemble (où tombent les valeurs) et ordonner les étiquettes entre elles.
/// La seconde est la plus intéressante (choix du 2026-11-07) : on place donc
/// d'office ~25 % des étiquettes à leur vraie position, comme points de
/// repère. Le joueur n'a plus à deviner l'échelle à l'aveugle et se concentre
/// sur l'ordre et les écarts relatifs.
///
/// Règle : floor(n / 4) repères (au moins 1 dès 4 étiquettes ; aucun en
/// dessous, il ne resterait presque rien à placer), répartis dans la plage
/// des vraies valeurs en évitant les extrêmes (placer le minimum et le
/// maximum donnerait l'essentiel de la réponse). Avec un seul repère :
/// l'étiquette du milieu. Déterministe : même question → mêmes repères, sur
/// tous les écrans et côté serveur.
///
/// Les repères sont exclus du score (isCorrect), du portrait (contributionFor)
/// et de la réponse envoyée : leur placement « parfait » fausserait tout.
export function anchorIdsFor(q: Pick<CurseurMultiQuestion, "items">): Set<string> {
  const n = q.items.length;
  const k = n >= 4 ? Math.floor(n / 4) : 0;
  if (k === 0) return new Set();
  const sorted = [...q.items].sort((a, b) => a.real - b.real || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set<string>();
  for (let j = 0; j < k; j++) ids.add(sorted[Math.floor(((j + 0.5) * n) / k)].id);
  return ids;
}

/// Étiquettes que le joueur doit placer lui-même (hors repères).
export function scoredItems(q: Pick<CurseurMultiQuestion, "items">): CurseurMultiQuestion["items"] {
  const anchors = anchorIdsFor(q);
  return q.items.filter((it) => !anchors.has(it.id));
}
