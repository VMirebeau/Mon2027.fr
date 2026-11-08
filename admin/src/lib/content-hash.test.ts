// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CONTENT_FIELDS, contentChanged, contentHash, diffQuestion, stateHash } from "./content-hash";

// Implémentation jumelle exécutée en prod hors de Next.
const require = createRequire(import.meta.url);
const sync = require("../../../scripts/content-sync.cjs") as {
  CONTENT_FIELDS: string[];
  contentHash: typeof contentHash;
  stateHash: typeof stateHash;
  diffQuestion: typeof diffQuestion;
  planPush: (args: {
    incoming: { q: Record<string, unknown>; sources: Src[] }[];
    prod: { q: Record<string, unknown>; sources: Src[]; humanEdited: boolean }[];
    base?: Record<string, string>;
  }) => Record<"created" | "updated" | "identical" | "prodAhead" | "conflicts" | "prodOnly" | "deletedInProd", { key: string }[]>;
};

type Src = { nom: string; url: string; type: string; ordre: number };

const question = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  customId: "Q-IMM-001",
  slug: "immigres",
  theme: "Immigration",
  sousTheme: null,
  format: "estimation_numerique",
  statut: "publie",
  sensibilite: "haute",
  difficulte: 3,
  question: "Quelle part de la population est immigrée ?",
  precisions: null,
  explication: "10,7 % en 2023 selon l'Insee.",
  contextePedagogique: "Perception surestimée.",
  miseEnPerspective: null,
  indicators: '[{"id":"migration","polarity":1}]',
  unite: "%",
  plageMin: 0,
  plageMax: 50,
  reponseNumerique: 10.7,
  toleranceVerte: 2,
  toleranceOrange: 5,
  payload: null,
  dateDonnee: 2023,
  auteur: "alice",
  valideurs: null,
  ...over,
});
const sources: Src[] = [
  { nom: "Insee", url: "https://insee.fr/b", type: "primaire", ordre: 0 },
  { nom: "Eurostat", url: "https://ec.europa.eu/a", type: "triangulation", ordre: 1 },
];

describe("empreinte du contenu", () => {
  it("TS et script de prod produisent exactement les mêmes empreintes", () => {
    expect(sync.CONTENT_FIELDS).toEqual([...CONTENT_FIELDS]);
    for (const q of [question(), question({ precisions: "Résidents", reponseNumerique: 10.3 }), question({ indicators: null })]) {
      expect(sync.contentHash(q, sources)).toBe(contentHash(q, sources));
      expect(sync.stateHash(q, sources)).toBe(stateHash(q, sources));
    }
    const after = question({ explication: "Nouvelle explication." });
    expect(sync.diffQuestion(question(), sources, after, sources.slice(1))).toEqual(
      diffQuestion(question(), sources, after, sources.slice(1)),
    );
  });

  it("ignore l'ordre des sources en entrée, le statut, l'auteur et les identifiants", () => {
    const h = contentHash(question(), sources);
    expect(contentHash(question(), [...sources].reverse())).toBe(h);
    expect(contentHash(question({ statut: "brouillon", auteur: "x", id: "autre", valideurs: "[]" }), sources)).toBe(h);
  });

  it("change dès qu'un champ de contenu ou une source change", () => {
    const h = contentHash(question(), sources);
    expect(contentHash(question({ reponseNumerique: 10.8 }), sources)).not.toBe(h);
    expect(contentHash(question(), [{ ...sources[0], url: "https://insee.fr/c" }, sources[1]])).not.toBe(h);
  });

  it("le diff distingue contenu et simple changement de statut", () => {
    const statutOnly = diffQuestion(question(), sources, question({ statut: "retire" }), sources);
    expect(statutOnly).toEqual({ statut: ["publie", "retire"] });
    expect(contentChanged(statutOnly)).toBe(false);
    const content = diffQuestion(question(), sources, question({ question: "Autre ?" }), sources);
    expect(contentChanged(content)).toBe(true);
  });
});

describe("fusion local → prod", () => {
  const entry = (over: Record<string, unknown> = {}, humanEdited = false) => ({
    q: question(over),
    sources,
    humanEdited,
  });
  const keys = (plan: ReturnType<typeof sync.planPush>, k: keyof ReturnType<typeof sync.planPush>) =>
    plan[k].map((e) => e.key);

  it("crée les nouvelles questions et ne supprime jamais rien", () => {
    const plan = sync.planPush({
      incoming: [entry({ customId: "Q-NEW-001", slug: "nouvelle" })],
      prod: [entry()],
    });
    expect(keys(plan, "created")).toEqual(["Q-NEW-001"]);
    expect(keys(plan, "prodOnly")).toEqual(["Q-IMM-001"]);
  });

  it("met à jour si la prod n'a pas bougé depuis la base", () => {
    const base = { "Q-IMM-001": stateHash(question(), sources) };
    const plan = sync.planPush({ incoming: [entry({ difficulte: 4 })], prod: [entry({}, true)], base });
    expect(keys(plan, "updated")).toEqual(["Q-IMM-001"]);
  });

  it("garde la prod si seul un contributeur l'a modifiée", () => {
    const base = { "Q-IMM-001": stateHash(question(), sources) };
    const plan = sync.planPush({ incoming: [entry()], prod: [entry({ difficulte: 2 }, true)], base });
    expect(keys(plan, "prodAhead")).toEqual(["Q-IMM-001"]);
    expect(plan.updated).toEqual([]);
  });

  it("signale un conflit si les deux côtés ont changé", () => {
    const base = { "Q-IMM-001": stateHash(question(), sources) };
    const plan = sync.planPush({ incoming: [entry({ difficulte: 4 })], prod: [entry({ difficulte: 2 }, true)], base });
    expect(keys(plan, "conflicts")).toEqual(["Q-IMM-001"]);
  });

  it("sans base : n'écrase pas une question déjà retouchée par un contributeur", () => {
    expect(keys(sync.planPush({ incoming: [entry({ difficulte: 4 })], prod: [entry()] }), "updated")).toEqual([
      "Q-IMM-001",
    ]);
    expect(
      keys(sync.planPush({ incoming: [entry({ difficulte: 4 })], prod: [entry({}, true)] }), "conflicts"),
    ).toEqual(["Q-IMM-001"]);
  });

  it("ne ressuscite pas une question supprimée en prod depuis la dernière synchro", () => {
    const base = { "Q-IMM-001": stateHash(question(), sources) };
    const untouched = sync.planPush({ incoming: [entry()], prod: [], base });
    expect(keys(untouched, "deletedInProd")).toEqual(["Q-IMM-001"]);
    expect(untouched.created).toEqual([]);
    const editedLocally = sync.planPush({ incoming: [entry({ difficulte: 5 })], prod: [], base });
    expect(keys(editedLocally, "conflicts")).toEqual(["Q-IMM-001"]);
  });

  it("le statut local voyage avec le contenu", () => {
    const base = { "Q-IMM-001": stateHash(question({ statut: "revue" }), sources) };
    const plan = sync.planPush({ incoming: [entry({ statut: "publie" })], prod: [entry({ statut: "revue" })], base });
    expect(keys(plan, "updated")).toEqual(["Q-IMM-001"]);
  });
});
