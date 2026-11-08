import { describe, expect, it } from "vitest";
import { niceStepForSpan, roundToStep, stepDecimals } from "./step-rounding";

describe("pas dérivé de la plage (échelles sans pas)", () => {
  it("~1 % de l'étendue, arrondi à une valeur ronde", () => {
    expect(niceStepForSpan(100)).toBe(1);
    expect(niceStepForSpan(30)).toBe(0.5);
    expect(niceStepForSpan(7)).toBe(0.1);
    expect(niceStepForSpan(1_000_000)).toBe(10_000);
    expect(niceStepForSpan(0)).toBe(1);
  });

  it("décimales du pas", () => {
    expect(stepDecimals(0.05)).toBe(2);
    expect(stepDecimals(0.1)).toBe(1);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(5)).toBe(0);
  });
});

describe("roundToStep", () => {
  it("la position relevée en prod (11.98263708750407) devient 12", () => {
    expect(roundToStep(11.98263708750407, niceStepForSpan(30))).toBe(12);
    expect(roundToStep(11.98263708750407, 1)).toBe(12);
  });

  it("pas de résidu flottant", () => {
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3);
    expect(roundToStep(2.349, 0.05)).toBe(2.35);
  });

  it("borné à la plage", () => {
    expect(roundToStep(-0.4, 1, 0, 30)).toBe(0);
    expect(roundToStep(31, 5, 0, 30)).toBe(30);
    expect(roundToStep(3.2, 5, 3, 40)).toBe(5);
    expect(roundToStep(0.4, 1, 0.5, 9.5)).toBe(0.5);
  });
});
