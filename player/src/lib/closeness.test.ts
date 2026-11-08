import { describe, expect, it } from "vitest";
import { CLOSENESS_COLOR, closenessOf, type Closeness } from "./closeness";
import { LEVEL_LABEL } from "./correctness";
import type { Question } from "./types";

// Helpers — pour ne pas re-déclarer une Question entière à chaque cas.
// Tolérances par défaut de content.ts : 5 % (vert) et 15 % (orange) de la plage.
function estimation(answer: number, range: [number, number] = [0, 100]): Question {
  const span = range[1] - range[0];
  return {
    id: "test-est",
    format: "estimation",
    question: "Test",
    answer,
    range,
    step: 1,
    closeWithin: span * 0.05,
    midWithin: span * 0.15,
    unit: "",
    unitShort: "",
    theme: "test",
    explanation: "",
    sources: [],
  } as unknown as Question;
}

function ab(correctIndex: 0 | 1): Question {
  return {
    id: "test-ab",
    format: "ab",
    question: "Test",
    correctIndex,
    choices: [
      { label: "A", valeur: 1 },
      { label: "B", valeur: 2 },
    ],
    theme: "test",
    explanation: "",
    sources: [],
  } as unknown as Question;
}

describe("closenessOf", () => {
  it("renvoie miss quand pas de réponse", () => {
    expect(closenessOf(estimation(50), null)).toBe("miss");
  });

  it("renvoie miss si type ne matche pas pour estimation", () => {
    expect(closenessOf(estimation(50), "not a number" as never)).toBe("miss");
  });

  it("estimation : mêmes seuils qu'à la révélation (closeWithin / midWithin)", () => {
    // range = 100 → vert ≤ 5, orange ≤ 15.
    expect(closenessOf(estimation(50, [0, 100]), 52)).toBe("close");
    expect(closenessOf(estimation(50, [0, 100]), 45)).toBe("close");
    expect(closenessOf(estimation(50, [0, 100]), 60)).toBe("mid");
    expect(closenessOf(estimation(50, [0, 100]), 35)).toBe("mid");
    // 18 % de la plage : « tiède » avec l'ancien seuil récap (20 %), « loin »
    // à la révélation. Désormais loin partout.
    expect(closenessOf(estimation(50, [0, 100]), 68)).toBe("far");
    expect(closenessOf(estimation(50, [0, 100]), 0)).toBe("far");
  });

  it("ab: close si bonne réponse, far sinon", () => {
    expect(closenessOf(ab(0), 0)).toBe("close");
    expect(closenessOf(ab(0), 1)).toBe("far");
    expect(closenessOf(ab(1), 1)).toBe("close");
  });

  it("formats composites : évalués comme à la révélation (plus de « tiède » d'office)", () => {
    const q = {
      id: "x",
      format: "classement",
      items: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id })),
      correctOrder: ["a", "b", "c", "d", "e"],
    } as unknown as Question;
    expect(closenessOf(q, ["a", "b", "c", "d", "e"])).toBe("close");
    expect(closenessOf(q, ["b", "a", "c", "d", "e"])).toBe("mid"); // 3/5
    expect(closenessOf(q, ["e", "d", "c", "b", "a"])).toBe("far"); // 1/5
  });
});

describe("CLOSENESS_COLOR", () => {
  it("a une entrée pour chaque Closeness possible", () => {
    const all: Closeness[] = ["close", "mid", "far", "miss"];
    for (const k of all) {
      expect(CLOSENESS_COLOR[k]).toBeDefined();
      expect(CLOSENESS_COLOR[k].chip).toBeTruthy();
      expect(CLOSENESS_COLOR[k].lbl).toBeTruthy();
    }
  });

  it("reprend le vocabulaire unique des niveaux", () => {
    expect(CLOSENESS_COLOR.close.lbl).toBe(LEVEL_LABEL.good);
    expect(CLOSENESS_COLOR.mid.lbl).toBe(LEVEL_LABEL.mid);
    expect(CLOSENESS_COLOR.far.lbl).toBe(LEVEL_LABEL.bad);
  });
});
