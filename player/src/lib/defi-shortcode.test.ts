import { describe, expect, it } from "vitest";
import { generateShortCode, isValidShortCode } from "./defi-shortcode";

describe("generateShortCode", () => {
  it("renvoie un format <adj>-<nom>-<num>", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode();
      expect(code).toMatch(/^[a-z]+-[a-z]+-\d+$/);
    }
  });

  it("le num est dans la plage [100, 999]", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode();
      const num = Number(code.split("-")[2]);
      expect(num).toBeGreaterThanOrEqual(100);
      expect(num).toBeLessThanOrEqual(999);
    }
  });

  it("ne contient pas d'accents (slug ASCII-safe)", () => {
    for (let i = 0; i < 30; i++) {
      const code = generateShortCode();
      // Tous les chars doivent être ASCII (codes 0-127).
      for (const c of code) {
        expect(c.charCodeAt(0)).toBeLessThan(128);
      }
    }
  });

  it("entropie suffisante : 100 tirages = peu de collisions", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateShortCode());
    // Espace combinatoire ~50×50×900 = 2.25M ; 100 tirages devraient
    // tous être uniques avec probabilité ~99.998%.
    expect(seen.size).toBeGreaterThan(98);
  });
});

describe("isValidShortCode", () => {
  it("accepte les codes au format attendu", () => {
    expect(isValidShortCode("vague-rouge-9")).toBe(true);
    expect(isValidShortCode("calme-mer-42")).toBe(true);
    expect(isValidShortCode("haute-montagne-999")).toBe(true);
    expect(isValidShortCode("vague-rouge-1")).toBe(true);
  });

  it("rejette les formats invalides", () => {
    expect(isValidShortCode("")).toBe(false);
    expect(isValidShortCode("vague-rouge")).toBe(false);
    expect(isValidShortCode("vague-rouge-0")).toBe(false); // num doit être >= 1
    expect(isValidShortCode("vague-rouge-1000")).toBe(false); // 4 chiffres
    expect(isValidShortCode("Vague-rouge-9")).toBe(false); // majuscule
    expect(isValidShortCode("vague-rouge-9-extra")).toBe(false);
    expect(isValidShortCode("vague_rouge_9")).toBe(false);
    expect(isValidShortCode("../etc/passwd")).toBe(false);
    expect(isValidShortCode("'; DROP TABLE")).toBe(false);
  });

  it("accepte le format legacy 1-2 chiffres pour rétro-compat", () => {
    expect(isValidShortCode("vague-rouge-9")).toBe(true);
    expect(isValidShortCode("vague-rouge-42")).toBe(true);
  });
});
