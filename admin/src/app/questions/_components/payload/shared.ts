/// Briques communes aux éditeurs de « Réponse attendue » : lecture du JSON
/// enregistré, reconstruction à l'identique, identifiants internes.
///
/// Principe de l'aller-retour (JSON enregistré → éditeur → JSON envoyé) :
/// - un champ que la personne n'a pas modifié est réécrit avec sa valeur
///   d'origine, telle quelle (même type, même texte) ;
/// - les clés que l'éditeur ne connaît pas sont recopiées, à leur place ;
/// - l'ordre des clés d'origine est conservé.
/// Une question ouverte puis enregistrée sans modification produit donc
/// exactement la même chaîne JSON. C'est important : la chaîne entre dans
/// l'empreinte du contenu (lib/content-hash), et une empreinte qui change
/// rend caduques les validations déjà données.
///
/// Source de vérité sur les noms de champs et leurs alias : `mapVariant`
/// dans player/src/lib/content.ts.

export type Obj = Record<string, unknown>;

/// Valeur sentinelle : « ne pas écrire cette clé ».
export const OMIT: unique symbol = Symbol("omit");

export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function hasOwn(o: Obj | undefined, k: string): boolean {
  return o !== undefined && Object.prototype.hasOwnProperty.call(o, k);
}

export type ParsedPayload =
  | { status: "empty"; obj: null }
  | { status: "ok"; obj: Obj }
  | { status: "invalid"; obj: null; raw: string };

export function parsePayload(s: string | null | undefined): ParsedPayload {
  if (s == null || s.trim() === "") return { status: "empty", obj: null };
  try {
    const v: unknown = JSON.parse(s);
    return isObj(v) ? { status: "ok", obj: v } : { status: "invalid", obj: null, raw: s };
  } catch {
    return { status: "invalid", obj: null, raw: s };
  }
}

/// Écrit une clé, y compris « __proto__ » (que JSON.parse crée comme clé
/// ordinaire et qu'une affectation simple transformerait en prototype).
function put(out: Obj, k: string, v: unknown) {
  Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
}

/// Reconstruit un objet : clés d'origine dans leur ordre (valeur connue ou
/// recopiée telle quelle), puis les clés connues absentes de l'origine.
/// Une valeur OMIT retire la clé.
export function rebuild(orig: Obj | undefined, known: ReadonlyArray<readonly [string, unknown]>): Obj {
  const out: Obj = {};
  const map = new Map<string, unknown>(known);
  if (orig) {
    for (const k of Object.keys(orig)) {
      if (map.has(k)) {
        const v = map.get(k);
        if (v !== OMIT) put(out, k, v);
      } else {
        put(out, k, orig[k]);
      }
    }
  }
  for (const [k, v] of known) {
    if (!hasOwn(orig, k) && v !== OMIT) put(out, k, v);
  }
  return out;
}

/// Clés d'origine que l'éditeur ne lit pas (conservées telles quelles).
export function unknownKeys(orig: Obj | undefined, used: Iterable<string>): string[] {
  if (!orig) return [];
  const set = new Set(used);
  return Object.keys(orig).filter((k) => !set.has(k));
}

/// Texte affiché dans un champ pour une valeur enregistrée.
export function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/// Première clé (dans l'ordre de lecture du player) qui porte une valeur ;
/// à défaut, la clé canonique. On réécrit sous la clé lue : pas de renommage.
export function aliasKey(
  orig: Obj | undefined,
  keys: readonly string[],
  accept: (v: unknown) => boolean = (v) => v !== null && v !== undefined,
): string {
  if (orig) for (const k of keys) if (hasOwn(orig, k) && accept(orig[k])) return k;
  return keys[0];
}

const NUMBER_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;

