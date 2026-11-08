import { describe, expect, it } from "vitest";
import { composePortraitShareText } from "./stats";
import type { IndicatorBiasRow, ThemeStatRow } from "@/lib/progress-stats";

const mkTheme = (label: string, accuracyPct: number): ThemeStatRow => ({
  id: label.toLowerCase(),
  label,
  color: "#000",
  total: 50,
  answered: 10,
  correct: Math.round((accuracyPct / 100) * 10),
  accuracyPct,
});

const mkIndic = (
  id: string,
  subjectShort: string,
  signedScore: number,
): IndicatorBiasRow =>
  ({
    id,
    label: id,
    subjectShort,
    signedScore,
    count: 5,
    qualitative: signedScore > 0 ? "sur" : "sous",
  }) as unknown as IndicatorBiasRow;

describe("composePortraitShareText", () => {
  it("null sans aucun insight", () => {
    expect(
      composePortraitShareText({
        strongTheme: null,
        weakTheme: null,
        indicatorBiases: [],
      }),
    ).toBeNull();
  });

  it("strongTheme seul → 1 fragment", () => {
    const out = composePortraitShareText({
      strongTheme: mkTheme("Climat", 80),
      weakTheme: null,
      indicatorBiases: [],
    });
    expect(out).toContain("climat");
    expect(out).toContain("mon2027.fr");
    expect(out!.length).toBeLessThanOrEqual(280);
  });

  it("strong + weak + biais → texte complet", () => {
    const out = composePortraitShareText({
      strongTheme: mkTheme("Climat", 85),
      weakTheme: mkTheme("Économie", 35),
      indicatorBiases: [
        mkIndic("migration", "la présence de l'immigration", 0.6),
      ],
    });
    expect(out).toContain("climat");
    expect(out).toContain("économie");
    expect(out).toContain("immigration");
    expect(out).toContain("surestime");
    expect(out!.length).toBeLessThanOrEqual(280);
  });

  it("biais négatif → 'sous-estime'", () => {
    const out = composePortraitShareText({
      strongTheme: mkTheme("Climat", 80),
      weakTheme: null,
      indicatorBiases: [
        mkIndic("precarite", "la précarité des plus modestes", -0.3),
      ],
    });
    expect(out).toContain("sous-estime");
    expect(out).toContain("précarité");
  });
});
