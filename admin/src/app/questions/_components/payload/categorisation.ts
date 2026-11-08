/// « Classer dans des catégories » (format `categorisation`).
///
/// { "categories": [ { "id", "label" } | "texte" ],
///   "etiquettes": [ { "id", "texte", "categorie": <index>, "note"? } ] }
/// Alias lus par le player : catégorie label|texte (ou chaîne seule),
/// étiquette texte|label, et `correctBinId` (identifiant de catégorie) qui
/// l'emporte sur `categorie`. Identifiants implicites : `b<position>` pour
/// les catégories, `it<position>` pour les étiquettes.
///
/// Ancien format (`items` + `categorieCorrecte` = identifiant de catégorie) :
/// le player ne le lit pas, la question n'apparaît pas aux joueurs. On le lit
/// et on l'écrit au format actuel, en gardant les identifiants.

import {
  aliasKey,
  defaultId,
  hasOwn,
  idEntry,
  isObj,
  keepRaw,
  newRow,
  OMIT,
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

export const CAT_MIN = 2;
export const CAT_ADVISED_MAX = 4;
export const ETQ_MIN = 2;
export const ETQ_ADVISED_MIN = 4;
export const ETQ_ADVISED_MAX = 8;
const CAT_PREFIX = "b";
const ETQ_PREFIX = "it";

export type CatFields = { label: string };
export type CatRow = Row<CatFields> & { labelKey: string };

/// `cat` : clé de ligne de la catégorie choisie, ou null.
export type EtqFields = { texte: string; cat: string | null; note: string };
export type EtqRow = Row<EtqFields> & { texteKey: string };

export type CatState = {
  orig: Obj | undefined;
  cats: CatRow[];
  etqs: EtqRow[];
  reservedCats: string[];
  reservedEtqs: string[];
  /// Lu depuis l'ancien format `items` / `categorieCorrecte`.
  legacy: boolean;
  foreign: boolean;
};

export function looksLikeCat(o: Obj): boolean {
  return hasOwn(o, "categories") || hasOwn(o, "etiquettes");
}

export function parseCat(obj: Obj | null): CatState {
  if (!obj || !looksLikeCat(obj)) {
    const cats: CatRow[] = Array.from({ length: 2 }, (_, i) => ({
      key: `dc${i}`,
      id: defaultId("cat", i),
      explicitId: true,
      f: { label: "" },
      labelKey: "label",
    }));
    const etqs: EtqRow[] = Array.from({ length: ETQ_ADVISED_MIN }, (_, i) => ({
      key: `de${i}`,
      id: defaultId("e", i),
      explicitId: true,
      f: { texte: "", cat: null, note: "" },
      texteKey: "texte",
    }));
    return { orig: undefined, cats, etqs, reservedCats: [], reservedEtqs: [], legacy: false, foreign: obj !== null };
  }

  const catList = Array.isArray(obj.categories) ? obj.categories : [];
  const cats: CatRow[] = catList.map((raw, i) => {
    const o = isObj(raw) ? raw : undefined;
    const labelKey = aliasKey(o, ["label", "texte"]);
    const f = { label: typeof raw === "string" ? raw : toText(o?.[labelKey]) };
    return { key: `c${i}`, ...readId(raw, `${CAT_PREFIX}${i}`), raw, init: { ...f }, f, labelKey };
  });

  const legacy = !Array.isArray(obj.etiquettes) && Array.isArray(obj.items);
  const etqList = legacy ? (obj.items as unknown[]) : Array.isArray(obj.etiquettes) ? obj.etiquettes : [];
  const etqs: EtqRow[] = etqList.map((raw, i) => {
    const o = isObj(raw) ? raw : undefined;
    const texteKey = aliasKey(o, ["texte", "label"]);
    const f: EtqFields = {
      texte: toText(o?.[texteKey]),
      cat: readCategory(o, cats, legacy),
      note: typeof o?.note === "string" ? o.note : "",
    };
    return { key: `e${i}`, ...readId(raw, `${ETQ_PREFIX}${i}`), raw, init: { ...f }, f, texteKey };
  });

  return {
    orig: obj,
    cats,
    etqs,
    reservedCats: cats.map((c) => c.id),
    reservedEtqs: etqs.map((e) => e.id),
    legacy,
    foreign: false,
  };
}

/// Catégorie d'une étiquette, comme le player la résout. Une référence
/// invalide (index hors liste, identifiant inconnu) donne null : l'éditeur
/// demande alors de choisir.
function readCategory(o: Obj | undefined, cats: CatRow[], legacy: boolean): string | null {
  if (!o) return null;
  const byId = (id: unknown) => (typeof id === "string" ? (cats.find((c) => c.id === id)?.key ?? null) : null);
  if (legacy) {
    const v = o.categorieCorrecte;
    return byId(v) ?? (typeof v === "string" ? (cats.find((c) => c.f.label === v)?.key ?? null) : null);
  }
  if (typeof o.correctBinId === "string") return byId(o.correctBinId);
  const idx = o.categorie;
  if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < cats.length) return cats[idx].key;
  return null;
}