/// Nombre saisi à la française ou non : « 12,5 », « 12.5 », « 1 000 ».
/// null si vide ou illisible.
export function parseNumber(text: string): number | null {
  const t = text.replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "" || !NUMBER_RE.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/// Champ texte. `init` : texte lu à l'ouverture (undefined pour un nouvel
/// élément). Inchangé → valeur d'origine telle quelle ; sinon texte nettoyé,
/// et un champ facultatif vidé disparaît.
export function outText(
  text: string,
  init: string | undefined,
  orig: Obj | undefined,
  key: string,
  optional: boolean,
): unknown {
  if (init !== undefined && text === init) return hasOwn(orig, key) ? orig![key] : OMIT;
  const t = text.trim();
  return t === "" && optional ? OMIT : t;
}

/// Champ numérique saisi en texte. Illisible ou vide → clé absente (le
/// message d'erreur de l'éditeur le signale).
export function outNum(text: string, init: string | undefined, orig: Obj | undefined, key: string): unknown {
  if (init !== undefined && text === init) return hasOwn(orig, key) ? orig![key] : OMIT;
  const n = parseNumber(text);
  return n === null ? OMIT : n;
}

export function outBool(
  v: boolean | null,
  init: boolean | null | undefined,
  orig: Obj | undefined,
  key: string,
): unknown {
  if (init !== undefined && v === init) return hasOwn(orig, key) ? orig![key] : OMIT;
  return v === null ? OMIT : v;
}

// ---------------------------------------------------------------------------
// Éléments de liste et identifiants
// ---------------------------------------------------------------------------

/// Élément d'une liste éditable (affirmation, étiquette, catégorie…).
/// `raw` et `init` sont figés à l'ouverture ; seul `f` change.
export type Row<F> = {
  /// Clé React, propre à la session (jamais enregistrée).
  key: string;
  /// Identifiant interne lu par le player : explicite (clé `id`) ou implicite
  /// (dérivé de la position d'origine, comme le fait le player).
  id: string;
  explicitId: boolean;
  /// Élément d'origine tel qu'enregistré ; undefined pour un nouvel élément.
  raw?: unknown;
  /// Champs tels que lus à l'ouverture ; undefined pour un nouvel élément.
  init?: F;
  f: F;
};

export function rowOrig<F>(row: Row<F>): Obj | undefined {
  return isObj(row.raw) ? row.raw : undefined;
}

export function readId(raw: unknown, fallback: string): { id: string; explicitId: boolean } {
  if (isObj(raw) && typeof raw.id === "string") return { id: raw.id, explicitId: true };
  return { id: fallback, explicitId: false };
}

/// Entrée `id` à écrire. Un identifiant implicite reste implicite tant que
/// l'élément garde sa position ; s'il bouge, on l'écrit explicitement pour
/// que le player continue de le voir sous le même identifiant.
export function idEntry(row: Row<unknown>, index: number, prefix: string): Array<[string, unknown]> {
  if (row.explicitId) return [["id", row.id]];
  if (row.id === `${prefix}${index}`) return [];
  return [["id", row.id]];
}

/// Élément d'origine qui n'est pas un objet (donnée inattendue) : recopié
/// tel quel tant que rien n'y a été modifié.
export function keepRaw<F extends object>(row: Row<F>, index: number, prefix: string): boolean {
  return (
    row.raw !== undefined &&
    !isObj(row.raw) &&
    !row.explicitId &&
    row.id === `${prefix}${index}` &&
    sameFields(row.f, row.init)
  );
}

export function sameFields<F extends object>(a: F, b: F | undefined): boolean {
  if (!b) return false;
  for (const k of Object.keys(a) as (keyof F)[]) if (a[k] !== b[k]) return false;
  return true;
}

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7).padEnd(5, "0");
}

/// Identifiant d'un élément ajouté pendant la session. Aléatoire plutôt que
/// séquentiel : un identifiant supprimé lors d'une session précédente ne doit
/// pas être réattribué à un autre élément (les réponses et les statistiques
/// des joueurs y font référence).
export function newId(prefix: string, taken: ReadonlySet<string>, rand: () => string = randomSuffix): string {
  for (let i = 0; i < 20; i++) {
    const id = `${prefix}-${rand()}`;
    if (!taken.has(id)) return id;
  }
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/// Identifiants des éléments d'une nouvelle question (aucun historique).
export function defaultId(prefix: string, i: number): string {
  return `${prefix}${i + 1}`;
}

/// État commun aux listes : identifiants déjà vus (origine + session), à ne
/// jamais réattribuer.
export function takenIds(reserved: readonly string[], rows: ReadonlyArray<Row<unknown>>): Set<string> {
  return new Set([...reserved, ...rows.map((r) => r.id)]);
}

export function moveAt<T>(arr: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= arr.length || j < 0 || j >= arr.length) return [...arr];
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function updateRow<R extends { key: string; f: object }>(rows: readonly R[], key: string, patch: Partial<R["f"]>): R[] {
  return rows.map((r) => (r.key === key ? { ...r, f: { ...r.f, ...patch } } : r));
}

export function newRow<F>(prefix: string, reserved: readonly string[], rows: ReadonlyArray<Row<F>>, f: F, rand?: () => string): {
  row: Row<F>;
  reserved: string[];
} {
  const id = newId(prefix, takenIds(reserved, rows as ReadonlyArray<Row<unknown>>), rand);
  return { row: { key: `n:${id}`, id, explicitId: true, f }, reserved: [...reserved, id] };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type Issue = {
  level: "error" | "warning";
  /// Où l'afficher : `top.<champ>`, `<cléDeLigne>.<champ>`, `list.<nom>`.
  at: string;
  message: string;
  /// Champ simplement pas encore rempli : affiché seulement une fois la
  /// ligne touchée ou après une tentative d'enregistrement.
  missing?: boolean;
};

export function issuesAt(issues: readonly Issue[], at: string): Issue[] {
  return issues.filter((i) => i.at === at);
}

/// Formate un nombre pour un message (virgule décimale).
export function fmtNum(n: number): string {
  return String(n).replace(".", ",");
}

export function isMultiple(v: number, step: number): boolean {
  if (step <= 0) return true;
  const q = v / step;
  return Math.abs(q - Math.round(q)) < 1e-9;
}

/// Couleurs proposées pour les étiquettes (curseur_multi) et les parts
/// (pondere) : valeurs CSS du player, avec leur rendu pour l'aperçu admin.
export const COLOR_OPTIONS: ReadonlyArray<{ value: string; label: string; swatch: string }> = [
  { value: "#7BB069", label: "Vert", swatch: "#7BB069" },
  { value: "var(--coral)", label: "Corail", swatch: "#FF6B6B" },
  { value: "var(--plum)", label: "Prune", swatch: "#6B4E8F" },
  { value: "var(--teal)", label: "Turquoise", swatch: "#4ECDC4" },
  { value: "var(--yellow)", label: "Jaune", swatch: "#FFC845" },
  { value: "var(--ink-mute)", label: "Gris", swatch: "#66635B" },
];

export function swatchOf(color: string): string {
  return COLOR_OPTIONS.find((c) => c.value === color)?.swatch ?? color;
}
