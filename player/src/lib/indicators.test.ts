import { describe, expect, it } from "vitest";
import {
  INDICATORS,
  INDICATOR_IDS,
  isIndicatorId,
  parseQuestionIndicators,
} from "./indicators";

describe("INDICATORS taxonomy", () => {
  it("chaque id est unique", () => {
    const ids = INDICATOR_IDS;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque id a un meta complet", () => {
    for (const id of INDICATOR_IDS) {
      const meta = INDICATORS[id];
      expect(meta.id).toBe(id);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.subjectShort.length).toBeGreaterThan(0);
      expect(meta.definitionPlus1.length).toBeGreaterThan(20);
    }
  });

  it("isIndicatorId valide les ids connus", () => {
    expect(isIndicatorId("precarite")).toBe(true);
    expect(isIndicatorId("inconnu")).toBe(false);
    expect(isIndicatorId(null)).toBe(false);
    expect(isIndicatorId(42)).toBe(false);
  });
});

describe("parseQuestionIndicators", () => {
  it("null/undefined → tableau vide", () => {
    expect(parseQuestionIndicators(null)).toEqual([]);
    expect(parseQuestionIndicators(undefined)).toEqual([]);
    expect(parseQuestionIndicators("")).toEqual([]);
  });

  it("JSON corrompu → tableau vide (pas de throw)", () => {
    expect(parseQuestionIndicators("not json")).toEqual([]);
    expect(parseQuestionIndicators("{}")).toEqual([]);
  });

  it("parse tableau valide", () => {
    const out = parseQuestionIndicators(
      JSON.stringify([
        { id: "precarite", polarity: 1 },
        { id: "logement", polarity: -1 },
      ]),
    );
    expect(out).toEqual([
      { id: "precarite", polarity: 1 },
      { id: "logement", polarity: -1 },
    ]);
  });

  it("filtre les ids inconnus", () => {
    const out = parseQuestionIndicators(
      JSON.stringify([
        { id: "precarite", polarity: 1 },
        { id: "inconnu", polarity: 1 },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("precarite");
  });

  it("filtre les polarités invalides", () => {
    const out = parseQuestionIndicators(
      JSON.stringify([
        { id: "precarite", polarity: 1 },
        { id: "ecole", polarity: 0 },
        { id: "sante", polarity: "+1" },
      ]),
    );
    expect(out).toHaveLength(1);
  });

  it("cap à 3 indicateurs max", () => {
    const out = parseQuestionIndicators(
      JSON.stringify([
        { id: "precarite", polarity: 1 },
        { id: "logement", polarity: 1 },
        { id: "ecole", polarity: 1 },
        { id: "sante", polarity: 1 },
        { id: "migration", polarity: 1 },
      ]),
    );
    expect(out).toHaveLength(3);
  });
});
