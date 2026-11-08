import { describe, expect, it } from "vitest";
import { anchorIdsFor, scoredItems } from "./curseur-anchors";
import { isCorrect } from "./correctness";
import type { Question } from "./types";

const items = (reals: number[]) => reals.map((real, i) => ({ id: `i${i}`, label: `L${i}`, real }));

describe("repères des questions « Placer sur une échelle »", () => {
  it("aucun repère en dessous de 4 étiquettes", () => {
    expect(anchorIdsFor({ items: items([1, 2, 3]) }).size).toBe(0);
  });

  it("25 % arrondi à l'inférieur, au moins 1 dès 4 étiquettes", () => {
    expect(anchorIdsFor({ items: items([1, 2, 3, 4]) }).size).toBe(1);
    expect(anchorIdsFor({ items: items([1, 2, 3, 4, 5, 6, 7]) }).size).toBe(1);
    expect(anchorIdsFor({ items: items([1, 2, 3, 4, 5, 6, 7, 8]) }).size).toBe(2);
  });

  it("un seul repère = l'étiquette du milieu, jamais un extrême", () => {
    // Valeurs dans le désordre : le repère est le 3e PAR VALEUR (3,2), pas par position.
    const q = { items: items([5.1, 2.4, 3.2, 1.0, 4.4]) };
    expect([...anchorIdsFor(q)]).toEqual(["i2"]);
  });

  it("plusieurs repères répartis, sans les extrêmes", () => {
    const q = { items: items([10, 20, 30, 40, 50, 60, 70, 80]) };
    const ids = anchorIdsFor(q);
    expect(ids.has("i0")).toBe(false);
    expect(ids.has("i7")).toBe(false);
    expect([...ids].sort()).toEqual(["i2", "i6"]);
  });

  it("déterministe et cohérent avec scoredItems", () => {
    const q = { items: items([3, 1, 4, 1.5, 9, 2.6]) };
    expect([...anchorIdsFor(q)]).toEqual([...anchorIdsFor(q)]);
    expect(scoredItems(q).length).toBe(q.items.length - anchorIdsFor(q).size);
  });
});

describe("score d'une échelle avec repères", () => {
  // 4 étiquettes → 1 repère (i2, valeur 30), exclu du score.
  const q = {
    id: "q-ech",
    format: "curseur_multi",
    range: [0, 100],
    items: items([10, 20, 30, 40]),
  } as unknown as Question;

  it("une réponse sans le repère est jugée sur les seules étiquettes placées par le joueur", () => {
    expect(isCorrect(q, { i0: 10, i1: 20, i3: 40 })).toBe(true);
    expect(isCorrect(q, { i0: 90, i1: 80, i3: 5 })).toBe(false);
  });

  it("la valeur envoyée pour un repère ne change rien au verdict", () => {
    expect(isCorrect(q, { i0: 90, i1: 80, i2: 30, i3: 5 })).toBe(false);
    expect(isCorrect(q, { i0: 10, i1: 20, i2: 99, i3: 40 })).toBe(true);
  });
});