function serializeCat(row: CatRow, index: number): unknown {
  if (typeof row.raw === "string" && !row.explicitId && row.id === `${CAT_PREFIX}${index}`) {
    // Catégorie enregistrée comme simple texte : on garde cette forme.
    return row.f.label === row.init?.label ? row.raw : row.f.label.trim();
  }
  if (keepRaw(row, index, CAT_PREFIX)) return row.raw;
  const o = rowOrig(row);
  const init = o ? row.init : undefined;
  return rebuild(o, [
    ...idEntry(row, index, CAT_PREFIX),
    [row.labelKey, outText(row.f.label, init?.label, o, row.labelKey, false)],
  ]);
}

function serializeEtq(row: EtqRow, index: number, cats: CatRow[], legacy: boolean): unknown {
  if (keepRaw(row, index, ETQ_PREFIX)) return row.raw;
  const catIndex = row.f.cat === null ? -1 : cats.findIndex((c) => c.key === row.f.cat);
  const o = rowOrig(row);
  const init = o ? row.init : undefined;
  const entries: Array<[string, unknown]> = [
    ...idEntry(row, index, ETQ_PREFIX),
    [row.texteKey, outText(row.f.texte, init?.texte, o, row.texteKey, false)],
  ];
  const catChanged = !init || row.f.cat !== init.cat;
  if (catIndex >= 0) {
    if (hasOwn(o, "correctBinId") && typeof o!.correctBinId === "string") {
      entries.push(["correctBinId", cats[catIndex].id]);
      if (catChanged && hasOwn(o, "categorie")) entries.push(["categorie", catIndex]);
    } else {
      entries.push(["categorie", catIndex]);
    }
  } else if (catChanged || row.f.cat !== null) {
    // Pas encore choisie, ou sa catégorie a été supprimée : l'ancien index
    // désignerait désormais une autre case.
    entries.push(["categorie", OMIT], ["correctBinId", OMIT]);
  }
  // Sinon : référence d'origine invalide et inchangée, conservée telle quelle.
  if (legacy) entries.push(["categorieCorrecte", OMIT]);
  entries.push(["note", outText(row.f.note, init?.note, o, "note", true)]);
  return rebuild(o, entries);
}

export function serializeCatState(s: CatState): Obj {
  const etiquettes = s.etqs.map((e, i) => serializeEtq(e, i, s.cats, s.legacy));
  return rebuild(s.orig, [
    ["categories", s.cats.map(serializeCat)],
    ["etiquettes", etiquettes],
    ...(s.legacy ? ([["items", OMIT]] as Array<[string, unknown]>) : []),
  ]);
}

