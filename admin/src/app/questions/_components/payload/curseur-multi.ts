/// « Placer sur une échelle » (format `curseur_multi`).
///
/// { "echelle": { "min", "max", "unite"? }, "labelMin"?, "labelMax"?,
///   "items": [ { "id", "label", "valeur", "color"? } ] }
/// Alias lus par le player : valeur|real. Identifiant implicite : `it<position>`.

import {
  aliasKey,
  defaultId,
  fmtNum,
  hasOwn,
  idEntry,
  isObj,
  keepRaw,
  newRow,
  outNum,
  outText,
  parseNumber,
  readId,
  rebuild,
  rowOrig,
  toText,
  unknownKeys,
  type Issue,
  type Obj,
  type Row,
} from "./shared";

export const CM_MIN = 2;
export const CM_ADVISED_MIN = 3;
export const CM_ADVISED_MAX = 6;
const PREFIX = "it";

export type CmFields = { label: string; valeur: string; color: string };
export type CmRow = Row<CmFields> & { valeurKey: string };
export type CmTop = { min: string; max: string; unite: string; labelMin: string; labelMax: string };

export type CmState = {
  orig: Obj | undefined;
  /// Objet `echelle` d'origine (clés inconnues conservées).
  origEchelle: Obj | undefined;
  init: CmTop | undefined;
  top: CmTop;
  rows: CmRow[];
  reserved: string[];
  foreign: boolean;
};

export function looksLikeCm(o: Obj): boolean {
  return hasOwn(o, "echelle");
}

const emptyFields = (): CmFields => ({ label: "", valeur: "", color: "" });

export function parseCm(obj: Obj | null): CmState {
  if (!obj || !looksLikeCm(obj)) {
    const rows: CmRow[] = Array.from({ length: 4 }, (_, i) => ({
      key: `d${i}`,
      id: defaultId(PREFIX, i),
      explicitId: true,
      f: emptyFields(),
      valeurKey: "valeur",
    }));
    return {
      orig: undefined,
      origEchelle: undefined,
      init: undefined,
      top: { min: "", max: "", unite: "", labelMin: "", labelMax: "" },
      rows,
      reserved: [],
      foreign: obj !== null,
    };
  }
  const echelle = isObj(obj.echelle) ? obj.echelle : undefined;
  const top: CmTop = {
    min: toText(echelle?.min),
    max: toText(echelle?.max),
    unite: toText(echelle?.unite),
    labelMin: toText(obj.labelMin),
    labelMax: toText(obj.labelMax),
  };
  const list = Array.isArray(obj.items) ? obj.items : [];
  const rows: CmRow[] = list.map((raw, i) => {
    const o = isObj(raw) ? raw : undefined;
    const valeurKey = aliasKey(o, ["valeur", "real"]);
    const f: CmFields = {
      label: toText(o?.label),
      valeur: toText(o?.[valeurKey]),
      color: typeof o?.color === "string" ? o.color : "",
    };
    return { key: `o${i}`, ...readId(raw, `${PREFIX}${i}`), raw, init: { ...f }, f, valeurKey };
  });
  return {
    orig: obj,
    origEchelle: echelle,
    init: { ...top },
    top,
    rows,
    reserved: rows.map((r) => r.id),
    foreign: false,
  };
}

function serializeRow(row: CmRow, index: number): unknown {
  if (keepRaw(row, index, PREFIX)) return row.raw;
  const o = rowOrig(row);
  const init = o ? row.init : undefined;
  return rebuild(o, [
    ...idEntry(row, index, PREFIX),
    ["label", outText(row.f.label, init?.label, o, "label", false)],
    [row.valeurKey, outNum(row.f.valeur, init?.valeur, o, row.valeurKey)],
    ["color", outText(row.f.color, init?.color, o, "color", true)],
  ]);
}

export function serializeCm(s: CmState): Obj {
  const e = s.origEchelle;
  const ie = e ? s.init : undefined;
  const echelle = rebuild(e, [
    ["min", outNum(s.top.min, ie?.min, e, "min")],
    ["max", outNum(s.top.max, ie?.max, e, "max")],
    ["unite", outText(s.top.unite, ie?.unite, e, "unite", true)],
  ]);
  const o = s.orig;
  const it = o ? s.init : undefined;
  return rebuild(o, [
    // Un `echelle` d'origine illisible (pas un objet) est conservé tel quel
    // tant que les bornes n'ont pas été touchées.
    ["echelle", o && !e && sameTop(s) ? o.echelle : echelle],
    ["labelMin", outText(s.top.labelMin, it?.labelMin, o, "labelMin", true)],
    ["labelMax", outText(s.top.labelMax, it?.labelMax, o, "labelMax", true)],
    ["items", s.rows.map(serializeRow)],
  ]);
}

