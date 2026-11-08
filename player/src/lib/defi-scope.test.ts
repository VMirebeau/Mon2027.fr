import { describe, expect, it } from "vitest";
import { playableQuestionIds, scoreFromAnswers, type DefiAnswersMap } from "./defi";

/// Défi dont une question a été dépubliée après la création : il reste
/// jouable, et total + scores se calculent sur les questions disponibles,
/// uniquement parmi celles du défi.

describe("playableQuestionIds", () => {
  it("garde l'ordre du défi et écarte les questions introuvables", () => {
    expect(playableQuestionIds(["a", "b", "c", "d"], ["d", "a", "c"])).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("ignore les doublons et les questions hors défi", () => {
    expect(playableQuestionIds(["a", "a", "b"], ["a", "b", "z"])).toEqual(["a", "b"]);
  });
});

describe("scoreFromAnswers", () => {
  const answers: DefiAnswersMap = {
    a: { value: 1, correct: true },
    b: { value: 2, correct: true },
    retiree: { value: 3, correct: true },
    horsDefi: { value: 4, correct: true },
    c: { value: 5, correct: false },
  };

  it("sans restriction, compte toutes les bonnes réponses (comportement historique)", () => {
    expect(scoreFromAnswers(answers)).toBe(4);
  });

  it("ne compte que les questions jouables du défi", () => {
    const playable = playableQuestionIds(["a", "b", "retiree", "c"], ["a", "b", "c"]);
    expect(scoreFromAnswers(answers, playable)).toBe(2);
  });
});
