import { describe, expect, it } from "vitest";
import { communityContrastLine } from "./format-shared";

describe("communityContrastLine", () => {
  it("null sans data", () => {
    expect(communityContrastLine({ userCorrect: true })).toBeNull();
  });

  it("correct + majoritaire (≥65%) → message 'comme la majorité'", () => {
    const out = communityContrastLine({ userCorrect: true, userPickPct: 78 });
    expect(out).toContain("majorité");
    expect(out).toContain("78");
  });

  it("correct + minoritaire (≤35%) → message 'tu vois clair'", () => {
    const out = communityContrastLine({ userCorrect: true, userPickPct: 22 });
    expect(out).toContain("vois clair");
    expect(out).toContain("22");
  });

  it("correct + médian → message neutre", () => {
    const out = communityContrastLine({ userCorrect: true, userPickPct: 50 });
    expect(out).toContain("50");
    expect(out).toContain("comme toi");
  });

  it("incorrect + erreur majoritaire → 'tu n'es pas seul·e'", () => {
    const out = communityContrastLine({
      userCorrect: false,
      userPickPct: 70,
      oppositePickPct: 30,
    });
    expect(out).toContain("pas seul");
    expect(out).toContain("70");
  });

  it("incorrect + erreur moins partagée (6–25 %) → même choix + renvoi au dossier", () => {
    const out = communityContrastLine({
      userCorrect: false,
      userPickPct: 18,
    });
    expect(out).toContain("même choix que toi");
    expect(out).toContain("18");
    expect(out).toContain("dossier");
  });

  it("incorrect + erreur très rare (≤5 %, dont 0 %) → formulation neutre sans chiffre", () => {
    for (const pct of [0, 3, 5]) {
      const out = communityContrastLine({ userCorrect: false, userPickPct: pct });
      expect(out).not.toContain("pas seul");
      expect(out).not.toMatch(/\d/);
      expect(out).toContain("dossier");
    }
  });

  it("espace insécable avant « % »", () => {
    const out = communityContrastLine({ userCorrect: true, userPickPct: 78 });
    expect(out).toContain(`78${String.fromCharCode(160)}%`);
  });
});
