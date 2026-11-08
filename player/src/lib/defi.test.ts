import { describe, expect, it } from "vitest";
import {
  parseAnswersMap,
  parseQuestionIds,
  reorderQuestions,
  scoreFromAnswers,
  validateCreatePayload,
  validateResponsePayload,
} from "./defi";
import type { Question } from "./types";

// UUID v4 valide pour les tests.
const UUID = "12345678-1234-4123-9123-123456789012";
const UUID2 = "abcdef12-3456-4789-abcd-ef1234567890";

describe("validateCreatePayload", () => {
  function base() {
    return {
      creatorClientId: UUID,
      creatorPseudo: "Alice",
      questionIds: ["q1", "q2", "q3"],
      source: "theme",
      themeId: "immigration",
      creatorAnswers: {
        q1: { value: 42, correct: true },
        q2: { value: false, correct: false },
        q3: { value: null, correct: false },
      },
    };
  }

  it("accepte un payload bien formé", () => {
    const r = validateCreatePayload(base());
    expect(r.ok).toBe(true);
  });

  it("rejette un creatorClientId qui n'est pas un UUID", () => {
    const r = validateCreatePayload({ ...base(), creatorClientId: "short" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad_creatorClientId");
  });

  it("rejette un UUID invalide (mauvais format hex)", () => {
    const r = validateCreatePayload({
      ...base(),
      creatorClientId: "xxxxxxxx-1234-4123-9123-123456789012",
    });
    expect(r.ok).toBe(false);
  });

  it("rejette si moins de 3 questions", () => {
    const r = validateCreatePayload({
      ...base(),
      questionIds: ["q1", "q2"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("questionIds_count");
  });

  it("rejette si plus de 10 questions", () => {
    const r = validateCreatePayload({
      ...base(),
      questionIds: Array.from({ length: 11 }, (_, i) => `q${i}`),
    });
    expect(r.ok).toBe(false);
  });

  it("rejette si source n'est ni theme ni favoris", () => {
    const r = validateCreatePayload({ ...base(), source: "random" });
    expect(r.ok).toBe(false);
  });

  it("rejette si source=theme sans themeId", () => {
    const r = validateCreatePayload({
      ...base(),
      source: "theme",
      themeId: undefined,
    });
    expect(r.ok).toBe(false);
  });

  it("tronque le pseudo à 40 caractères et trim", () => {
    const r = validateCreatePayload({
      ...base(),
      creatorPseudo: "  " + "A".repeat(50) + "  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.creatorPseudo.length).toBe(40);
  });

  it("title absent ou vide → null", () => {
    const r1 = validateCreatePayload(base());
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.data.title).toBeNull();

    const r2 = validateCreatePayload({ ...base(), title: "   " });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.data.title).toBeNull();

    const r3 = validateCreatePayload({ ...base(), title: null });
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.data.title).toBeNull();
  });

  it("title trimmé et capé à 60 caractères", () => {
    const r = validateCreatePayload({
      ...base(),
      title: "  " + "A".repeat(80) + "  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.title).not.toBeNull();
      expect(r.data.title!.length).toBe(60);
    }
  });

  it("rejette un title non-string", () => {
    const r = validateCreatePayload({ ...base(), title: { foo: "bar" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad_title");
  });
});

describe("validateResponsePayload", () => {
  it("accepte un payload bien formé", () => {
    const r = validateResponsePayload({
      amiClientId: UUID2,
      amiLabel: "Sarah",
      answers: { q1: { value: 5, correct: true } },
    });
    expect(r.ok).toBe(true);
  });

  it("amiLabel vide devient 'Anonyme'", () => {
    const r = validateResponsePayload({
      amiClientId: UUID2,
      amiLabel: "   ",
      answers: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.amiLabel).toBe("Anonyme");
  });

  it("rejette amiClientId non-UUID", () => {
    const r = validateResponsePayload({
      amiClientId: "tooshort",
      amiLabel: "Sarah",
      answers: {},
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseQuestionIds / parseAnswersMap", () => {
  it("parseQuestionIds parse un array JSON", () => {
    expect(parseQuestionIds('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("parseQuestionIds throw si pas un array de strings", () => {
    expect(() => parseQuestionIds('"not-array"')).toThrow();
    expect(() => parseQuestionIds("[1,2,3]")).toThrow();
  });

  it("parseAnswersMap filtre les entrées sans 'correct' booléen", () => {
    const parsed = parseAnswersMap(
      JSON.stringify({
        ok: { value: 1, correct: true },
        bad: { value: 1 }, // pas de correct
        worse: "not-an-object",
      }),
    );
    expect(Object.keys(parsed)).toEqual(["ok"]);
  });

  it("parseAnswersMap throw sur un input non-object", () => {
    expect(() => parseAnswersMap("[]")).toThrow();
    expect(() => parseAnswersMap("null")).toThrow();
  });
});

describe("scoreFromAnswers", () => {
  it("compte les correct: true", () => {
    expect(
      scoreFromAnswers({
        a: { value: 1, correct: true },
        b: { value: 2, correct: false },
        c: { value: 3, correct: true },
      }),
    ).toBe(2);
  });

  it("renvoie 0 sur un map vide", () => {
    expect(scoreFromAnswers({})).toBe(0);
  });
});

describe("reorderQuestions", () => {
  const qs = [
    { id: "a" } as Question,
    { id: "b" } as Question,
    { id: "c" } as Question,
  ];

  it("réordonne selon l'ordre d'origine", () => {
    expect(reorderQuestions(qs, ["c", "a", "b"]).map((q) => q.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("saute les questions absentes (dépubliées)", () => {
    expect(reorderQuestions(qs, ["a", "missing", "c"]).map((q) => q.id)).toEqual([
      "a",
      "c",
    ]);
  });
});