export function addCategory(s: CatState, rand?: () => string): CatState {
  const { row, reserved } = newRow("cat", s.reservedCats, s.cats, { label: "" }, rand);
  return { ...s, cats: [...s.cats, { ...row, labelKey: "label" }], reservedCats: reserved };
}

export function addEtiquette(s: CatState, rand?: () => string): CatState {
  const { row, reserved } = newRow("e", s.reservedEtqs, s.etqs, { texte: "", cat: null, note: "" }, rand);
  return { ...s, etqs: [...s.etqs, { ...row, texteKey: "texte" }], reservedEtqs: reserved };
}

export function validateCatState(s: CatState): Issue[] {
  const out: Issue[] = [];
  if (s.cats.length < CAT_MIN) {
    out.push({ level: "error", at: "list.cats", message: `Il faut au moins ${CAT_MIN} catégories.` });
  } else if (s.cats.length > CAT_ADVISED_MAX) {
    out.push({
      level: "warning",
      at: "list.cats",
      message: `Conseillé : ${CAT_ADVISED_MAX} catégories au plus (tu en as ${s.cats.length}).`,
    });
  }
  for (const c of s.cats) {
    if (c.f.label.trim() === "") {
      out.push({ level: "error", at: `${c.key}.label`, message: "Donne un nom à la catégorie.", missing: true });
    }
  }
  const n = s.etqs.length;
  if (n < ETQ_MIN) {
    out.push({ level: "error", at: "list.etqs", message: `Il faut au moins ${ETQ_MIN} éléments à classer.` });
  } else if (n < ETQ_ADVISED_MIN || n > ETQ_ADVISED_MAX) {
    out.push({
      level: "warning",
      at: "list.etqs",
      message: `Conseillé : entre ${ETQ_ADVISED_MIN} et ${ETQ_ADVISED_MAX} éléments (tu en as ${n}).`,
    });
  }
  const catKeys = new Set(s.cats.map((c) => c.key));
  const used = new Set<string>();
  for (const e of s.etqs) {
    if (e.f.texte.trim() === "") {
      out.push({ level: "error", at: `${e.key}.texte`, message: "Écris le texte de l'élément.", missing: true });
    }
    if (e.f.cat !== null && catKeys.has(e.f.cat)) {
      used.add(e.f.cat);
    } else if (e.f.cat !== null) {
      out.push({ level: "error", at: `${e.key}.cat`, message: "Sa catégorie a été supprimée : choisis-en une autre." });
    } else if (e.f.cat === e.init?.cat && hasCategoryRef(e)) {
      out.push({
        level: "error",
        at: `${e.key}.cat`,
        message: "La catégorie enregistrée est introuvable : choisis la bonne catégorie.",
      });
    } else {
      out.push({ level: "error", at: `${e.key}.cat`, message: "Choisis la bonne catégorie.", missing: true });
    }
  }
  if (n >= ETQ_MIN) {
    for (const c of s.cats) {
      if (!used.has(c.key)) {
        out.push({
          level: "warning",
          at: `${c.key}.label`,
          message: "Aucun élément ne va dans cette catégorie.",
        });
      }
    }
  }
  return out;
}

function hasCategoryRef(e: EtqRow): boolean {
  const o = rowOrig(e);
  return hasOwn(o, "categorie") || hasOwn(o, "correctBinId") || hasOwn(o, "categorieCorrecte");
}

export function preservedCat(s: CatState): string[] {
  const keys = new Set(unknownKeys(s.orig, ["categories", "etiquettes", ...(s.legacy ? ["items"] : [])]));
  for (const c of s.cats) for (const k of unknownKeys(rowOrig(c), ["id", c.labelKey])) keys.add(`categories[].${k}`);
  for (const e of s.etqs) {
    const known = ["id", e.texteKey, "note", "categorie", "correctBinId", "categorieCorrecte"];
    for (const k of unknownKeys(rowOrig(e), known)) keys.add(`etiquettes[].${k}`);
  }
  return [...keys];
}
