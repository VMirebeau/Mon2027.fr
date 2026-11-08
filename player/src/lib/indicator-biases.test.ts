import { describe, expect, it } from "vitest";
import {
  computeIndicatorBiases,
  computeLucidityScore,
  type IndicatorBiasRow,
} from "./progress-stats";
import type { Progress } from "./progress";
import type { Question } from "./types";

const mkBias = (
  id: string,
  signedScore: number,
  count = 9,
): IndicatorBiasRow =>
  ({
    id,
    label: id,
    subjectShort: id,
    signedScore,
    count,
    qualitative: "juste",
  }) as IndicatorBiasRow;

const emptyProgress = (): Progress =>
  ({
    answers: {},
    favorites: {},
    challenges: { sent: [], received: [] },
    streak: { days: 0, lastPlayedDay: null },
    prefs: { favoriteTheme: null, favoriteMode: null },
    identity: { pseudo: null },
    gamif: {
      correctStreakCurrent: 0,
      correctStreakMax: 0,
      daysStreakMax: 0,
      defisCreated: 0,
      defisPlayedByOthers: 0,
      defisReceivedPlayed: 0,
      todayPlayedDay: null,
      todayPlayedCount: 0,
    },
    badges: {},
  }) as unknown as Progress;

const mkEstim = (
  id: string,
  answer: number,
  indicators: { id: string; polarity: 1 | -1 }[] = [],
): Question =>
  ({
    id,
    theme: "Climat",
    format: "estimation",
    question: id,
    range: [0, answer * 4],
    step: 1,
    answer,
    unit: "",
    avgUser: 0,
    closeWithin: answer * 0.05,
    midWithin: answer * 0.2,
    pctClose: 0,
    pctOff: 0,
    why: "",
    explain: "",
    sources: [],
    indicators,
  }) as unknown as Question;

const mkVf = (
  id: string,
  indicators: { id: string; polarity: 1 | -1 }[] = [],
): Question =>
  ({
    id,
    theme: "Climat",
    format: "vraifaux",
    question: id,
    correctAnswer: true,
    sources: [],
    why: "",
    explain: "",
    pctClose: 0,
    pctOff: 0,
    avgUserText: "",
    indicators,
  }) as unknown as Question;

