/// « Classement » (format `classement`).
///
/// { "items": [ { "id", "label", "figure"? } | "texte" ] }, dans l'ordre
/// correct : le player les mélange. Identifiant implicite : `i<position>`.
/// `ordreCorrect` (historique) est ignoré par le player : on ne l'écrit plus
/// pour les nouvelles questions, on le tient à jour s'il existe déjà.

import {
  defaultId,
  hasOwn,
  idEntry,
  isObj,
  keepRaw,
  newRow,
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

export const CL_MIN = 3;
export const CL_ADVISED_MAX = 6;
const PREFIX = "i";

export type ClFields = { label: string; figure: string };
export type ClRow = Row<ClFields>;

export type ClState = {
  orig: Obj | undefined;
  rows: ClRow[];
  reserved: string[];
  foreign: boolean;
};

export function looksLikeCl(o: Obj): boolean {
  return hasOwn(o, "items") && !hasOwn(o, "echelle") && !hasOwn(o, "categories");
}

const emptyFields = (): ClFields => ({ label: "", figure: "" });

export function parseCl(obj: Obj | null): ClState {
  if (!obj || !looksLikeCl(obj)) {
    const rows: ClRow[] = Array.from({ length: 4 }, (_, i) => ({
      key: `d${i}`,
      id: defaultId("i", i),
      explicitId: true,
      f: emptyFields(),
    }));
    return { orig: undefined, rows, reserved: [], foreign: obj !== null };
  }
  const list = Array.isArray(obj.items) ? obj.items : [];
  const rows: ClRow[] = list.map((raw, i) => {
    const o = isObj(raw) ? raw : undefined;
    const f: ClFields = {
      label: typeof raw === "string" ? raw : toText(o?.label),
      figure: typeof o?.figure === "string" ? o.figure : "",
    };
    return { key: `o${i}`, ...readId(raw, `${PREFIX}${i}`), raw, init: { ...f }, f };
  });
  return { orig: obj, rows, reserved: rows.map((r) => r.id), foreign: false };
}

function serializeRow(row: ClRow, index: number): unknown {
  if (
    typeof row.raw === "string" &&
    !row.explicitId &&
    row.id === `${PREFIX}${index}` &&
    row.f.figure.trim() === ""
  ) {
    // Élément enregistré comme simple texte, resté à sa place : même forme.
    return row.f.label === row.init?.label ? row.raw : row.f.label.trim();
  }
  if (keepRaw(row, index, PREFIX)) return row.raw;
  const o = rowOrig(row);
  const init = o ? row.init : undefined;
  return rebuild(o, [
    ...idEntry(row, index, PREFIX),
    ["label", outText(row.f.label, init?.label, o, "label", false)],
    ["figure", outText(row.f.figure, init?.figure, o, "figure", true)],
  ]);
}

const isIdentity = (v: unknown, n: number) =>
  Array.isArray(v) && v.length === n && v.every((x, i) => x === i);

export function serializeCl(s: ClState): Obj {
  const o = s.orig;
  const items = s.rows.map(serializeRow);
  const origLen = Array.isArray(o?.items) ? (o.items as unknown[]).length : 0;
  const known: Array<[string, unknown]> = [["items", items]];
  // Ancien champ : identité 0..n-1 par convention. Tenu à jour s'il l'était,
  // laissé tel quel sinon (sens inconnu).
  if (hasOwn(o, "ordreCorrect") && isIdentity(o!.ordreCorrect, origLen)) {
    known.push(["ordreCorrect", items.map((_, i) => i)]);
  }
  return rebuild(o, known);
}

export function addCl(s: ClState, rand?: () => string): ClState {
  const { row, reserved } = newRow("i", s.reserved, s.rows, emptyFields(), rand);
  return { ...s, rows: [...s.rows, row], reserved };
}

export function validateCl(s: ClState): Issue[] {
  const out: Issue[] = [];
  const n = s.rows.length;
  if (n < CL_MIN) {
    out.push({ level: "error", at: "list.rows", message: `Il faut au moins ${CL_MIN} éléments à classer.` });
  } else if (n > CL_ADVISED_MAX) {
    out.push({
      level: "warning",
      at: "list.rows",
      message: `Conseillé : ${CL_ADVISED_MAX} éléments au plus, le classement devient pénible au-delà (tu en as ${n}).`,
    });
  }
  for (const r of s.rows) {
    if (r.f.label.trim() === "") {
      out.push({ level: "error", at: `${r.key}.label`, message: "Écris le texte de l'élément.", missing: true });
    }
  }
  return out;
}

export function preservedCl(s: ClState): string[] {
  const keys = new Set(unknownKeys(s.orig, ["items", "ordreCorrect"]));
  for (const r of s.rows) for (const k of unknownKeys(rowOrig(r), ["id", "label", "figure"])) keys.add(`items[].${k}`);
  return [...keys];
}
