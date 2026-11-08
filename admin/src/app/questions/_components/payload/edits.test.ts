import { describe, expect, it } from "vitest";
import { questionSchema } from "@/lib/schema";
import { addCategory, addEtiquette, parseCat, serializeCatState, validateCatState } from "./categorisation";
import { addCl, parseCl, serializeCl } from "./classement";
import { addCm, anchorIdsFor, cmAnchors, parseCm, serializeCm, validateCm } from "./curseur-multi";
import { parsePd, pdSum, serializePd, validatePd } from "./pondere";
import { moveAt, parsePayload, updateRow, type Obj } from "./shared";
import {
  addQcmChoice,
  parseAb,
  parseQcm,
  parseVf,
  removeQcmChoice,
  serializeAb,
  serializeQcm,
  serializeVf,
  validateAb,
  validateQcm,
  validateVf,
} from "./simple";
import { addVfm, parseVfm, serializeVfm, validateVfm } from "./vraifaux-multi";

const obj = (s: string) => parsePayload(s).obj as Obj;
const json = (o: unknown) => JSON.stringify(o);
const fixedRand = (...vals: string[]) => () => vals.shift() ?? "zzzzz";

/// Identifiants tels que le player les lit (mapVariant, player/src/lib/content.ts) :
/// clé `id` si c'est une chaîne, sinon `<préfixe><position>`.
const playerIds = (list: unknown[], prefix: string) =>
  list.map((x, i) =>
    typeof x === "object" && x !== null && typeof (x as Obj).id === "string" ? (x as Obj).id : `${prefix}${i}`,
  );

const schemaOk = (format: string, payload: unknown) =>
  questionSchema.safeParse({
    theme: "Santé",
    question: "Question de test assez longue ?",
    explication: "Explication de test.",
    auteur: "test",
    sources: [],
    format,
    payload: json(payload),
  }).success;

// ---------------------------------------------------------------------------

