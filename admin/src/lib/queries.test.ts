// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildWhere, describeFilters, hasAnyFilter, pickFilters, toSearchParams } from "./queries";

describe("vue « À valider » de la liste", () => {
  it("n'accepte que les vues connues", () => {
    expect(pickFilters({ vue: "a-valider" })).toEqual({ vue: "a-valider" });
    expect(pickFilters({ vue: "n-importe-quoi" })).toEqual({});
  });

  it("est un filtre à part entière : liens de revue, libellé, bouton « Effacer »", () => {
    const f = pickFilters({ vue: "a-valider", theme: "Santé" });
    expect(hasAnyFilter(f)).toBe(true);
    expect(toSearchParams(f).get("vue")).toBe("a-valider");
    expect(describeFilters(f)).toBe("À valider · Santé");
  });

  it("restreint aux questions en revue sans écraser un statut choisi", () => {
    expect(buildWhere({ vue: "a-valider" })).toEqual({ AND: [{ statut: "revue" }] });
    expect(buildWhere({ vue: "a-valider", statut: "publie" })).toEqual({
      statut: "publie",
      AND: [{ statut: "revue" }],
    });
  });
});
