import { describe, expect, it } from "vitest";
import { computePortrait } from "./progress-stats";
import type { Progress } from "./progress";
import type { Question, Theme } from "./types";

/// Tests pour computePortrait — focus sur strongTheme / weakTheme / blindSpot.
/// L'agrégation des indicateurs sémantiques (qui remplace l'ancien
/// `estimationBiases` par thème) est testée séparément dans
/// `indicator-biases.test.ts`.

const themes: Theme[] = [
  { id: "climat", label: "Climat", color: "#0f0", count: 50 },
  { id: "eco", label: "Économie", color: "#f00", count: 40 },
  { id: "imm", label: "Immigration", color: "#ff0", count: 30 },
];

const mkQ = (id: string, theme: string): Question =>
  ({
    id,
    customId: id,
    theme,
    format: "vraifaux",
    question: id,
    correctAnswer: true,
    sources: [],
    why: "",
    explain: "",
    pctClose: 0,
    pctOff: 0,
    avgUserText: "",
    difficulte: 3,
  }) as unknown as Question;

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

describe("computePortrait", () => {
  it("rien à dire si pas assez de réponses (< 3 par thème)", () => {
    const qs = [mkQ("a", "Climat"), mkQ("b", "Climat")];
    const p = emptyProgress();
    p.answers = {
      a: { value: true, correct: true, ts: 1 },
      b: { value: true, correct: false, ts: 2 },
    };
    const out = computePortrait(p, qs, themes);
    expect(out.strongTheme).toBeNull();
    expect(out.weakTheme).toBeNull();
  });

  it("strongTheme = meilleur taux ≥ 3 réponses", () => {
    const qs = [
      mkQ("c1", "Climat"), mkQ("c2", "Climat"), mkQ("c3", "Climat"),
      mkQ("e1", "Économie"), mkQ("e2", "Économie"), mkQ("e3", "Économie"),
    ];
    const p = emptyProgress();
    p.answers = {
      c1: { value: true, correct: true, ts: 1 },
      c2: { value: true, correct: true, ts: 2 },
      c3: { value: true, correct: true, ts: 3 },
      e1: { value: true, correct: false, ts: 4 },
      e2: { value: true, correct: true, ts: 5 },
      e3: { value: true, correct: false, ts: 6 },
    };
    const out = computePortrait(p, qs, themes);
    expect(out.strongTheme?.label).toBe("Climat");
    expect(out.weakTheme?.label).toBe("Économie");
  });

  it("blindSpot = thème avec le plus de questions non touchées", () => {
    // Climat (50 publiées, 1 touchée) > Immigration (30 publiées, 0 touchée)
    // En valeur absolue, Climat reste l'angle mort principal.
    const qs = [mkQ("c1", "Climat")];
    const p = emptyProgress();
    p.answers = { c1: { value: true, correct: true, ts: 1 } };
    const out = computePortrait(p, qs, themes);
    expect(out.blindSpot?.label).toBe("Climat");
  });

  it("retourne indicatorBiases comme tableau (vide sans tags)", () => {
    const qs = [mkQ("a", "Climat")];
    const p = emptyProgress();
    p.answers = { a: { value: true, correct: true, ts: 1 } };
    const out = computePortrait(p, qs, themes);
    expect(Array.isArray(out.indicatorBiases)).toBe(true);
  });
});
