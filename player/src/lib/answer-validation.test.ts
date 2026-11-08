import { describe, expect, it } from "vitest";
import { MAX_ANSWER_JSON, rescoreAnswers, serializeForStats, validateAnswer } from "./answer-validation";
import type { Question } from "./types";

// Questions minimales : seuls les champs lus par la validation et isCorrect.
const q = (over: Record<string, unknown>) => ({ id: "Q-T-1", theme: "Test", question: "?", ...over }) as unknown as Question;

const estimation = q({ format: "estimation", range: [0, 50], step: 0.5, answer: 10.7, closeWithin: 2, midWithin: 5 });
const qcm = q({ format: "qcm", choices: ["a", "b", "c"], correctIndex: 2 });
const classement = q({ format: "classement", items: [{ id: "i1" }, { id: "i2" }, { id: "i3" }], correctOrder: ["i1", "i2", "i3"] });
const vfm = q({ format: "vraifaux_multi", statements: [{ id: "s1", correct: true }, { id: "s2", correct: false }] });
const cat = q({
  format: "categorisation",
  bins: [{ id: "b1" }, { id: "b2" }],
  items: [{ id: "it1", correct: "b1" }, { id: "it2", correct: "b2" }],
});
const pondere = q({ format: "pondere", pool: 100, categories: [{ id: "c1", real: 60 }, { id: "c2", real: 40 }] });

describe("validateAnswer", () => {
  it("estimation : nombre fini dans la plage (à un pas près)", () => {
    expect(validateAnswer(estimation, 12)).toEqual({ ok: true, value: 12 });
    expect(validateAnswer(estimation, 50.5).ok).toBe(true);
    expect(validateAnswer(estimation, 51).ok).toBe(false);
    expect(validateAnswer(estimation, Number.NaN).ok).toBe(false);
    expect(validateAnswer(estimation, "12").ok).toBe(false);
  });

  it("qcm : index entier dans les choix (le bug « options » laissait tout passer)", () => {
    expect(validateAnswer(qcm, 2).ok).toBe(true);
    expect(validateAnswer(qcm, 3).ok).toBe(false);
    expect(validateAnswer(qcm, 1.5).ok).toBe(false);
  });

  it("classement : uniquement des ids de la question, sans doublon", () => {
    expect(validateAnswer(classement, ["i3", "i1", "i2"]).ok).toBe(true);
    expect(validateAnswer(classement, ["i1", "i1"]).ok).toBe(false);
    expect(validateAnswer(classement, ["i1", "inventé"]).ok).toBe(false);
  });

  it("formats composites : clés inventées et valeurs du mauvais type refusées", () => {
    expect(validateAnswer(vfm, { s1: true, s2: false }).ok).toBe(true);
    expect(validateAnswer(vfm, { s1: true, pirate: true }).ok).toBe(false);
    expect(validateAnswer(vfm, { s1: "oui" }).ok).toBe(false);
    expect(validateAnswer(vfm, {}).ok).toBe(false);
    expect(validateAnswer(cat, { it1: "b1", it2: "b9" }).ok).toBe(false);
    expect(validateAnswer(pondere, { c1: 60, c2: 40 }).ok).toBe(true);
    expect(validateAnswer(pondere, { c1: 1e9 }).ok).toBe(false);
  });

  it("taille bornée", () => {
    const many = q({ format: "classement", items: Array.from({ length: 300 }, (_, i) => ({ id: `item-${i}-${"x".repeat(5)}` })) });
    const order = Array.from({ length: 300 }, (_, i) => `item-${i}-${"x".repeat(5)}`);
    expect(JSON.stringify(order).length).toBeGreaterThan(MAX_ANSWER_JSON);
    expect(validateAnswer(many, order)).toEqual({ ok: false, error: "too_large" });
  });

  it("sérialisation pour les statistiques", () => {
    expect(serializeForStats(3.5)).toBe("3.5");
    expect(serializeForStats(true)).toBe("true");
    expect(serializeForStats(["a", "b"])).toBe('["a","b"]');
  });
});

describe("rescoreAnswers (défis)", () => {
  it("recalcule la justesse et ignore le flag `correct` du client", () => {
    const out = rescoreAnswers([qcm], {
      [qcm.id]: { value: 0, correct: true }, // le client prétend « juste »
    } as unknown as Record<string, { value: unknown }>);
    expect(out[qcm.id]).toEqual({ value: 0, correct: false });
  });

  it("ne garde que les questions du défi et neutralise les valeurs invalides", () => {
    const vfm2 = { ...vfm, id: "Q-T-2" } as Question;
    const out = rescoreAnswers([qcm, vfm2], {
      [qcm.id]: { value: 2 },
      "Q-T-2": { value: { pirate: true } },
      "Q-HORS-DEFI": { value: 1 },
    } as Record<string, { value: unknown }>);
    expect(Object.keys(out).sort()).toEqual(["Q-T-1", "Q-T-2"]);
    expect(out[qcm.id]).toEqual({ value: 2, correct: true });
    expect(out["Q-T-2"]).toEqual({ value: null, correct: false });
  });
});
