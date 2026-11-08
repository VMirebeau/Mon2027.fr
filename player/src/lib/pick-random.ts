/// Pioche aléatoire d'éléments. Utilisé pour :
///   - AppShell.playRandomFive : tirage de 5 questions parmi toutes publiées
///   - DefiCreate.pickTheme : tirage de 5 questions parmi un sous-ensemble
///
/// `Math.random` est volontairement utilisé (vs. crypto.getRandomValues) :
/// la distribution n'a pas besoin d'être cryptographiquement uniforme — c'est
/// du choix UX, pas du tirage au sort sensible. Si le tirage devient sensible
/// un jour (ex. concours, distribution d'avantages), passer à Fisher-Yates +
/// CSPRNG.

export function pickRandom<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  const shuffled = items.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/// Tirage aléatoire qui épuise d'abord les items non encore "consommés"
/// avant de retomber sur les autres. Usage : jouer en priorité les
/// questions auxquelles l'utilisateur n'a pas encore répondu — on ne
/// rejoue une question déjà connue que si le pool de neuves est vide.
/// L'ordre intra-groupe est aléatoire dans les deux groupes.
export function pickRandomPreferUnseen<T>(
  items: readonly T[],
  count: number,
  isSeen: (item: T) => boolean,
): T[] {
  if (count <= 0 || items.length === 0) return [];
  const unseen: T[] = [];
  const seen: T[] = [];
  for (const it of items) (isSeen(it) ? seen : unseen).push(it);
  const shuffle = (arr: T[]) => arr.sort(() => Math.random() - 0.5);
  const ordered = [...shuffle(unseen), ...shuffle(seen)];
  return ordered.slice(0, Math.min(count, ordered.length));
}

/// Variante "adaptative" qui pondère les questions par difficulté en
/// fonction du niveau du joueur (gamification rank 1..10) :
///   - Débutant  (rank ≤3)  : favorise ★1-2, démot ★4-5
///   - Intermédiaire (4..7) : favorise ★3 (bell-shaped centré)
///   - Expert    (≥8)       : favorise ★4-5, démot ★1-2
///
/// La préférence "unseen first" est conservée comme dans
/// `pickRandomPreferUnseen`. À l'intérieur de chaque groupe (unseen / seen),
/// on utilise un Efraimidis-Spirakis weighted sampling : `key = U^(1/w)`,
/// on garde les `count` plus grandes clés. Donne un échantillonnage
/// pondéré sans remise en O(n log n).
///
/// Si `level` est inconnu (hydratation pas finie côté client), passer 5
/// pour un comportement neutre proche du shuffle uniforme.
export function pickRandomByLevel<T>(
  items: readonly T[],
  count: number,
  isSeen: (item: T) => boolean,
  difficultyOf: (item: T) => number,
  level: number,
): T[] {
  if (count <= 0 || items.length === 0) return [];
  const unseen: T[] = [];
  const seen: T[] = [];
  for (const it of items) (isSeen(it) ? seen : unseen).push(it);
  const weightOf = (it: T) => weightForLevel(difficultyOf(it), level);
  const ordered = [
    ...weightedShuffle(unseen, weightOf),
    ...weightedShuffle(seen, weightOf),
  ];
  return ordered.slice(0, Math.min(count, ordered.length));
}

function weightForLevel(d: number, level: number): number {
  // Clamp niveau et difficulté pour éviter les valeurs hors-range qui
  // tomberaient toutes sur le poids minimum (0.5) et brouilleraient
  // l'échantillonnage.
  const lv = Math.max(1, Math.min(10, level));
  const diff = Math.max(1, Math.min(5, Math.round(d)));
  if (lv <= 3) {
    // Débutant : courbe descendante 4→0.5
    return [4, 3, 2, 1, 0.5][diff - 1];
  }
  if (lv >= 8) {
    // Expert : courbe ascendante 0.5→4
    return [0.5, 1, 2, 3, 4][diff - 1];
  }
  // Intermédiaire : cloche centrée sur ★3
  return [1, 2, 3, 2, 1][diff - 1];
}

function weightedShuffle<T>(items: T[], weightOf: (item: T) => number): T[] {
  // Efraimidis-Spirakis : clé = U^(1/w), tri décroissant. Garantit un tirage
  // pondéré sans remise. `Math.max(0.001, …)` pour éviter `1/0` au cas où.
  return items
    .map((item) => {
      const w = Math.max(0.001, weightOf(item));
      const u = Math.random();
      // u^(1/w) — on prend log pour éviter underflow sur grands w.
      const key = Math.log(u) / w;
      return { item, key };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}