describe("Plusieurs vrai/faux", () => {
  const P =
    '{"affirmations":[{"id":"s1","texte":"A","vrai":true,"why":"wa"},{"id":"s2","texte":"B","vrai":false,"why":"wb"},{"id":"s3","texte":"C","vrai":true,"why":"wc"}]}';

  it("modifier un texte ne touche que ce champ", () => {
    const s = parseVfm(obj(P));
    const out = serializeVfm({ ...s, rows: updateRow(s.rows, s.rows[1].key, { texte: "B modifiée" }) });
    expect(json(out)).toBe(P.replace('"texte":"B"', '"texte":"B modifiée"'));
  });

  it("réordonner garde chaque identifiant avec son affirmation", () => {
    const s = parseVfm(obj(P));
    const out = serializeVfm({ ...s, rows: moveAt(s.rows, 2, -1) }) as { affirmations: Obj[] };
    expect(out.affirmations.map((a) => [a.id, a.texte])).toEqual([
      ["s1", "A"],
      ["s3", "C"],
      ["s2", "B"],
    ]);
  });

  it("une affirmation ajoutée reçoit un identifiant neuf, jamais celui d'une supprimée", () => {
    let s = parseVfm(obj(P));
    s = { ...s, rows: s.rows.filter((r) => r.id !== "s3") };
    s = addVfm(s, fixedRand("abcde"));
    const ids = (serializeVfm(s) as { affirmations: Obj[] }).affirmations.map((a) => a.id);
    expect(ids).toEqual(["s1", "s2", "s-abcde"]);
  });

  it("identifiants implicites : rien n'est ajouté tant que l'ordre ne change pas, puis ils sont écrits", () => {
    const P2 = '{"affirmations":[{"texte":"A","vrai":true},{"texte":"B","vrai":false}]}';
    const s = parseVfm(obj(P2));
    expect(json(serializeVfm(s))).toBe(P2);
    const moved = serializeVfm({ ...s, rows: moveAt(s.rows, 0, 1) }) as { affirmations: unknown[] };
    // Le player voyait A = s0 et B = s1 : c'est toujours le cas après échange.
    expect(moved.affirmations).toEqual([
      { id: "s1", texte: "B", vrai: false },
      { id: "s0", texte: "A", vrai: true },
    ]);
  });

  it("alias du player conservés : on réécrit sous la clé lue", () => {
    const P3 = '{"affirmations":[{"id":"x","text":"A","correct":true,"pourquoi":"p"},{"id":"y","text":"B","correct":false}]}';
    const s = parseVfm(obj(P3));
    expect(s.rows[0].f).toEqual({ texte: "A", vrai: true, why: "p" });
    const out = serializeVfm({ ...s, rows: updateRow(s.rows, s.rows[0].key, { texte: "A2", vrai: false }) });
    expect(json(out)).toBe(
      '{"affirmations":[{"id":"x","text":"A2","correct":false,"pourquoi":"p"},{"id":"y","text":"B","correct":false}]}',
    );
  });

  it("nouvelle question : 4 affirmations à compléter, refusées par le serveur tant que vide", () => {
    const s = parseVfm(null);
    expect(s.rows.map((r) => r.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(validateVfm(s).filter((i) => i.level === "error" && i.missing)).toHaveLength(8);
    expect(schemaOk("vraifaux_multi", serializeVfm(s))).toBe(false);
    const filled = {
      ...s,
      rows: s.rows.map((r, i) => ({ ...r, f: { texte: `Affirmation ${i}`, vrai: i % 2 === 0, why: "" } })),
    };
    expect(schemaOk("vraifaux_multi", serializeVfm(filled))).toBe(true);
    expect(json(serializeVfm(filled))).toBe(
      '{"affirmations":[{"id":"s1","texte":"Affirmation 0","vrai":true},{"id":"s2","texte":"Affirmation 1","vrai":false},{"id":"s3","texte":"Affirmation 2","vrai":true},{"id":"s4","texte":"Affirmation 3","vrai":false}]}',
    );
  });

  it("conseille de mélanger vraies et fausses", () => {
    const s = parseVfm(obj(P.replace('"vrai":false', '"vrai":true')));
    expect(validateVfm(s).map((i) => i.message).join(" ")).toMatch(/même réponse/);
  });

  it("vient d'un autre format : repart de zéro sans rien garder", () => {
    const s = parseVfm(obj('{"choix":["a","b"],"indexCorrect":0}'));
    expect(s.foreign).toBe(true);
    expect(Object.keys(serializeVfm(s))).toEqual(["affirmations"]);
  });
});

// ---------------------------------------------------------------------------

describe("Placer sur une échelle", () => {
  const P =
    '{"echelle":{"min":0,"max":50,"unite":"","pas":1},"labelMin":"Bas","labelMax":"Haut","items":[{"id":"dk","label":"Danemark","valeur":27},{"id":"fr","label":"France","valeur":32},{"id":"us","label":"USA","valeur":41},{"id":"de","label":"Allemagne","valeur":30},{"id":"it","label":"Italie","valeur":35}]}';

  it("modifier une borne garde les clés inconnues de l'échelle", () => {
    const s = parseCm(obj(P));
    const out = serializeCm({ ...s, top: { ...s.top, max: "60" } });
    expect(json(out)).toBe(P.replace('"max":50', '"max":60'));
  });

  it("valeurs saisies à la française", () => {
    const s = parseCm(obj(P));
    const out = serializeCm({ ...s, rows: updateRow(s.rows, s.rows[0].key, { valeur: "27,5" }) }) as {
      items: Obj[];
    };
    expect(out.items[0].valeur).toBe(27.5);
  });

  it("repères : même règle que le player", () => {
    // 5 étiquettes → 1 repère : la 3e valeur dans l'ordre croissant (32, France).
    const s = parseCm(obj(P));
    expect([...cmAnchors(s)!].map((k) => s.rows.find((r) => r.key === k)!.f.label)).toEqual(["France"]);
    // 8 étiquettes → 2 repères, aux rangs 2 et 6 (en partant de 0).
    const eight = [10, 20, 30, 40, 50, 60, 70, 80].map((v, i) => ({ id: `x${i}`, real: v }));
    expect([...anchorIdsFor(eight)].sort()).toEqual(["x2", "x6"]);
    // Moins de 4 : aucun.
    expect(anchorIdsFor(eight.slice(0, 3)).size).toBe(0);
  });

  it("repères inconnus tant qu'une valeur manque", () => {
    const s = addCm(parseCm(obj(P)), fixedRand("aaaaa"));
    expect(cmAnchors(s)).toBeNull();
  });

  it("valeur hors de l'échelle et bornes inversées signalées", () => {
    const s = parseCm(obj(P));
    const out = validateCm({ ...s, rows: updateRow(s.rows, s.rows[0].key, { valeur: "70" }) });
    expect(out.find((i) => i.at === `${s.rows[0].key}.valeur`)?.message).toMatch(/Hors de l'échelle : la valeur doit être entre 0 et 50/);
    const inv = validateCm({ ...s, top: { ...s.top, min: "60" } });
    expect(inv.find((i) => i.at === "top.max")?.message).toMatch(/plus grande que le début/);
  });

  it("une étiquette ajoutée a un identifiant neuf ; vide, sa valeur n'est pas écrite", () => {
    const s = addCm(parseCm(obj(P)), fixedRand("k3f9q"));
    const out = serializeCm(s) as { items: Obj[] };
    expect(out.items[5]).toEqual({ id: "it-k3f9q", label: "" });
    expect(validateCm(s).filter((i) => i.missing).map((i) => i.message)).toEqual([
      "Écris le texte de l'étiquette.",
      "Indique sa vraie valeur.",
    ]);
  });

  it("couleur : choisie puis remise en automatique", () => {
    const s = parseCm(obj(P));
    const colored = { ...s, rows: updateRow(s.rows, s.rows[0].key, { color: "var(--teal)" }) };
    expect((serializeCm(colored) as { items: Obj[] }).items[0].color).toBe("var(--teal)");
    const back = { ...colored, rows: updateRow(colored.rows, s.rows[0].key, { color: "" }) };
    expect(json(serializeCm(back))).toBe(P);
  });

  it("nouvelle question valide une fois remplie", () => {
    const s = parseCm(null);
    const filled = {
      ...s,
      top: { min: "0", max: "100", unite: "%", labelMin: "", labelMax: "" },
      rows: s.rows.map((r, i) => ({ ...r, f: { label: `É${i}`, valeur: String(i * 10), color: "" } })),
    };
    expect(validateCm(filled).filter((i) => i.level === "error")).toEqual([]);
    expect(schemaOk("curseur_multi", serializeCm(filled))).toBe(true);
    expect(json(serializeCm(filled))).toBe(
      '{"echelle":{"min":0,"max":100,"unite":"%"},"items":[{"id":"it1","label":"É0","valeur":0},{"id":"it2","label":"É1","valeur":10},{"id":"it3","label":"É2","valeur":20},{"id":"it4","label":"É3","valeur":30}]}',
    );
  });
});

// ---------------------------------------------------------------------------

describe("Classer dans des catégories", () => {
  const P =
    '{"categories":[{"id":"yes","label":"Oui"},{"id":"no","label":"Non"},{"id":"nsp","label":"On ne sait pas"}],"etiquettes":[{"id":"a","texte":"A","categorie":0,"note":"na"},{"id":"b","texte":"B","categorie":1,"note":"nb"},{"id":"c","texte":"C","categorie":2}]}';

  it("réordonner les catégories met à jour les index des éléments", () => {
    const s = parseCat(obj(P));
    const out = serializeCatState({ ...s, cats: moveAt(s.cats, 0, 1) }) as { categories: Obj[]; etiquettes: Obj[] };
    expect(out.categories.map((c) => c.id)).toEqual(["no", "yes", "nsp"]);
    // Chaque élément pointe toujours vers la même catégorie.
    expect(out.etiquettes.map((e) => out.categories[e.categorie as number].id)).toEqual(["yes", "no", "nsp"]);
  });

  it("supprimer une catégorie signale les éléments qui y étaient rangés", () => {
    const s = parseCat(obj(P));
    const st = { ...s, cats: s.cats.filter((c) => c.id !== "nsp") };
    const out = serializeCatState(st) as { etiquettes: Obj[] };
    expect("categorie" in out.etiquettes[2]).toBe(false);
    const issues = validateCatState(st);
    expect(issues.find((i) => i.at === `${s.etqs[2].key}.cat`)?.message).toMatch(/supprimée/);
  });

  it("changer la bonne catégorie d'un élément", () => {
    const s = parseCat(obj(P));
    const st = { ...s, etqs: updateRow(s.etqs, s.etqs[0].key, { cat: s.cats[2].key }) };
    expect((serializeCatState(st) as { etiquettes: Obj[] }).etiquettes[0]).toEqual({
      id: "a",
      texte: "A",
      categorie: 2,
      note: "na",
    });
  });

  it("catégories et éléments ajoutés : identifiants neufs, catégorie à choisir", () => {
    let s = parseCat(obj(P));
    s = addCategory(s, fixedRand("c0001"));
    s = addEtiquette(s, fixedRand("e0001"));
    const out = serializeCatState(s) as { categories: Obj[]; etiquettes: Obj[] };
    expect(out.categories[3]).toEqual({ id: "cat-c0001", label: "" });
    expect(out.etiquettes[3]).toEqual({ id: "e-e0001", texte: "" });
    const msgs = validateCatState(s).map((i) => i.message);
    expect(msgs).toContain("Choisis la bonne catégorie.");
    expect(msgs).toContain("Aucun élément ne va dans cette catégorie.");
  });

  it("catégories en simple texte : la forme est gardée tant qu'elles ne bougent pas", () => {
    const P2 = '{"categories":["Oui","Non"],"etiquettes":[{"texte":"A","categorie":1},{"texte":"B","categorie":0}]}';
    const s = parseCat(obj(P2));
    expect(json(serializeCatState(s))).toBe(P2);
    const renamed = serializeCatState({ ...s, cats: updateRow(s.cats, s.cats[0].key, { label: "Oui !" }) });
    expect(json(renamed)).toBe(P2.replace('"Oui"', '"Oui !"'));
    const moved = serializeCatState({ ...s, cats: moveAt(s.cats, 0, 1) }) as { categories: unknown[]; etiquettes: Obj[] };
    // Le player voyait Oui = b0 et Non = b1 : les identifiants sont écrits.
    expect(moved.categories).toEqual([
      { id: "b1", label: "Non" },
      { id: "b0", label: "Oui" },
    ]);
    expect(moved.etiquettes.map((e) => e.categorie)).toEqual([0, 1]);
  });

  it("correctBinId (alias du player) est tenu à jour", () => {
    const P3 =
      '{"categories":[{"id":"yes","label":"Oui"},{"id":"no","label":"Non"}],"etiquettes":[{"id":"a","texte":"A","correctBinId":"no"},{"id":"b","texte":"B","correctBinId":"yes"}]}';
    const s = parseCat(obj(P3));
    expect(json(serializeCatState(s))).toBe(P3);
    const st = { ...s, etqs: updateRow(s.etqs, s.etqs[0].key, { cat: s.cats[0].key }) };
    expect((serializeCatState(st) as { etiquettes: Obj[] }).etiquettes[0]).toEqual({ id: "a", texte: "A", correctBinId: "yes" });
  });

  it("une référence de catégorie invalide est signalée et conservée telle quelle", () => {
    const P4 =
      '{"categories":[{"id":"yes","label":"Oui"},{"id":"no","label":"Non"}],"etiquettes":[{"id":"a","texte":"A","categorie":5},{"id":"b","texte":"B","categorie":0}]}';
    const s = parseCat(obj(P4));
    expect(json(serializeCatState(s))).toBe(P4);
    expect(validateCatState(s).find((i) => i.at === `${s.etqs[0].key}.cat`)?.message).toMatch(/introuvable/);
  });

  it("identifiants des éléments lus comme le player", () => {
    const P5 = '{"categories":[{"id":"y","label":"Oui"},{"id":"n","label":"Non"}],"etiquettes":[{"texte":"A","categorie":0},{"texte":"B","categorie":1}]}';
    const s = parseCat(obj(P5));
    const moved = serializeCatState({ ...s, etqs: moveAt(s.etqs, 0, 1) }) as { etiquettes: unknown[] };
    expect(playerIds(moved.etiquettes, "it")).toEqual(["it1", "it0"]);
  });
});

// ---------------------------------------------------------------------------

describe("Répartir des points", () => {
  const P =
    '{"total":100,"step":5,"parts":[{"id":"tva","label":"TVA","valeur":45},{"id":"ir","label":"IR","valeur":25},{"id":"is","label":"IS","valeur":15},{"id":"autres","label":"Autres","valeur":15}]}';

  it("compteur : somme juste, puis écart signalé", () => {
    const s = parsePd(obj(P));
    expect(pdSum(s)).toEqual({ sum: 100, unreadable: 0 });
    expect(validatePd(s).filter((i) => i.level === "error")).toEqual([]);
    const st = { ...s, rows: updateRow(s.rows, s.rows[0].key, { valeur: "40" }) };
    expect(validatePd(st).find((i) => i.at === "list.sum")?.message).toBe(
      "La somme des vraies parts fait 95 au lieu de 100 : il manque 5.",
    );
    const over = { ...s, rows: updateRow(s.rows, s.rows[0].key, { valeur: "55" }) };
    expect(validatePd(over).find((i) => i.at === "list.sum")?.message).toMatch(/10 de trop/);
  });

  it("décimales : 0,1 + 0,2 font bien 0,3", () => {
    const s = parsePd(obj('{"total":0.3,"step":0.1,"parts":[{"id":"a","label":"A","valeur":0.1},{"id":"b","label":"B","valeur":0.2}]}'));
    expect(validatePd(s).filter((i) => i.level === "error")).toEqual([]);
  });

  it("total vide : 100 par défaut, clé non écrite", () => {
    const s = parsePd(obj(P));
    const st = { ...s, top: { ...s.top, total: "" } };
    expect(validatePd(st).filter((i) => i.level === "error")).toEqual([]);
    expect("total" in serializePd(st)).toBe(false);
  });

  it("part négative, plus grande que le total, illisible", () => {
    const s = parsePd(obj(P));
    const msg = (v: string) =>
      validatePd({ ...s, rows: updateRow(s.rows, s.rows[0].key, { valeur: v }) }).find(
        (i) => i.at === `${s.rows[0].key}.valeur`,
      )?.message;
    expect(msg("-5")).toMatch(/négative/);
    expect(msg("120")).toMatch(/Plus grand que le total/);
    expect(msg("beaucoup")).toMatch(/Nombre attendu/);
    expect(msg("47")).toMatch(/multiple de 5/);
  });

  it("alias `real` du player conservé", () => {
    const P2 = '{"total":10,"step":1,"parts":[{"id":"a","label":"A","real":4},{"id":"b","label":"B","real":6}]}';
    const s = parsePd(obj(P2));
    const out = serializePd({ ...s, rows: updateRow(s.rows, s.rows[0].key, { valeur: "5" }) });
    expect(json(out)).toBe(P2.replace('"real":4', '"real":5'));
  });

  it("réordonner garde les identifiants (statistiques par catégorie)", () => {
    const s = parsePd(obj(P));
    const out = serializePd({ ...s, rows: moveAt(s.rows, 3, -1) }) as { parts: Obj[] };
    expect(out.parts.map((p) => p.id)).toEqual(["tva", "ir", "autres", "is"]);
  });

  it("nouvelle question : total 100 et pas de 5 écrits", () => {
    const s = parsePd(null);
    const filled = {
      ...s,
      rows: s.rows.map((r, i) => ({ ...r, f: { label: `C${i}`, valeur: ["50", "30", "20"][i], color: "" } })),
    };
    expect(json(serializePd(filled))).toBe(
      '{"total":100,"step":5,"parts":[{"id":"p1","label":"C0","valeur":50},{"id":"p2","label":"C1","valeur":30},{"id":"p3","label":"C2","valeur":20}]}',
    );
    expect(schemaOk("pondere", serializePd(filled))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("Remettre dans l'ordre", () => {
  it("éléments objets : plus de « [object Object] », le chiffre est éditable", () => {
    const P = '{"items":[{"id":"edu","label":"Éducation","figure":"78 Md€"},{"id":"dette","label":"Dette","figure":"52 Md€"},{"id":"def","label":"Défense"}]}';
    const s = parseCl(obj(P));
    expect(s.rows.map((r) => r.f)).toEqual([
      { label: "Éducation", figure: "78 Md€" },
      { label: "Dette", figure: "52 Md€" },
      { label: "Défense", figure: "" },
    ]);
    const out = serializeCl({ ...s, rows: updateRow(s.rows, s.rows[2].key, { figure: "50 Md€" }) });
    expect(json(out)).toBe(P.replace('"label":"Défense"}', '"label":"Défense","figure":"50 Md€"}'));
  });

  it("éléments en simple texte : forme gardée, identifiants écrits s'ils changent de place", () => {
    const P = '{"items":["Tabac","Alcool","Pollution"],"ordreCorrect":[0,1,2]}';
    const s = parseCl(obj(P));
    expect(json(serializeCl(s))).toBe(P);
    const out = serializeCl({ ...s, rows: moveAt(s.rows, 0, 1) }) as { items: unknown[]; ordreCorrect: number[] };
    expect(out.items).toEqual([{ id: "i1", label: "Alcool" }, { id: "i0", label: "Tabac" }, "Pollution"]);
    expect(playerIds(out.items, "i")).toEqual(["i1", "i0", "i2"]);
    expect(out.ordreCorrect).toEqual([0, 1, 2]);
  });

  it("ajout dans une liste en simple texte : nouvel identifiant, ordreCorrect suivi", () => {
    const P = '{"items":["A","B","C"],"ordreCorrect":[0,1,2]}';
    const s = addCl(parseCl(obj(P)), fixedRand("nnnnn"));
    const filled = { ...s, rows: updateRow(s.rows, s.rows[3].key, { label: "D" }) };
    expect(json(serializeCl(filled))).toBe('{"items":["A","B","C",{"id":"i-nnnnn","label":"D"}],"ordreCorrect":[0,1,2,3]}');
  });

  it("nouvelle question : objets avec identifiants, sans ordreCorrect", () => {
    const s = parseCl(null);
    const filled = { ...s, rows: s.rows.map((r, i) => ({ ...r, f: { label: `É${i}`, figure: "" } })) };
    expect(json(serializeCl(filled))).toBe(
      '{"items":[{"id":"i1","label":"É0"},{"id":"i2","label":"É1"},{"id":"i3","label":"É2"},{"id":"i4","label":"É3"}]}',
    );
    expect(schemaOk("classement", serializeCl(filled))).toBe(true);
  });

  it("ne confond pas un payload d'échelle avec un classement", () => {
    expect(parseCl(obj('{"echelle":{"min":0,"max":1},"items":[]}')).foreign).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("Vrai ou faux", () => {
  it("nouvelle question : réponse à choisir, refusée par le serveur sinon", () => {
    const s = parseVf(null);
    expect(json(serializeVf(s))).toBe("{}");
    expect(validateVf(s)[0].message).toMatch(/Vrai ou Faux/);
    expect(json(serializeVf({ ...s, value: false }))).toBe('{"reponseCorrecte":false}');
  });
  it("aller-retour exact", () => {
    expect(json(serializeVf(parseVf(obj('{"reponseCorrecte":true}'))))).toBe('{"reponseCorrecte":true}');
  });
});

describe("A ou B", () => {
  it("valeurs saisies → nombres ; les deux vidées → clé retirée", () => {
    const s = parseAb(obj('{"choix":["A","B"],"indexCorrect":1,"valeurs":[97,47],"unite":"€"}'));
    expect(json(serializeAb({ ...s, valeurs: ["97,5", "47"] }))).toBe(
      '{"choix":["A","B"],"indexCorrect":1,"valeurs":[97.5,47],"unite":"€"}',
    );
    expect(json(serializeAb({ ...s, valeurs: ["", ""], unite: "" }))).toBe('{"choix":["A","B"],"indexCorrect":1}');
  });

  it("valeurs non numériques d'origine gardées tant qu'on n'y touche pas", () => {
    const P = '{"choix":["Train","Route"],"indexCorrect":1,"valeurs":["~10 %","~88 %"],"unite":"Part"}';
    const s = parseAb(obj(P));
    expect(json(serializeAb(s))).toBe(P);
    expect(json(serializeAb({ ...s, valeurs: ["10", s.valeurs[1]] }))).toBe(P.replace('"~10 %"', "10"));
    expect(validateAb(s).filter((i) => i.level === "warning")).toHaveLength(2);
  });

  it("une seule valeur renseignée : conseil", () => {
    const s = parseAb(obj('{"choix":["A","B"],"indexCorrect":0}'));
    expect(validateAb({ ...s, valeurs: ["12", ""] }).map((i) => i.message).join(" ")).toMatch(/les deux valeurs/);
  });

  it("un QCM à 4 choix passé en A/B : les deux premiers choix sont repris, sans le reste", () => {
    const s = parseAb(obj('{"choix":["a","b","c","d"],"indexCorrect":1}'));
    expect(s.foreign).toBe(true);
    expect(json(serializeAb(s))).toBe('{"choix":["a","b"],"indexCorrect":1}');
  });
});

describe("QCM", () => {
  const P = '{"choix":["A","B","C","D"],"indexCorrect":2}';

  it("supprimer un choix avant la bonne réponse décale l'index", () => {
    const s = parseQcm(obj(P));
    expect(json(serializeQcm(removeQcmChoice(s, s.choices[0].key)))).toBe('{"choix":["B","C","D"],"indexCorrect":1}');
  });

  it("supprimer la bonne réponse : plus de bonne réponse (au lieu du premier choix en silence)", () => {
    const s = parseQcm(obj(P));
    const st = removeQcmChoice(s, s.choices[2].key);
    expect(json(serializeQcm(st))).toBe('{"choix":["A","B","D"]}');
    expect(validateQcm(st).map((i) => i.message)).toContain("Marque la bonne réponse.");
    expect(schemaOk("qcm", serializeQcm(st))).toBe(false);
  });

  it("ajouter un choix", () => {
    const s = addQcmChoice(parseQcm(obj('{"choix":["A","B"],"indexCorrect":0}')));
    const st = { ...s, choices: s.choices.map((c, i) => (i === 2 ? { ...c, text: "C" } : c)) };
    expect(json(serializeQcm(st))).toBe('{"choix":["A","B","C"],"indexCorrect":0}');
  });

  it("un A/B passé en QCM : choix et bonne réponse repris, valeurs abandonnées", () => {
    const s = parseQcm(obj('{"choix":["A","B"],"indexCorrect":1,"valeurs":[1,2],"unite":"%"}'));
    expect(s.foreign).toBe(true);
    expect(json(serializeQcm(s))).toBe('{"choix":["A","B"],"indexCorrect":1}');
  });
});
