import { describe, expect, it } from "vitest";
import { isCommonPassword } from "./common-passwords";

describe("isCommonPassword", () => {
  it("repère les classiques", () => {
    expect(isCommonPassword("password123")).toBe(true);
    expect(isCommonPassword("12345678")).toBe(true);
    expect(isCommonPassword("azerty123")).toBe(true);
    expect(isCommonPassword("motdepasse")).toBe(true);
  });

  it("est case-insensitive", () => {
    expect(isCommonPassword("PASSWORD123")).toBe(true);
    expect(isCommonPassword("AzErTy123")).toBe(true);
  });

  it("attrape les variantes politiques évidentes (compte militant)", () => {
    expect(isCommonPassword("mafrance2027")).toBe(true);
    expect(isCommonPassword("france2027")).toBe(true);
    expect(isCommonPassword("republique")).toBe(true);
    expect(isCommonPassword("melenchon")).toBe(true);
    expect(isCommonPassword("lepen123")).toBe(true);
    expect(isCommonPassword("macron123")).toBe(true);
  });

  it("laisse passer les mots de passe solides", () => {
    expect(isCommonPassword("CorrectHorseBatteryStaple")).toBe(false);
    expect(isCommonPassword("xK7$p9!nQ2vR")).toBe(false);
    expect(isCommonPassword("mon-secret-vraiment-pas-commun")).toBe(false);
  });
});