function sameTop(s: CmState): boolean {
  return !!s.init && s.top.min === s.init.min && s.top.max === s.init.max && s.top.unite === s.init.unite;
}

export function addCm(s: CmState, rand?: () => string): CmState {
  const { row, reserved } = newRow(PREFIX, s.reserved, s.rows, emptyFields(), rand);
  return { ...s, rows: [...s.rows, { ...row, valeurKey: "valeur" }], reserved };
}

/// Repères posés d'office par le player : copie de anchorIdsFor
/// (player/src/lib/curseur-anchors.ts). floor(n/4) repères dès 4 étiquettes,
/// répartis dans la plage des vraies valeurs en évitant les extrêmes.
export function anchorIdsFor(items: ReadonlyArray<{ id: string; real: number }>): Set<string> {
  const n = items.length;
  const k = n >= 4 ? Math.floor(n / 4) : 0;
  if (k === 0) return new Set();
  const sorted = [...items].sort((a, b) => a.real - b.real || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set<string>();
  for (let j = 0; j < k; j++) ids.add(sorted[Math.floor(((j + 0.5) * n) / k)].id);
  return ids;
}

/// Clés de ligne des étiquettes qui serviront de repères, ou null si une
/// valeur manque (le calcul n'aurait pas de sens).
export function cmAnchors(s: CmState): Set<string> | null {
  const items: { id: string; real: number; key: string }[] = [];
  for (const r of s.rows) {
    const v = parseNumber(r.f.valeur);
    if (v === null) return null;
    items.push({ id: r.id, real: v, key: r.key });
  }
  const ids = anchorIdsFor(items);
  return new Set(items.filter((it) => ids.has(it.id)).map((it) => it.key));
}

export function cmUnit(s: CmState): string {
  return s.top.unite.trim();
}

export function validateCm(s: CmState): Issue[] {
  const out: Issue[] = [];
  const min = parseNumber(s.top.min);
  const max = parseNumber(s.top.max);
  if (min === null) {
    out.push({
      level: "error",
      at: "top.min",
      message: s.top.min.trim() === "" ? "Indique le début de l'échelle." : "Nombre attendu.",
      missing: s.top.min.trim() === "",
    });
  }
  if (max === null) {
    out.push({
      level: "error",
      at: "top.max",
      message: s.top.max.trim() === "" ? "Indique la fin de l'échelle." : "Nombre attendu.",
      missing: s.top.max.trim() === "",
    });
  }
  const bounds = min !== null && max !== null && min < max;
  if (min !== null && max !== null && min >= max) {
    out.push({ level: "error", at: "top.max", message: "La fin de l'échelle doit être plus grande que le début." });
  }
  const n = s.rows.length;
  if (n < CM_MIN) {
    out.push({ level: "error", at: "list.rows", message: `Il faut au moins ${CM_MIN} étiquettes.` });
  } else if (n < CM_ADVISED_MIN || n > CM_ADVISED_MAX) {
    out.push({
      level: "warning",
      at: "list.rows",
      message: `Conseillé : entre ${CM_ADVISED_MIN} et ${CM_ADVISED_MAX} étiquettes (tu en as ${n}).`,
    });
  }
  for (const r of s.rows) {
    if (r.f.label.trim() === "") {
      out.push({ level: "error", at: `${r.key}.label`, message: "Écris le texte de l'étiquette.", missing: true });
    }
    const v = parseNumber(r.f.valeur);
    if (r.f.valeur.trim() === "") {
      out.push({ level: "error", at: `${r.key}.valeur`, message: "Indique sa vraie valeur.", missing: true });
    } else if (v === null) {
      out.push({ level: "error", at: `${r.key}.valeur`, message: "Nombre attendu (ex. 12,5)." });
    } else if (bounds && (v < min! || v > max!)) {
      out.push({
        level: "error",
        at: `${r.key}.valeur`,
        message: `Hors de l'échelle : la valeur doit être entre ${fmtNum(min!)} et ${fmtNum(max!)}.`,
      });
    }
  }
  return out;
}

export function preservedCm(s: CmState): string[] {
  const keys = new Set(unknownKeys(s.orig, ["echelle", "labelMin", "labelMax", "items"]));
  for (const k of unknownKeys(s.origEchelle, ["min", "max", "unite"])) keys.add(`echelle.${k}`);
  for (const r of s.rows) {
    for (const k of unknownKeys(rowOrig(r), ["id", "label", r.valeurKey, "color"])) keys.add(`items[].${k}`);
  }
  return [...keys];
}
