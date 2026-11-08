import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESS,
  answeredCount,
  correctCount,
  favoritesCount,
  isFavorite,
  listFavorites,
  mergeProgress,
  todayKey,
} from "./progress";
import type { Progress } from "./progress";

// Helper : crée un Progress avec overrides ciblés.
function p(overrides: Partial<Progress> = {}): Progress {
  return {
    ...DEFAULT_PROGRESS,
    answers: {},
    streak: { days: 0, lastPlayedDay: null },
    prefs: { favoriteTheme: null, favoriteMode: null },
    identity: { pseudo: null },
    challenges: { sent: [], received: [] },
    favorites: {},
    ...overrides,
  };
}

describe("compteurs de base", () => {
  it("answeredCount renvoie 0 sur progress vide", () => {
    expect(answeredCount(DEFAULT_PROGRESS)).toBe(0);
  });

  it("answeredCount + correctCount", () => {
    const prog = p({
      answers: {
        a: { value: 0, correct: true, ts: 1 },
        b: { value: 0, correct: false, ts: 2 },
        c: { value: 0, correct: true, ts: 3 },
      },
    });
    expect(answeredCount(prog)).toBe(3);
    expect(correctCount(prog)).toBe(2);
  });

  it("favoritesCount + isFavorite + listFavorites", () => {
    const prog = p({
      favorites: {
        a: { addedAt: 100 },
        b: { addedAt: 200 },
      },
    });
    expect(favoritesCount(prog)).toBe(2);
    expect(isFavorite(prog, "a")).toBe(true);
    expect(isFavorite(prog, "x")).toBe(false);
    expect(listFavorites(prog).sort()).toEqual(["a", "b"]);
  });
});

describe("mergeProgress : answers", () => {
  it("garde l'entrée la plus récente par questionId (ts max)", () => {
    const local = p({
      answers: { a: { value: 0, correct: false, ts: 100 } },
    });
    const remote = p({
      answers: { a: { value: 0, correct: true, ts: 200 } },
    });
    const merged = mergeProgress(local, remote);
    expect(merged.answers.a).toEqual({ value: 0, correct: true, ts: 200 });
  });

  it("union des questionIds", () => {
    const local = p({
      answers: { a: { value: 0, correct: true, ts: 1 } },
    });
    const remote = p({
      answers: { b: { value: 0, correct: false, ts: 2 } },
    });
    const merged = mergeProgress(local, remote);
    expect(Object.keys(merged.answers).sort()).toEqual(["a", "b"]);
  });

  it("ts identique → garde local (pas de réécriture inutile)", () => {
    const local = p({
      answers: { a: { value: 0, correct: false, ts: 100 } },
    });
    const remote = p({
      answers: { a: { value: 0, correct: true, ts: 100 } },
    });
    const merged = mergeProgress(local, remote);
    // L'algo strict ts > existing.ts conserve local quand égalité.
    expect(merged.answers.a.correct).toBe(false);
  });
});

describe("mergeProgress : streak", () => {
  it("ne ressuscite pas une série cassée sur l'autre appareil", () => {
    const local = p({ streak: { days: 5, lastPlayedDay: "2026-05-01" } });
    const remote = p({ streak: { days: 8, lastPlayedDay: "2026-04-20" } });
    const merged = mergeProgress(local, remote);
    expect(merged.streak).toEqual({ days: 5, lastPlayedDay: "2026-05-01" });
  });

  it("même dernier jour : garde la série la plus longue", () => {
    const local = p({ streak: { days: 1, lastPlayedDay: "2026-05-01" } });
    const remote = p({ streak: { days: 10, lastPlayedDay: "2026-05-01" } });
    expect(mergeProgress(local, remote).streak.days).toBe(10);
  });

  it("l'autre appareil a joué la veille : sa série est prolongée", () => {
    const local = p({ streak: { days: 1, lastPlayedDay: "2026-05-01" } });
    const remote = p({ streak: { days: 10, lastPlayedDay: "2026-04-30" } });
    expect(mergeProgress(local, remote).streak).toEqual({ days: 11, lastPlayedDay: "2026-05-01" });
  });

  it("garde le lastPlayedDay le plus récent (lexicographique YYYY-MM-DD)", () => {
    const local = p({ streak: { days: 3, lastPlayedDay: "2026-05-01" } });
    const remote = p({ streak: { days: 3, lastPlayedDay: "2026-04-30" } });
    expect(mergeProgress(local, remote).streak.lastPlayedDay).toBe(
      "2026-05-01",
    );
  });

  it("lastPlayedDay null d'un côté = prend l'autre", () => {
    const local = p({ streak: { days: 0, lastPlayedDay: null } });
    const remote = p({ streak: { days: 4, lastPlayedDay: "2026-05-01" } });
    expect(mergeProgress(local, remote).streak.lastPlayedDay).toBe(
      "2026-05-01",
    );
  });
});

describe("mergeProgress : favorites", () => {
  it("garde l'addedAt le plus ancien (premier bookmark gagne)", () => {
    const local = p({ favorites: { a: { addedAt: 500 } } });
    const remote = p({ favorites: { a: { addedAt: 200 } } });
    const merged = mergeProgress(local, remote);
    expect(merged.favorites.a.addedAt).toBe(200);
  });

  it("union des questionIds", () => {
    const local = p({ favorites: { a: { addedAt: 100 } } });
    const remote = p({ favorites: { b: { addedAt: 200 } } });
    const merged = mergeProgress(local, remote);
    expect(Object.keys(merged.favorites).sort()).toEqual(["a", "b"]);
  });
});

describe("mergeProgress : version mismatch", () => {
  it("garde local si versions diffèrent", () => {
    const local = p({ version: 2, answers: { a: { value: 0, correct: true, ts: 1 } } });
    const remote = p({ version: 3, answers: { b: { value: 0, correct: true, ts: 2 } } });
    const merged = mergeProgress(local, remote);
    expect(merged).toBe(local);
  });
});

describe("todayKey", () => {
  it("renvoie un format YYYY-MM-DD", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("est stable pour une date donnée", () => {
    const d = new Date("2026-05-18T12:00:00Z");
    expect(todayKey(d)).toBe("2026-05-18");
  });
});
