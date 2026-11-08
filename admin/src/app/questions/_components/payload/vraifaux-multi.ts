/// « Plusieurs vrai/faux » (format `vraifaux_multi`).
///
/// { "affirmations": [ { "id", "texte", "vrai", "why"? } ] }
/// Alias lus par le player : texte|text, vrai|correct, why|pourquoi.
/// Identifiant implicite : `s<position>`.

import {
  aliasKey,
  defaultId,
  hasOwn,
  idEntry,
  isObj,
  newRow,
  keepRaw,
  outBool,
  outText,
  readId,
  rebuild,
  rowOrig,
  toText,
  unknownKeys,
  type Issue,
  type Obj,
  type Row,
} from "./shared";

export const VFM_MIN = 2;
export const VFM_ADVISED_MIN = 4;
export const VFM_ADVISED_MAX = 6;
const PREFIX = "s";

export type VfmFields = { texte: string; vrai: boolean | null; why: string };
export type VfmRow = Row<VfmFields> & { keys: { texte: string; vrai: string; why: string } };

export type VfmState = {
  orig: Obj | undefined;
  rows: VfmRow[];
  reserved: string[];
  /// Le JSON d'origine était celui d'un autre format (changement de format).
  foreign: boolean;
};

export function looksLikeVfm(o: Obj): boolean {
  return hasOwn(o, "affirmations");
}

function emptyFields(): VfmFields {
  return { texte: "", vrai: null, why: "" };
}

const DEFAULT_KEYS = { texte: "texte", vrai: "vrai", why: "why" };

export function parseVfm(obj: Obj | null): VfmState {
  if (!obj || !looksLikeVfm(obj)) {
    const rows: VfmRow[] = Array.from({ length: VFM_ADVISED_MIN }, (_, i) => ({
      key: `d${i}`,
      id: defaultId(PREFIX, i),
      explicitId: true,
      f: emptyFields(),
      keys: DEFAULT_KEYS,
    }));
    return { orig: undefined, rows, reserved: [], foreign: obj !== null };
  }
  const list = Array.isArray(obj.affirmations) ? obj.affirmations : [];
  const rows: VfmRow[] = list.map((raw, i) => {
    const o = isObj(raw) ? raw : undefined;
    const keys = {
      texte: aliasKey(o, ["texte", "text"]),
      vrai: aliasKey(o, ["vrai", "correct"]),
      why: aliasKey(o, ["why", "pourquoi"], (v) => typeof v === "string"),
    };
    const v = o?.[keys.vrai];
    const f: VfmFields = {
      texte: toText(o?.[keys.texte]),
      vrai: typeof v === "boolean" ? v : null,
      why: typeof o?.[keys.why] === "string" ? (o[keys.why] as string) : "",
    };
    return { key: `o${i}`, ...readId(raw, `${PREFIX}${i}`), raw, init: { ...f }, f, keys };
  });
  return { orig: obj, rows, reserved: rows.map((r) => r.id), foreign: false };
}

function serializeRow(row: VfmRow, index: number): unknown {
  if (keepRaw(row, index, PREFIX)) return row.raw;
  const o = rowOrig(row);
  const init = o ? row.init : undefined;
  return rebuild(o, [
    ...idEntry(row, index, PREFIX),
    [row.keys.texte, outText(row.f.texte, init?.texte, o, row.keys.texte, false)],
    [row.keys.vrai, outBool(row.f.vrai, init?.vrai, o, row.keys.vrai)],
    [row.keys.why, outText(row.f.why, init?.why, o, row.keys.why, true)],
  ]);
}

export function serializeVfm(s: VfmState): Obj {
  return rebuild(s.orig, [["affirmations", s.rows.map(serializeRow)]]);
}

export function addVfm(s: VfmState, rand?: () => string): VfmState {
  const { row, reserved } = newRow(PREFIX, s.reserved, s.rows, emptyFields(), rand);
  return { ...s, rows: [...s.rows, { ...row, keys: DEFAULT_KEYS }], reserved };
}

export function validateVfm(s: VfmState): Issue[] {
  const out: Issue[] = [];
  const n = s.rows.length;
  if (n < VFM_MIN) {
    out.push({ level: "error", at: "list.rows", message: `Il faut au moins ${VFM_MIN} affirmations.` });
  } else if (n < VFM_ADVISED_MIN || n > VFM_ADVISED_MAX) {
    out.push({
      level: "warning",
      at: "list.rows",
      message: `Conseillé : entre ${VFM_ADVISED_MIN} et ${VFM_ADVISED_MAX} affirmations (tu en as ${n}).`,
    });
  }
  for (const r of s.rows) {
    if (r.f.texte.trim() === "") {
      out.push({ level: "error", at: `${r.key}.texte`, message: "Écris l'affirmation.", missing: true });
    }
    if (r.f.vrai === null) {
      out.push({ level: "error", at: `${r.key}.vrai`, message: "Indique si elle est vraie ou fausse.", missing: true });
    }
    if (r.f.why.trim() === "") {
      out.push({
        level: "warning",
        at: `${r.key}.why`,
        message: "Conseillé : sans explication, le bouton « Pourquoi ? » n'apparaît pas pour cette affirmation.",
        missing: true,
      });
    }
  }
  const decided = s.rows.filter((r) => r.f.vrai !== null);
  if (n >= VFM_MIN && decided.length === n && (decided.every((r) => r.f.vrai) || decided.every((r) => !r.f.vrai))) {
    out.push({
      level: "warning",
      at: "list.rows",
      message: "Toutes les affirmations ont la même réponse : mets-en au moins une vraie et une fausse.",
    });
  }
  return out;
}

/// Champs conservés sans être éditables ici.
export function preservedVfm(s: VfmState): string[] {
  const keys = new Set(unknownKeys(s.orig, ["affirmations"]));
  for (const r of s.rows) {
    for (const k of unknownKeys(rowOrig(r), ["id", r.keys.texte, r.keys.vrai, r.keys.why])) keys.add(`affirmations[].${k}`);
  }
  return [...keys];
}
