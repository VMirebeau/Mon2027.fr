/// Formats à réponse unique : « Vrai ou faux » (`vrai_faux`), « A ou B »
/// (`ab`) et « QCM » (`qcm`).
///
/// vrai_faux : { "reponseCorrecte": true }
/// ab        : { "choix": [a, b], "indexCorrect": 0|1, "valeurs"?: [n, n], "unite"? }
/// qcm       : { "choix": [ … 2 à 6 ], "indexCorrect": n }
///
/// Pas d'identifiants ici : les réponses des joueurs enregistrent la
/// POSITION du choix. D'où l'absence de réordonnancement dans ces éditeurs.

import {
  hasOwn,
  outBool,
  outText,
  OMIT,
  parseNumber,
  rebuild,
  toText,
  unknownKeys,
  type Issue,
  type Obj,
} from "./shared";

// ---------------------------------------------------------------------------
// Vrai ou faux
// ---------------------------------------------------------------------------

export type VfState = { orig: Obj | undefined; init: boolean | null | undefined; value: boolean | null; foreign: boolean };

export function parseVf(obj: Obj | null): VfState {
  if (!obj || !hasOwn(obj, "reponseCorrecte")) {
    return { orig: undefined, init: undefined, value: null, foreign: obj !== null };
  }
  const v = typeof obj.reponseCorrecte === "boolean" ? obj.reponseCorrecte : null;
  return { orig: obj, init: v, value: v, foreign: false };
}

export function serializeVf(s: VfState): Obj {
  return rebuild(s.orig, [["reponseCorrecte", outBool(s.value, s.init, s.orig, "reponseCorrecte")]]);
}

export function validateVf(s: VfState): Issue[] {
  return s.value === null
    ? [{ level: "error", at: "top.value", message: "Choisis la bonne réponse : Vrai ou Faux.", missing: true }]
    : [];
}

export function preservedVf(s: VfState): string[] {
  return unknownKeys(s.orig, ["reponseCorrecte"]);
}

// ---------------------------------------------------------------------------
// Choix (A/B et QCM)
// ---------------------------------------------------------------------------

/// `raw` : élément d'origine (undefined pour un choix ajouté).
export type Choice = { key: string; text: string; init?: string; raw?: unknown };

function readChoices(obj: Obj | null, min: number, max: number): Choice[] | null {
  if (!obj || !Array.isArray(obj.choix)) return null;
  const list = (obj.choix as unknown[]).slice(0, max);
  if (list.length < min) return null;
  return list.map((raw, i) => {
    const text = typeof raw === "string" ? raw : toText(raw);
    return { key: `o${i}`, text, init: text, raw };
  });
}

function choiceOut(c: Choice): unknown {
  if (c.init !== undefined && c.text === c.init) return c.raw;
  return c.text.trim();
}

/// `allowExtra` : A/B n'édite que les deux premiers choix ; d'éventuels
/// choix en plus sont conservés tant que rien n'a changé.
function serializeChoices(choices: Choice[], orig: Obj | undefined, allowExtra = false): unknown {
  const origList = Array.isArray(orig?.choix) ? (orig.choix as unknown[]) : null;
  const untouched =
    origList !== null &&
    (choices.length === origList.length || (allowExtra && origList.length > choices.length)) &&
    choices.every((c, i) => c.key === `o${i}` && c.init !== undefined && c.text === c.init);
  return untouched ? origList : choices.map(choiceOut);
}

/// Index de la bonne réponse. Inchangé (même choix, même position) : valeur
/// d'origine telle quelle.
function indexOut(
  correct: string | null,
  init: string | null | undefined,
  choices: Choice[],
  orig: Obj | undefined,
): unknown {
  const idx = correct === null ? -1 : choices.findIndex((c) => c.key === correct);
  if (orig && init !== undefined && correct === init && (correct === null || idx === Number(correct.slice(1)))) {
    return hasOwn(orig, "indexCorrect") ? orig.indexCorrect : OMIT;
  }
  return idx < 0 ? OMIT : idx;
}

