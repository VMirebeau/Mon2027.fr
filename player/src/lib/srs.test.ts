import { describe, expect, it } from "vitest";
import { srsNext } from "./progress";

const DAY = 24 * 60 * 60 * 1000;

describe("srsNext", () => {
  it("première bonne réponse : intervalle = 3 jours", () => {
    const now = 1_000_000;
    const s = srsNext(undefined, true, now);
    expect(s.consecutiveCorrect).toBe(1);
    expect(s.intervalDays).toBe(3);
    expect(s.nextDueAt).toBe(now + 3 * DAY);
  });

  it("première faute : intervalle = 1 jour, consec = 0", () => {
    const now = 2_000_000;
    const s = srsNext(undefined, false, now);
    expect(s.consecutiveCorrect).toBe(0);
    expect(s.intervalDays).toBe(1);
    expect(s.nextDueAt).toBe(now + DAY);
  });

  it("escalade : 2 bonnes consécutives → 7 jours", () => {
    const now = 3_000_000;
    const first = srsNext(undefined, true, now);
    const second = srsNext(first, true, now);
    expect(second.consecutiveCorrect).toBe(2);
    expect(second.intervalDays).toBe(7);
  });

  it("plafond du ladder à 180 jours", () => {
    const now = 4_000_000;
    let s = srsNext(undefined, true, now);
    for (let i = 0; i < 10; i++) s = srsNext(s, true, now);
    expect(s.consecutiveCorrect).toBe(11);
    expect(s.intervalDays).toBe(180);
  });

  it("faute reset le compteur même après une longue série", () => {
    const now = 5_000_000;
    let s = srsNext(undefined, true, now);
    for (let i = 0; i < 5; i++) s = srsNext(s, true, now);
    const reset = srsNext(s, false, now);
    expect(reset.consecutiveCorrect).toBe(0);
    expect(reset.intervalDays).toBe(1);
  });
});
