import { describe, expect, it } from "vitest";
import { normalize, searchQuestions } from "./question-search";
import type { Question } from "./types";

const q = (id: string, theme: string, question: string, precisions?: string): Question =>
  ({
    id,
    customId: id,
    slug: id,
    theme,
    format: "vraifaux",
    question,
    precisions,
    correctAnswer: true,
    difficulte: 3,
    avgUserText: "",
    pctClose: 0,
    pctOff: 0,
    why: "",
    explain: "",
    sources: [],
  }) as unknown as Question;

describe("normalize", () => {
  it("lowercase + strip diacritics", () => {
    expect(normalize("Économie")).toBe("economie");
    expect(normalize("DÉJÀ")).toBe("deja");
  });
  it("idempotent sur ascii", () => {
    expect(normalize("hello")).toBe("hello");
  });
});

describe("searchQuestions", () => {
  const qs = [
    q("a", "Climat", "Combien d'émissions de CO2 en France ?", "données 2023"),
    q("b", "Économie", "Quel est le salaire médian ?"),
    q("c", "Climat", "L'agriculture émet-elle plus que les transports ?"),
    q("d", "Économie", "Le SMIC concerne combien de personnes ?", "France métropolitaine"),
  ];

  it("retourne tableau vide pour query vide", () => {
    expect(searchQuestions(qs, "")).toEqual([]);
    expect(searchQuestions(qs, "   ")).toEqual([]);
  });

  it("match insensible casse et accents", () => {
    const r = searchQuestions(qs, "EMISSIONS");
    expect(r.map((x) => x.id)).toContain("a");
  });

  it("priorise match énoncé > précisions > thème", () => {
    // "France" est dans énoncé de "a", précisions de "d", thème ni l'un ni
    // l'autre → "a" doit ressortir avant "d".
    const r = searchQuestions(qs, "France");
    expect(r[0].id).toBe("a");
    expect(r[1].id).toBe("d");
  });

  it("respecte le cap limit", () => {
    const r = searchQuestions(qs, "e", 2);
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("match thème seul fonctionne", () => {
    const r = searchQuestions(qs, "climat");
    expect(r.map((x) => x.id)).toEqual(expect.arrayContaining(["a", "c"]));
  });
});