function choiceIssues(choices: Choice[], correct: string | null, min: number): Issue[] {
  const out: Issue[] = [];
  if (choices.length < min) out.push({ level: "error", at: "list.choix", message: `Il faut au moins ${min} choix.` });
  for (const c of choices) {
    if (c.text.trim() === "") out.push({ level: "error", at: `${c.key}.text`, message: "Écris le texte du choix.", missing: true });
  }
  if (correct === null || !choices.some((c) => c.key === correct)) {
    out.push({ level: "error", at: "list.correct", message: "Marque la bonne réponse.", missing: true });
  }
  const seen = new Set<string>();
  for (const c of choices) {
    const t = c.text.trim().toLowerCase();
    if (t === "") continue;
    if (seen.has(t)) out.push({ level: "warning", at: `${c.key}.text`, message: "Même texte qu'un autre choix." });
    seen.add(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// A ou B
// ---------------------------------------------------------------------------

export type AbState = {
  orig: Obj | undefined;
  choices: [Choice, Choice];
  correct: string | null;
  initCorrect: string | null | undefined;
  valeurs: [string, string];
  initValeurs: [string, string] | undefined;
  unite: string;
  initUnite: string | undefined;
  foreign: boolean;
};

/// Un QCM à plus de deux choix n'est pas un A/B (changement de format).
export function looksLikeAb(o: Obj): boolean {
  if (!hasOwn(o, "choix")) return false;
  if (hasOwn(o, "valeurs") || hasOwn(o, "unite")) return true;
  return !Array.isArray(o.choix) || o.choix.length <= 2;
}

export function parseAb(obj: Obj | null): AbState {
  const empty = (): [Choice, Choice] => [
    { key: "o0", text: "" },
    { key: "o1", text: "" },
  ];
  if (!obj || !looksLikeAb(obj)) {
    // Question passée d'un QCM à A/B : on reprend les deux premiers choix.
    const fromQcm = obj ? readChoices(obj, 2, 2) : null;
    const choices = fromQcm
      ? (fromQcm.map((c) => ({ key: c.key, text: c.text })) as [Choice, Choice])
      : empty();
    const idx = obj?.indexCorrect;
    return {
      orig: undefined,
      choices,
      correct: fromQcm && (idx === 0 || idx === 1) ? `o${idx}` : null,
      initCorrect: undefined,
      valeurs: ["", ""],
      initValeurs: undefined,
      unite: "",
      initUnite: undefined,
      foreign: obj !== null,
    };
  }
  const read = readChoices(obj, 0, 2) ?? [];
  const choices: [Choice, Choice] = [read[0] ?? { key: "o0", text: "" }, read[1] ?? { key: "o1", text: "" }];
  const idx = obj.indexCorrect;
  const correct = idx === 0 || idx === 1 ? `o${idx}` : null;
  const vals = Array.isArray(obj.valeurs) ? (obj.valeurs as unknown[]) : [];
  const valeurs: [string, string] = [toText(vals[0]), toText(vals[1])];
  const unite = toText(obj.unite);
  return {
    orig: obj,
    choices,
    correct,
    initCorrect: correct,
    valeurs,
    initValeurs: [...valeurs],
    unite,
    initUnite: unite,
    foreign: false,
  };
}

function valeursOut(s: AbState): unknown {
  const o = s.orig;
  const same = (i: 0 | 1) => s.initValeurs !== undefined && s.valeurs[i] === s.initValeurs[i];
  if (o && same(0) && same(1)) return hasOwn(o, "valeurs") ? o.valeurs : OMIT;
  const origVals = Array.isArray(o?.valeurs) ? (o.valeurs as unknown[]) : [];
  const one = (i: 0 | 1): unknown => {
    if (same(i) && i < origVals.length) return origVals[i];
    return parseNumber(s.valeurs[i]);
  };
  const v = [one(0), one(1)];
  const blank = (x: unknown) => x === null || x === undefined || x === "";
  return blank(v[0]) && blank(v[1]) ? OMIT : v.map((x) => (x === undefined ? null : x));
}

export function serializeAb(s: AbState): Obj {
  const o = s.orig;
  return rebuild(o, [
    ["choix", serializeChoices(s.choices, o, true)],
    ["indexCorrect", indexOut(s.correct, s.initCorrect, s.choices, o)],
    ["valeurs", valeursOut(s)],
    ["unite", outText(s.unite, s.initUnite, o, "unite", true)],
  ]);
}

export function validateAb(s: AbState): Issue[] {
  const out = choiceIssues(s.choices, s.correct, 2);
  const filled = s.valeurs.map((v) => v.trim() !== "");
  s.valeurs.forEach((v, i) => {
    if (v.trim() !== "" && parseNumber(v) === null) {
      out.push({
        level: "warning",
        at: `o${i}.valeur`,
        message: `« ${v.trim()} » n'est pas un nombre : le jeu ne l'affiche pas. Écris seulement le nombre (l'unité va plus bas).`,
      });
    }
  });
  if (filled[0] !== filled[1]) {
    out.push({
      level: "warning",
      at: "list.valeurs",
      message: "Renseigne les deux valeurs, ou aucune : la comparaison chiffrée ne s'affiche qu'avec les deux.",
    });
  }
  return out;
}

export function preservedAb(s: AbState): string[] {
  return unknownKeys(s.orig, ["choix", "indexCorrect", "valeurs", "unite"]);
}

// ---------------------------------------------------------------------------
// QCM
// ---------------------------------------------------------------------------

export const QCM_MIN = 2;
export const QCM_MAX = 6;

export type QcmState = {
  orig: Obj | undefined;
  choices: Choice[];
  correct: string | null;
  initCorrect: string | null | undefined;
  /// Compteur des choix ajoutés (clés React).
  added: number;
  foreign: boolean;
};

export function looksLikeQcm(o: Obj): boolean {
  return hasOwn(o, "choix") && !hasOwn(o, "valeurs") && !hasOwn(o, "unite");
}

export function parseQcm(obj: Obj | null): QcmState {
  if (!obj || !looksLikeQcm(obj)) {
    // Question passée d'A/B à QCM : on reprend les choix et la bonne réponse.
    const fromAb = obj ? readChoices(obj, 2, QCM_MAX) : null;
    const idx = obj?.indexCorrect;
    const choices = fromAb
      ? fromAb.map((c) => ({ key: c.key, text: c.text }))
      : Array.from({ length: 4 }, (_, i) => ({ key: `o${i}`, text: "" }));
    return {
      orig: undefined,
      choices,
      correct: fromAb && typeof idx === "number" && idx >= 0 && idx < choices.length ? `o${idx}` : null,
      initCorrect: undefined,
      added: 0,
      foreign: obj !== null,
    };
  }
  const list = Array.isArray(obj.choix) ? (obj.choix as unknown[]) : [];
  const choices: Choice[] = list.map((raw, i) => {
    const text = typeof raw === "string" ? raw : toText(raw);
    return { key: `o${i}`, text, init: text, raw };
  });
  const idx = obj.indexCorrect;
  const correct = typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < choices.length ? `o${idx}` : null;
  return { orig: obj, choices, correct, initCorrect: correct, added: 0, foreign: false };
}

export function addQcmChoice(s: QcmState): QcmState {
  return { ...s, choices: [...s.choices, { key: `n${s.added}`, text: "" }], added: s.added + 1 };
}

export function removeQcmChoice(s: QcmState, key: string): QcmState {
  return { ...s, choices: s.choices.filter((c) => c.key !== key), correct: s.correct === key ? null : s.correct };
}

export function serializeQcm(s: QcmState): Obj {
  const o = s.orig;
  return rebuild(o, [
    ["choix", serializeChoices(s.choices, o)],
    ["indexCorrect", indexOut(s.correct, s.initCorrect, s.choices, o)],
  ]);
}

export function validateQcm(s: QcmState): Issue[] {
  const out = choiceIssues(s.choices, s.correct, QCM_MIN);
  if (s.choices.length > QCM_MAX) {
    out.push({ level: "warning", at: "list.choix", message: `${QCM_MAX} choix au plus (tu en as ${s.choices.length}).` });
  }
  return out;
}

export function preservedQcm(s: QcmState): string[] {
  return unknownKeys(s.orig, ["choix", "indexCorrect"]);
}
