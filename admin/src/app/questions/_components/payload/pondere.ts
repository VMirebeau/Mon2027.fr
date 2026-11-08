/// « Répartir des points » (format `pondere`).
///
/// { "total": 100, "step": 5, "parts": [ { "id", "label", "valeur", "color"? } ] }
/// Le player prend total = 100 et step = 5 s'ils manquent. Alias : valeur|real.
/// Identifiant implicite : `c<position>`.

import {
  aliasKey,
  defaultId,
  fmtNum,
  hasOwn,
  idEntry,
  isMultiple,
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

export const PD_MIN = 2;
export const PD_ADVISED_MIN = 3;
export const PD_ADVISED_MAX = 5;
export const PD_DEFAULT_TOTAL = 100;
export const PD_DEFAULT_STEP = 5;
const PREFIX = "c";

export type PdFields = { label: string; valeur: string; color: string };
export type PdRow = Row<PdFields> & { valeurKey: string };
export type PdTop = { total: string; step: string };

export type PdState = {
  orig: Obj | undefined;
  init: PdTop | undefined;
  top: PdTop;
  rows: PdRow[];
  reserved: string[];
  foreign: boolean;
};

export function looksLikePd(o: Obj): boolean {
  return hasOwn(o, "parts");
}

const emptyFields = (): PdFields => ({ label: "", valeur: "", color: "" });

export function parsePd(obj: Obj | null): PdState {
  if (!obj || !looksLikePd(obj)) {
    const rows: PdRow[] = Array.from({ length: PD_ADVISED_MIN }, (_, i) => ({
      key: `d${i}`,
      id: defaultId("p", i),
      explicitId: true,
      f: emptyFields(),
      valeurKey: "valeur",
    }));
    return {
      orig: undefined,
      init: undefined,
      top: { total: String(PD_DEFAULT_TOTAL), step: String(PD_DEFAULT_STEP) },
      rows,
      reserved: [],
      foreign: obj !== null,
    };
  }
  const top: PdTop = { total: toText(obj.total), step: toText(obj.step) };
  const list = Array.isArray(obj.parts) ? obj.parts : [];
  const rows: PdRow[] = list.map((raw, i) => {
    const o = isObj(raw) ? raw : undefined;
    const valeurKey = aliasKey(o, ["valeur", "real"]);
    const f: PdFields = {
      label: toText(o?.label),
      valeur: toText(o?.[valeurKey]),
      color: typeof o?.color === "string" ? o.color : "",
    };
    return { key: `o${i}`, ...readId(raw, `${PREFIX}${i}`), raw, init: { ...f }, f, valeurKey };
  });
  return { orig: obj, init: { ...top }, top, rows, reserved: rows.map((r) => r.id), foreign: false };
}

function serializeRow(row: PdRow, index: number): unknown {
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

export function serializePd(s: PdState): Obj {
  const o = s.orig;
  const it = o ? s.init : undefined;
  return rebuild(o, [
    ["total", outNum(s.top.total, it?.total, o, "total")],
    ["step", outNum(s.top.step, it?.step, o, "step")],
    ["parts", s.rows.map(serializeRow)],
  ]);
}

export function addPd(s: PdState, rand?: () => string): PdState {
  const { row, reserved } = newRow("p", s.reserved, s.rows, emptyFields(), rand);
  return { ...s, rows: [...s.rows, { ...row, valeurKey: "valeur" }], reserved };
}

/// Total et pas effectivement utilisés par le player (valeurs par défaut si
/// le champ est vide ; null si la saisie est illisible).
export function pdEffective(s: PdState): { total: number | null; step: number | null } {
  const t = s.top.total.trim() === "" ? PD_DEFAULT_TOTAL : parseNumber(s.top.total);
  const st = s.top.step.trim() === "" ? PD_DEFAULT_STEP : parseNumber(s.top.step);
  return { total: t, step: st };
}

/// Somme des vraies parts lisibles, et nombre de parts sans valeur lisible.
export function pdSum(s: PdState): { sum: number; unreadable: number } {
  let sum = 0;
  let unreadable = 0;
  for (const r of s.rows) {
    const v = parseNumber(r.f.valeur);
    if (v === null) unreadable++;
    else sum += v;
  }
  // Arrondi d'affichage : 0,1 + 0,2 doit faire 0,3.
  return { sum: Math.round(sum * 1e9) / 1e9, unreadable };
}

export function validatePd(s: PdState): Issue[] {
  const out: Issue[] = [];
  const { total, step } = pdEffective(s);
  if (total === null) out.push({ level: "error", at: "top.total", message: "Nombre attendu (ex. 100)." });
  else if (total <= 0) out.push({ level: "error", at: "top.total", message: "Le total doit être plus grand que 0." });
  if (step === null) out.push({ level: "error", at: "top.step", message: "Nombre attendu (ex. 5)." });
  else if (step <= 0) out.push({ level: "error", at: "top.step", message: "Le pas doit être plus grand que 0." });
  else if (total !== null && total > 0 && step > total) {
    out.push({ level: "error", at: "top.step", message: "Le pas ne peut pas dépasser le total." });
  } else if (total !== null && total > 0 && !isMultiple(total, step)) {
    out.push({
      level: "warning",
      at: "top.step",
      message: `Le total (${fmtNum(total)}) n'est pas un multiple du pas : le joueur ne pourra pas tout répartir.`,
    });
  }

  const n = s.rows.length;
  if (n < PD_MIN) {
    out.push({ level: "error", at: "list.rows", message: `Il faut au moins ${PD_MIN} catégories.` });
  } else if (n < PD_ADVISED_MIN || n > PD_ADVISED_MAX) {
    out.push({
      level: "warning",
      at: "list.rows",
      message: `Conseillé : entre ${PD_ADVISED_MIN} et ${PD_ADVISED_MAX} catégories (tu en as ${n}).`,
    });
  }
  const goodStep = step !== null && step > 0;
  for (const r of s.rows) {
    if (r.f.label.trim() === "") {
      out.push({ level: "error", at: `${r.key}.label`, message: "Écris le nom de la catégorie.", missing: true });
    }
    const v = parseNumber(r.f.valeur);
    if (r.f.valeur.trim() === "") {
      out.push({ level: "error", at: `${r.key}.valeur`, message: "Indique sa vraie part.", missing: true });
    } else if (v === null) {
      out.push({ level: "error", at: `${r.key}.valeur`, message: "Nombre attendu (ex. 25)." });
    } else if (v < 0) {
      out.push({ level: "error", at: `${r.key}.valeur`, message: "Une part ne peut pas être négative." });
    } else if (total !== null && total > 0 && v > total) {
      out.push({ level: "error", at: `${r.key}.valeur`, message: `Plus grand que le total (${fmtNum(total)}).` });
    } else if (goodStep && !isMultiple(v, step!)) {
      out.push({
        level: "warning",
        at: `${r.key}.valeur`,
        message: `Pas un multiple de ${fmtNum(step!)} : le joueur ne pourra pas viser cette valeur exactement.`,
      });
    }
  }
  const { sum, unreadable } = pdSum(s);
  if (total !== null && total > 0 && unreadable === 0 && n > 0 && sum !== total) {
    const diff = Math.round((total - sum) * 1e9) / 1e9;
    out.push({
      level: "error",
      at: "list.sum",
      message:
        diff > 0
          ? `La somme des vraies parts fait ${fmtNum(sum)} au lieu de ${fmtNum(total)} : il manque ${fmtNum(diff)}.`
          : `La somme des vraies parts fait ${fmtNum(sum)} au lieu de ${fmtNum(total)} : ${fmtNum(-diff)} de trop.`,
    });
  }
  return out;
}

export function preservedPd(s: PdState): string[] {
  const keys = new Set(unknownKeys(s.orig, ["total", "step", "parts"]));
  for (const r of s.rows) {
    for (const k of unknownKeys(rowOrig(r), ["id", "label", r.valeurKey, "color"])) keys.add(`parts[].${k}`);
  }
  return [...keys];
}
