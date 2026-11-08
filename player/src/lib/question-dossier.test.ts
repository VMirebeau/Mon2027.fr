import { describe, expect, it } from "vitest";
import { dossierOf, withoutDossier } from "./question-dossier";
import type { Question } from "./types";

const q = {
  id: "Q-1",
  theme: "Économie",
  format: "vraifaux",
  question: "La dette dépasse 100 % du PIB ?",
  answer: true,
  why: "Contexte",
  explain: "Le chiffre",
  miseEnPerspective: "Depuis 2000…",
  sources: [{ name: "INSEE", url: "https://insee.fr", tag: "Source primaire" }],
} as unknown as Question;

describe("dossier des questions", () => {
  it("retire le dossier sans toucher au reste", () => {
    const lite = withoutDossier(q);
    expect(lite.dossierDeferred).toBe(true);
    expect(lite.why).toBe("");
    expect(lite.sources).toEqual([]);
    expect(lite.miseEnPerspective).toBeUndefined();
    expect(lite.question).toBe(q.question);
    expect((lite as { answer?: unknown }).answer).toBe(true);
  });

  it("le dossier extrait suffit à reconstituer la question", () => {
    expect({ ...withoutDossier(q), ...dossierOf(q), dossierDeferred: undefined }).toEqual({
      ...q,
      dossierDeferred: undefined,
    });
  });
});
