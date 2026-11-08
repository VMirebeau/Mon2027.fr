import { describe, expect, it } from "vitest";
import {
  answerLevel,
  countLevel,
  CORRECTNESS_THRESHOLDS,
  isCorrect,
  LEVEL_LABEL,
} from "./correctness";
import type { Answer, Question } from "./types";

const q = (over: Record<string, unknown>) =>
  ({ id: "Q-T", theme: "Test", question: "?", why: "", explain: "", sources: [], ...over }) as unknown as Question;

const ids = (n: number, p = "i") => Array.from({ length: n }, (_, i) => `${p}${i}`);

const estimation = q({ format: "estimation", range: [0, 100], step: 1, answer: 50, closeWithin: 5, midWithin: 15 });
const vf = q({ format: "vraifaux", correctAnswer: false });
const qcm = q({ format: "qcm", choices: ["a", "b", "c"], correctIndex: 1 });
const classement5 = q({
  format: "classement",
  items: ids(5).map((id) => ({ id, label: id })),
  correctOrder: ids(5),
});
const vfm = (n: number) =>
  q({ format: "vraifaux_multi", statements: ids(n, "s").map((id) => ({ id, text: id, correct: true })) });
const cat = (n: number) =>
  q({
    format: "categorisation",
    bins: [{ id: "b1", label: "B1" }, { id: "b2", label: "B2" }],
    items: ids(n).map((id) => ({ id, label: id, correct: "b1" })),
  });
const pondere = q({
  format: "pondere",
  pool: 100,
  step: 5,
  categories: [
    { id: "c1", label: "C1", real: 60 },
    { id: "c2", label: "C2", real: 40 },
  ],
});
const curseur = q({
  format: "curseur_multi",
  range: [0, 100],
  items: [
    { id: "a", label: "A", real: 10 },
    { id: "b", label: "B", real: 90 },
  ],
});

/// `k` affirmations / cartes justes sur `n`.
const vfmAnswer = (n: number, k: number) =>
  Object.fromEntries(ids(n, "s").map((id, i) => [id, i < k]));
const catAnswer = (n: number, k: number) =>
  Object.fromEntries(ids(n).map((id, i) => [id, i < k ? "b1" : "b2"]));

describe("règle commune « N éléments sur M justes »", () => {
  it("bon dès 85 %, moyen dès la moitié, loin en dessous", () => {
    expect(countLevel(5, 5)).toBe("good");
    expect(countLevel(4, 5)).toBe("mid");
    expect(countLevel(5, 6)).toBe("mid"); // 83 %
    expect(countLevel(6, 7)).toBe("good"); // 86 % : une erreur tolérée dès 7
    expect(countLevel(17, 20)).toBe("good"); // pile 85 %, sans erreur d'arrondi
    expect(countLevel(3, 6)).toBe("mid"); // pile la moitié
    expect(countLevel(2, 5)).toBe("bad");
    expect(countLevel(0, 4)).toBe("bad");
  });

  it("4/5 a le même niveau en vrai/faux multiple et en catégorisation", () => {
    expect(answerLevel(vfm(5), vfmAnswer(5, 4))).toBe("mid");
    expect(answerLevel(cat(5), catAnswer(5, 4))).toBe("mid");
    expect(isCorrect(vfm(5), vfmAnswer(5, 4))).toBe(false);
    expect(isCorrect(cat(5), catAnswer(5, 4))).toBe(false);
  });

  it("classement : bien placés / total, même règle", () => {
    expect(answerLevel(classement5, ids(5))).toBe("good");
    // Une inversion de deux voisins = 3/5 bien placés.
    expect(answerLevel(classement5, ["i1", "i0", "i2", "i3", "i4"])).toBe("mid");
    expect(answerLevel(classement5, ["i4", "i3", "i2", "i1", "i0"])).toBe("bad");
  });

  it("catégorisation longue : une erreur sur 8 reste « bon »", () => {
    expect(answerLevel(cat(8), catAnswer(8, 7))).toBe("good");
  });
});

describe("answerLevel : autres formats", () => {
  it("estimation : closeWithin vert, midWithin orange", () => {
    expect(answerLevel(estimation, 55)).toBe("good");
    expect(answerLevel(estimation, 65)).toBe("mid");
    expect(answerLevel(estimation, 66)).toBe("bad");
  });

  it("formats binaires : bon ou loin, jamais moyen", () => {
    expect(answerLevel(vf, false)).toBe("good");
    expect(answerLevel(vf, true)).toBe("bad");
    expect(answerLevel(qcm, 1)).toBe("good");
    expect(answerLevel(qcm, 2)).toBe("bad");
  });

  it("pondéré : ≥ 85 % du pool bon, ≥ 65 % moyen (seuils de référence)", () => {
    expect(CORRECTNESS_THRESHOLDS.pondereScoreThreshold).toBe(85);
    expect(answerLevel(pondere, { c1: 60, c2: 40 })).toBe("good");
    expect(answerLevel(pondere, { c1: 75, c2: 25 })).toBe("good"); // 85
    expect(answerLevel(pondere, { c1: 80, c2: 20 })).toBe("mid"); // 80
    expect(answerLevel(pondere, { c1: 95, c2: 5 })).toBe("mid"); // 65
    expect(answerLevel(pondere, { c1: 100, c2: 0 })).toBe("bad"); // 60
  });

  it("curseur : écart moyen < 10 % bon, < 30 % moyen (seuil de référence)", () => {
    expect(CORRECTNESS_THRESHOLDS.curseurAvgDeviationMax).toBe(0.1);
    expect(answerLevel(curseur, { a: 15, b: 85 })).toBe("good"); // 5 %
    expect(answerLevel(curseur, { a: 30, b: 70 })).toBe("mid"); // 20 %
    expect(answerLevel(curseur, { a: 60, b: 40 })).toBe("bad"); // 50 %
  });

  it("réponse absente ou du mauvais type : loin", () => {
    expect(answerLevel(estimation, null)).toBe("bad");
    expect(answerLevel(classement5, { x: 1 } as Answer)).toBe("bad");
    expect(answerLevel(vfm(3), ["s0"] as Answer)).toBe("bad");
  });
});

describe("isCorrect vaut exactement « niveau = bon »", () => {
  const cases: [Question, Answer][] = [
    [estimation, 50],
    [estimation, 60],
    [estimation, 90],
    [vf, false],
    [vf, true],
    [qcm, 1],
    [qcm, 0],
    [classement5, ids(5)],
    [classement5, ["i1", "i0", "i2", "i3", "i4"]],
    [vfm(4), vfmAnswer(4, 4)],
    [vfm(4), vfmAnswer(4, 3)],
    [cat(8), catAnswer(8, 7)],
    [cat(6), catAnswer(6, 5)],
    [pondere, { c1: 70, c2: 30 }],
    [pondere, { c1: 85, c2: 15 }],
    [curseur, { a: 12, b: 88 }],
    [curseur, { a: 50, b: 50 }],
    [qcm, null],
  ];
  it.each(cases)("cas %#", (question, answer) => {
    expect(isCorrect(question, answer)).toBe(answerLevel(question, answer) === "good");
  });
});

describe("vocabulaire", () => {
  it("un libellé par niveau, celui des bandeaux de verdict", () => {
    expect(LEVEL_LABEL).toEqual({ good: "Bien vu", mid: "Pas loin", bad: "Pas cette fois" });
  });
});
