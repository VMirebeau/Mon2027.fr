import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESS,
  addFavorite,
  isReceivedDefiHidden,
  mergeProgress,
  recordReceivedDefiPlayed,
  removeFavorite,
  removeReceivedDefi,
  type Progress,
  type ReceivedChallenge,
} from "./progress";

const t = (iso: string) => new Date(iso);
const defi = (id: string, createdAt: number): ReceivedChallenge =>
  ({ id, from: "Camille", createdAt, questionIds: [], opponentScore: 3, myScore: 2, total: 5 }) as ReceivedChallenge;

describe("retraits datés (fusion entre appareils)", () => {
  it("un favori retiré ici ne revient pas depuis l'autre appareil", () => {
    const both = addFavorite(DEFAULT_PROGRESS, "Q-1", t("2026-11-01"));
    const phone = removeFavorite(both, "Q-1", t("2026-11-05"));
    const laptop = both; // pas encore synchronisé
    expect(mergeProgress(phone, laptop).favorites["Q-1"]).toBeUndefined();
    expect(mergeProgress(laptop, phone).favorites["Q-1"]).toBeUndefined();
  });

  it("un favori remis après son retrait est gardé, daté du nouvel ajout", () => {
    const a = removeFavorite(addFavorite(DEFAULT_PROGRESS, "Q-1", t("2026-11-01")), "Q-1", t("2026-11-02"));
    const readded = addFavorite(a, "Q-1", t("2026-11-03"));
    const old = addFavorite(DEFAULT_PROGRESS, "Q-1", t("2026-11-01"));
    const merged = mergeProgress(old, readded);
    expect(merged.favorites["Q-1"]?.addedAt).toBe(t("2026-11-03").getTime());
  });

  it("un défi reçu masqué ne revient ni par la fusion ni par un nouvel enregistrement", () => {
    const played = recordReceivedDefiPlayed(DEFAULT_PROGRESS, defi("abc", 1));
    const hidden = removeReceivedDefi(played, "abc", t("2026-11-05"));
    expect(isReceivedDefiHidden(hidden, "abc")).toBe(true);
    expect(mergeProgress(hidden, played).challenges.received).toHaveLength(0);
    const again = recordReceivedDefiPlayed(hidden, defi("abc", 2));
    expect(again.challenges.received).toHaveLength(0);
    expect(again.gamif.defisReceivedPlayed).toBe(1);
  });

  it("les traces trop anciennes sont oubliées à la fusion", () => {
    const old: Progress = {
      ...DEFAULT_PROGRESS,
      tombstones: { favorites: { "Q-9": Date.now() - 500 * 86_400_000 }, received: {} },
    };
    expect(mergeProgress(old, DEFAULT_PROGRESS).tombstones?.favorites["Q-9"]).toBeUndefined();
  });
});

describe("série en cours", () => {
  it("vaut 0 si le dernier jour joué est avant hier", async () => {
    const { currentStreak } = await import("./progress");
    const p = { ...DEFAULT_PROGRESS, streak: { days: 10, lastPlayedDay: "2026-11-01" } };
    expect(currentStreak(p, t("2026-11-02T10:00:00Z"))).toBe(10);
    expect(currentStreak(p, t("2026-11-01T10:00:00Z"))).toBe(10);
    expect(currentStreak(p, t("2026-11-05T10:00:00Z"))).toBe(0);
  });
});
