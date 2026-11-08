import { describe, expect, it } from "vitest";
import { frenchSpaces } from "./typo";

const N = " ";

describe("espaces insécables", () => {
  it("avant les signes doubles et après les guillemets", () => {
    expect(frenchSpaces("« Vrai ? » 30 %")).toBe(`«${N}Vrai${N}?${N}» 30${N}%`);
  });
  it("milliers et euros", () => {
    expect(frenchSpaces("340 801 logements, 1 500 000 personnes, 2,5 Md€")).toBe(
      `340${N}801 logements, 1${N}500${N}000 personnes, 2,5${N}Md€`,
    );
  });
  it("ne touche pas aux années ni aux nombres séparés", () => {
    expect(frenchSpaces("entre 2023 et 2024")).toBe("entre 2023 et 2024");
  });
  it("est idempotent", () => {
    const once = frenchSpaces("« 30 % ? »");
    expect(frenchSpaces(once)).toBe(once);
  });
});
