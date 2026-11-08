import { describe, expect, it } from "vitest";
import {
  categorisationCommunityLine,
  classementCommunityLine,
  curseurCommunityLine,
  estimationCommunityLine,
  pondereCommunityLine,
  vraiFauxMultiCommunityLine,
} from "./community-lines";
import type { StatsResponse } from "./stats-hook";
import type {
  CategorisationQuestion,
  ClassementQuestion,
  CurseurMultiQuestion,
  EstimationQuestion,
  PondereQuestion,
  VraiFauxMultiQuestion,
} from "./types";

const NBSP = " ";
const below: StatsResponse = { hasRealData: false, count: 3 };
const stats = (extra: Record<string, unknown>) =>
  ({ hasRealData: true, count: 40, ...extra }) as StatsResponse;

const estimation = {
  format: "estimation",
  range: [0, 2_000_000],
  step: 10_000,
  answer: 500_000,
  unit: "personnes",
  closeWithin: 100_000,
  midWithin: 300_000,
} as unknown as EstimationQuestion;

describe("lecture collective : sous le seuil, rien du tout", () => {
  it("aucune phrase sans données réelles", () => {
    expect(estimationCommunityLine(estimation, below)).toBeNull();
    expect(estimationCommunityLine(estimation, null)).toBeNull();
    expect(
      classementCommunityLine({ correctOrder: ["a"], items: [] } as unknown as ClassementQuestion, below),
    ).toBeNull();
  });
});

describe("estimation", () => {
  it("moyenne des joueurs + sens de l'écart collectif + part tout près", () => {
    const out = estimationCommunityLine(estimation, stats({ mean: 823_456, pctClose: 12 }));
    expect(out).toContain("En moyenne, les joueurs disent 820");
    expect(out).toContain("personnes : on surestime nettement.");
    expect(out).toContain(`Seuls 12${NBSP}% tombent tout près.`);
  });

  it("moyenne juste", () => {
    const out = estimationCommunityLine(estimation, stats({ mean: 480_000, pctClose: 55 }));
    expect(out).toContain("la moyenne tombe juste");
    expect(out).toContain(`55${NBSP}% tombent tout près.`);
  });

  it("sous-estimation légère", () => {
    expect(estimationCommunityLine(estimation, stats({ mean: 300_000 }))).toContain(
      "on sous-estime un peu",
    );
  });
});

describe("classement", () => {
  const q = {
    items: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Bêta" },
      { id: "c", label: "Gamma" },
    ],
    correctOrder: ["a", "b", "c"],
  } as unknown as ClassementQuestion;

  it("nombre moyen bien placés + élément le plus souvent mal placé", () => {
    const out = classementCommunityLine(
      q,
      stats({
        perItemPositions: {
          a: { "0": 80, "1": 20 },
          b: { "1": 30, "0": 20, "2": 50 },
          c: { "2": 50, "1": 50 },
        },
      }),
    );
    expect(out).toBe(
      "En moyenne, les joueurs placent bien 1,6 élément sur 3. « Bêta » est le plus souvent mal placé.",
    );
  });
});

describe("vrai/faux multiple", () => {
  const q = {
    statements: [
      { id: "s1", text: "A", correct: true },
      { id: "s2", text: "B", correct: false },
    ],
  } as unknown as VraiFauxMultiQuestion;

  it("affirmation qui piège le plus, désignée par sa lettre", () => {
    const out = vraiFauxMultiCommunityLine(
      q,
      stats({
        perStatement: { s1: { pctTrue: 90, pctFalse: 10 }, s2: { pctTrue: 70, pctFalse: 30 } },
      }),
    );
    expect(out).toBe(
      `En moyenne, les joueurs jugent bien 1,2 affirmation sur 2. L'affirmation B piège le plus : 70${NBSP}% se trompent.`,
    );
  });
});

describe("catégorisation", () => {
  const q = {
    bins: [
      { id: "b1", label: "Impôt" },
      { id: "b2", label: "Cotisation" },
    ],
    items: [
      { id: "i1", label: "CSG", correct: "b1" },
      { id: "i2", label: "TVA", correct: "b1" },
    ],
  } as unknown as CategorisationQuestion;

  it("carte qui piège le plus et case où on la range à tort", () => {
    const out = categorisationCommunityLine(
      q,
      stats({ perItemBins: { i1: { b1: 35, b2: 65 }, i2: { b1: 95, b2: 5 } } }),
    );
    expect(out).toBe(
      `En moyenne, les joueurs classent bien 1,3 carte sur 2. « CSG » piège le plus : 65${NBSP}% la rangent dans « Cotisation ».`,
    );
  });
});

describe("échelle (curseur multiple)", () => {
  const q = {
    range: [0, 100],
    unit: "%",
    items: [
      { id: "x", label: "Ouvriers", real: 18 },
      { id: "y", label: "Cadres", real: 60 },
    ],
  } as unknown as CurseurMultiQuestion;

  it("étiquette au plus gros écart collectif, valeurs arrondies", () => {
    const out = curseurCommunityLine(q, stats({ perItemMean: { x: 41.98263708750407, y: 58 } }));
    expect(out).toBe(
      "En moyenne, les joueurs placent « Ouvriers » à 42 % (réalité : 18 %) : c'est là qu'on se trompe le plus.",
    );
  });

  it("moyenne collective proche partout", () => {
    expect(curseurCommunityLine(q, stats({ perItemMean: { x: 20, y: 61 } }))).toContain(
      "près de sa vraie valeur",
    );
  });
});

describe("pondéré", () => {
  const q = {
    pool: 100,
    categories: [
      { id: "r", label: "Retraites", real: 45 },
      { id: "s", label: "Santé", real: 55 },
    ],
  } as unknown as PondereQuestion;

  it("part la plus mal estimée collectivement", () => {
    const out = pondereCommunityLine(q, stats({ perCategoryMean: { r: 30.4, s: 69.6 } }));
    expect(out).toBe(
      `En moyenne, les joueurs donnent 30${NBSP}pts à « Retraites », pour 45 en réalité : c'est la part qu'on sous-estime le plus.`,
    );
  });

  it("répartition collective juste", () => {
    expect(pondereCommunityLine(q, stats({ perCategoryMean: { r: 47, s: 53 } }))).toContain(
      "colle à la réalité",
    );
  });
});