describe("computeIndicatorBiases", () => {
  it("rien si pas d'indicateurs taggés", () => {
    const qs = [mkEstim("a", 100), mkEstim("b", 100)];
    const p = emptyProgress();
    p.answers = {
      a: { value: 200, correct: false, ts: 1 },
      b: { value: 50, correct: false, ts: 2 },
    };
    const out = computeIndicatorBiases(p, qs);
    expect(out).toHaveLength(0);
  });

  it("seuil minimum à 3 indices par indicateur", () => {
    const qs = [
      mkEstim("a", 100, [{ id: "precarite", polarity: 1 }]),
      mkEstim("b", 100, [{ id: "precarite", polarity: 1 }]),
    ];
    const p = emptyProgress();
    p.answers = {
      a: { value: 200, correct: false, ts: 1 },
      b: { value: 200, correct: false, ts: 2 },
    };
    const out = computeIndicatorBiases(p, qs);
    // 2 indices → en dessous du seuil 3
    expect(out).toHaveLength(0);
  });

  it("agrège 3 estimations en surestimation forte", () => {
    const qs = [
      mkEstim("a", 100, [{ id: "precarite", polarity: 1 }]),
      mkEstim("b", 100, [{ id: "precarite", polarity: 1 }]),
      mkEstim("c", 100, [{ id: "precarite", polarity: 1 }]),
    ];
    const p = emptyProgress();
    p.answers = {
      a: { value: 200, correct: false, ts: 1 }, // ratio +1
      b: { value: 200, correct: false, ts: 2 }, // ratio +1
      c: { value: 200, correct: false, ts: 3 }, // ratio +1
    };
    const out = computeIndicatorBiases(p, qs);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("precarite");
    expect(out[0].signedScore).toBe(1);
    expect(out[0].qualitative).toBe("forte_sur");
    expect(out[0].count).toBe(3);
  });

  it("polarité miroir (-1) inverse la lecture", () => {
    const qs = [
      mkEstim("a", 100, [{ id: "precarite", polarity: -1 }]),
      mkEstim("b", 100, [{ id: "precarite", polarity: -1 }]),
      mkEstim("c", 100, [{ id: "precarite", polarity: -1 }]),
    ];
    const p = emptyProgress();
    // User répond systématiquement la moitié → ratio brut -0.5
    // Multiplié par -1 (polarity miroir) → +0.5 = surestimation du concept
    p.answers = {
      a: { value: 50, correct: false, ts: 1 },
      b: { value: 50, correct: false, ts: 2 },
      c: { value: 50, correct: false, ts: 3 },
    };
    const out = computeIndicatorBiases(p, qs);
    expect(out).toHaveLength(1);
    expect(out[0].signedScore).toBeCloseTo(0.5, 1);
    expect(out[0].qualitative).toBe("forte_sur");
  });

  it("question multi-indicateurs (1 contribution pour chaque)", () => {
    const qs = [
      mkEstim("a", 100, [
        { id: "precarite", polarity: 1 },
        { id: "logement", polarity: 1 },
      ]),
      mkEstim("b", 100, [{ id: "precarite", polarity: 1 }]),
      mkEstim("c", 100, [{ id: "precarite", polarity: 1 }]),
      mkEstim("d", 100, [{ id: "logement", polarity: 1 }]),
      mkEstim("e", 100, [{ id: "logement", polarity: 1 }]),
    ];
    const p = emptyProgress();
    p.answers = {
      a: { value: 200, correct: false, ts: 1 }, // ratio +1 sur précarité + logement
      b: { value: 200, correct: false, ts: 2 },
      c: { value: 200, correct: false, ts: 3 },
      d: { value: 200, correct: false, ts: 4 },
      e: { value: 200, correct: false, ts: 5 },
    };
    const out = computeIndicatorBiases(p, qs);
    expect(out).toHaveLength(2);
    // Précarité : 3 indices à +1 (a, b, c)
    const prec = out.find((r) => r.id === "precarite");
    expect(prec?.count).toBe(3);
    // Logement : 3 indices à +1 (a, d, e)
    const log = out.find((r) => r.id === "logement");
    expect(log?.count).toBe(3);
  });

  it("V/F correct → 0 contribution, V/F faux → +1 ou -1 selon polarity", () => {
    const qs = [
      mkVf("a", [{ id: "precarite", polarity: 1 }]),
      mkVf("b", [{ id: "precarite", polarity: 1 }]),
      mkVf("c", [{ id: "precarite", polarity: 1 }]),
    ];
    const p = emptyProgress();
    p.answers = {
      a: { value: true, correct: false, ts: 1 }, // erreur → +1
      b: { value: true, correct: false, ts: 2 }, // erreur → +1
      c: { value: true, correct: true, ts: 3 }, // juste → 0
    };
    const out = computeIndicatorBiases(p, qs);
    expect(out[0].count).toBe(3);
    // Moyenne : (1 + 1 + 0) / 3 = 0.666
    expect(out[0].signedScore).toBeCloseTo(0.666, 2);
    expect(out[0].qualitative).toBe("forte_sur");
  });

  it("vraifaux_multi : ratio d'erreurs sur les affirmations", () => {
    const q1 = {
      id: "vfm1",
      format: "vraifaux_multi",
      theme: "Climat",
      statements: [
        { id: "s1", text: "", correct: true },
        { id: "s2", text: "", correct: false },
        { id: "s3", text: "", correct: true },
        { id: "s4", text: "", correct: false },
      ],
      indicators: [{ id: "precarite", polarity: 1 }],
      sources: [],
      why: "",
      explain: "",
    } as unknown as Question;
    // User : juste sur s1+s2, faux sur s3+s4 → 2/4 = 0.5
    const p = emptyProgress();
    p.answers = {
      vfm1: {
        value: { s1: true, s2: false, s3: false, s4: true },
        correct: false,
        ts: 1,
      },
    };
    // Triplique pour atteindre seuil de 3 indices
    const q2 = { ...q1, id: "vfm2" } as Question;
    const q3 = { ...q1, id: "vfm3" } as Question;
    p.answers.vfm2 = p.answers.vfm1;
    p.answers.vfm3 = p.answers.vfm1;
    const out = computeIndicatorBiases(p, [q1, q2, q3]);
    expect(out).toHaveLength(1);
    // 3 indices × 0.5 contribution chacun → moyenne 0.5
    expect(out[0].signedScore).toBeCloseTo(0.5, 1);
  });

  it("classement : ratio d'items mal placés", () => {
    const mk = (id: string) =>
      ({
        id,
        format: "classement",
        theme: "Climat",
        correctOrder: ["a", "b", "c", "d"],
        items: [],
        indicators: [{ id: "precarite", polarity: 1 }],
        sources: [],
        why: "",
        explain: "",
      }) as unknown as Question;
    const p = emptyProgress();
    // Ordre user : a, b, d, c → 2 items mal placés sur 4 = 0.5
    p.answers = {
      q1: { value: ["a", "b", "d", "c"], correct: false, ts: 1 },
      q2: { value: ["a", "b", "d", "c"], correct: false, ts: 2 },
      q3: { value: ["a", "b", "d", "c"], correct: false, ts: 3 },
    };
    const out = computeIndicatorBiases(p, [mk("q1"), mk("q2"), mk("q3")]);
    expect(out[0].signedScore).toBeCloseTo(0.5, 1);
  });

  it("pondere : distance L1 normalisée par 2×pool", () => {
    const mk = (id: string) =>
      ({
        id,
        format: "pondere",
        theme: "Climat",
        pool: 100,
        step: 5,
        categories: [
          { id: "a", label: "", real: 50, color: "" },
          { id: "b", label: "", real: 50, color: "" },
        ],
        indicators: [{ id: "precarite", polarity: 1 }],
        sources: [],
        why: "",
        explain: "",
      }) as unknown as Question;
    const p = emptyProgress();
    // User répond {a: 70, b: 30} → diff a=20, b=20, somme=40, /200 = 0.2
    p.answers = {
      q1: { value: { a: 70, b: 30 }, correct: false, ts: 1 },
      q2: { value: { a: 70, b: 30 }, correct: false, ts: 2 },
      q3: { value: { a: 70, b: 30 }, correct: false, ts: 3 },
    };
    const out = computeIndicatorBiases(p, [mk("q1"), mk("q2"), mk("q3")]);
    expect(out[0].signedScore).toBeCloseTo(0.2, 2);
  });

  it("curseur_multi : moyenne des écarts normalisés", () => {
    const mk = (id: string) =>
      ({
        id,
        format: "curseur_multi",
        theme: "Climat",
        range: [0, 100] as [number, number],
        items: [
          { id: "a", label: "", real: 50 },
          { id: "b", label: "", real: 80 },
        ],
        indicators: [{ id: "precarite", polarity: 1 }],
        sources: [],
        why: "",
        explain: "",
      }) as unknown as Question;
    const p = emptyProgress();
    // User : a=70 (diff=20/100=0.2), b=80 (diff=0) → moyenne 0.1
    p.answers = {
      q1: { value: { a: 70, b: 80 }, correct: false, ts: 1 },
      q2: { value: { a: 70, b: 80 }, correct: false, ts: 2 },
      q3: { value: { a: 70, b: 80 }, correct: false, ts: 3 },
    };
    const out = computeIndicatorBiases(p, [mk("q1"), mk("q2"), mk("q3")]);
    expect(out[0].signedScore).toBeCloseTo(0.1, 2);
  });

  it("categorisation : ratio d'items mal placés dans les bins", () => {
    const mk = (id: string) =>
      ({
        id,
        format: "categorisation",
        theme: "Climat",
        bins: [{ id: "binA", label: "" }, { id: "binB", label: "" }],
        items: [
          { id: "i1", label: "", correct: "binA" },
          { id: "i2", label: "", correct: "binA" },
          { id: "i3", label: "", correct: "binB" },
          { id: "i4", label: "", correct: "binB" },
        ],
        indicators: [{ id: "precarite", polarity: 1 }],
        sources: [],
        why: "",
        explain: "",
      }) as unknown as Question;
    const p = emptyProgress();
    // User : i1, i2 justes, i3, i4 inversés → 2/4 erreurs = 0.5
    p.answers = {
      q1: { value: { i1: "binA", i2: "binA", i3: "binA", i4: "binB" }, correct: false, ts: 1 },
      q2: { value: { i1: "binA", i2: "binA", i3: "binA", i4: "binB" }, correct: false, ts: 2 },
      q3: { value: { i1: "binA", i2: "binA", i3: "binA", i4: "binB" }, correct: false, ts: 3 },
    };
    const out = computeIndicatorBiases(p, [mk("q1"), mk("q2"), mk("q3")]);
    // 1 erreur / 4 = 0.25
    expect(out[0].signedScore).toBeCloseTo(0.25, 2);
  });

  describe("computeLucidityScore", () => {
    it("null si moins de 3 indicateurs mesurés", () => {
      const biases = [
        mkBias("a", 0.1),
        mkBias("b", 0.2),
      ];
      expect(computeLucidityScore(biases)).toBeNull();
    });

    it("100 quand tous les axes sont à 0 (parfaitement juste)", () => {
      const biases = [
        mkBias("a", 0),
        mkBias("b", 0),
        mkBias("c", 0),
        mkBias("d", 0),
      ];
      const r = computeLucidityScore(biases);
      expect(r?.score).toBe(100);
      expect(r?.measuredCount).toBe(4);
      expect(r?.totalCount).toBe(4);
    });

    it("0 quand tous les axes sont à ±1 (très loin)", () => {
      const biases = [
        mkBias("a", 1),
        mkBias("b", -1),
        mkBias("c", 1),
      ];
      expect(computeLucidityScore(biases)?.score).toBe(0);
    });

    it("moyenne attendue : 3 axes à 0.5 → score 50", () => {
      const biases = [
        mkBias("a", 0.5),
        mkBias("b", -0.5),
        mkBias("c", 0.5),
      ];
      expect(computeLucidityScore(biases)?.score).toBe(50);
    });

    it("retourne measuredCount = nb d'axes au-dessus du seuil", () => {
      // 4 mesurés, 2 trop maigres (count < 3 par défaut)
      const biases = [
        mkBias("a", 0.1, 5),
        mkBias("b", 0.1, 5),
        mkBias("c", 0.1, 5),
        mkBias("d", 0.1, 5),
        mkBias("e", 0.1, 2),
        mkBias("f", 0.1, 0),
      ];
      const r = computeLucidityScore(biases);
      expect(r?.measuredCount).toBe(4);
      expect(r?.totalCount).toBe(6);
    });

    it("exclut les axes en dessous du seuil de samples", () => {
      // 2 axes mesurés (count >= 3) + 1 axe presque mesuré (count 2) → null
      const biases = [
        mkBias("a", 0.1, 5),
        mkBias("b", 0.1, 5),
        mkBias("c", 0.1, 2),
      ];
      expect(computeLucidityScore(biases)).toBeNull();
    });
  });

  it("paliers qualitatifs", () => {
    // Construit un dataset qui aboutit à un signedScore = 0.1 → "juste"
    const qs = [
      mkEstim("a", 100, [{ id: "precarite", polarity: 1 }]),
      mkEstim("b", 100, [{ id: "precarite", polarity: 1 }]),
      mkEstim("c", 100, [{ id: "precarite", polarity: 1 }]),
    ];
    const p = emptyProgress();
    p.answers = {
      a: { value: 110, correct: false, ts: 1 }, // +0.1
      b: { value: 110, correct: false, ts: 2 }, // +0.1
      c: { value: 110, correct: false, ts: 3 }, // +0.1
    };
    const out = computeIndicatorBiases(p, qs);
    expect(out[0].signedScore).toBeCloseTo(0.1, 1);
    expect(out[0].qualitative).toBe("juste");
  });
});

describe("contributionFor : vraie valeur négative", () => {
  it("surestimer reste une surestimation (signe positif)", async () => {
    const { contributionFor } = await import("./progress-stats");
    const q = { id: "neg", format: "estimation", answer: -0.5, range: [-5, 5] } as unknown as Parameters<typeof contributionFor>[0];
    expect(contributionFor(q, { value: 1, correct: false })).toBeGreaterThan(0);
    expect(contributionFor(q, { value: -2, correct: false })).toBeLessThan(0);
  });
});
