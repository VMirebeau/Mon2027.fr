import { describe, expect, it } from "vitest";
import {
  decodePortraitCode,
  encodePortraitCode,
  type PortraitCodePayload,
} from "./portrait-url";
import { INDICATOR_IDS } from "./indicators";

const mkPayload = (
  overrides: Partial<Record<string, number>> = {},
  view: PortraitCodePayload["view"] = "me",
  lucidity: number | null = 50,
  measuredCount: number | null = 9,
): PortraitCodePayload => ({
  scores: Object.fromEntries(
    INDICATOR_IDS.map((id) => [id, overrides[id] ?? 0]),
  ) as PortraitCodePayload["scores"],
  view,
  lucidity,
  measuredCount,
});

describe("portrait-url encode/decode", () => {
  it("round-trip à zéro", () => {
    const payload = mkPayload();
    const code = encodePortraitCode(payload);
    const decoded = decodePortraitCode(code);
    expect(decoded).not.toBeNull();
    // Tolérance 1.6% (1/64) sur la précision
    for (const id of INDICATOR_IDS) {
      expect(Math.abs(decoded!.scores[id] - 0)).toBeLessThan(0.02);
    }
    expect(decoded!.view).toBe("me");
  });

  it("encode des scores variés et les retrouve à ~2% près", () => {
    const payload = mkPayload({
      precarite: 0.5,
      inegalites: -0.7,
      migration: 1.0,
      insecurite: -1.0,
      climat: 0.25,
    });
    const code = encodePortraitCode(payload);
    expect(code.length).toBe(12);
    const decoded = decodePortraitCode(code);
    expect(decoded).not.toBeNull();
    expect(Math.abs(decoded!.scores.precarite - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(decoded!.scores.inegalites - -0.7)).toBeLessThan(0.02);
    expect(Math.abs(decoded!.scores.migration - 1.0)).toBeLessThan(0.02);
    expect(Math.abs(decoded!.scores.insecurite - -1.0)).toBeLessThan(0.02);
  });

  it("encode le drapeau view (me/community/both)", () => {
    const meCode = encodePortraitCode(mkPayload({}, "me"));
    const commCode = encodePortraitCode(mkPayload({}, "community"));
    const bothCode = encodePortraitCode(mkPayload({}, "both"));
    // Le drapeau view est en position INDICATOR_IDS.length (index 9), pas
    // forcément le dernier char (suivi de lucidity + measuredCount).
    expect(meCode[INDICATOR_IDS.length]).toBe("m");
    expect(commCode[INDICATOR_IDS.length]).toBe("c");
    expect(bothCode[INDICATOR_IDS.length]).toBe("b");
    expect(decodePortraitCode(commCode)!.view).toBe("community");
  });

  it("encode et retrouve le score Lucidité à ±2 près", () => {
    const payload = mkPayload({}, "me", 84, 5);
    const code = encodePortraitCode(payload);
    const decoded = decodePortraitCode(code);
    expect(decoded).not.toBeNull();
    expect(Math.abs((decoded!.lucidity ?? 0) - 84)).toBeLessThanOrEqual(2);
    expect(decoded!.measuredCount).toBe(5);
  });

  it("code legacy 10 chars → lucidity et measuredCount sont null", () => {
    // Simule un ancien code (avant l'ajout des 2 chars de Lucidité)
    const legacy = "AAAAAAAAAm"; // 10 chars
    const decoded = decodePortraitCode(legacy);
    expect(decoded).not.toBeNull();
    expect(decoded!.lucidity).toBeNull();
    expect(decoded!.measuredCount).toBeNull();
  });

  it("clamp les scores hors [-1, +1]", () => {
    const payload = mkPayload({ precarite: 5, inegalites: -3 });
    const decoded = decodePortraitCode(encodePortraitCode(payload));
    expect(decoded!.scores.precarite).toBeLessThanOrEqual(1);
    expect(decoded!.scores.inegalites).toBeGreaterThanOrEqual(-1);
    // L'arrondi de clamp(+5) doit donner ~+1, et clamp(-3) ~-1.
    expect(decoded!.scores.precarite).toBeGreaterThan(0.95);
    expect(decoded!.scores.inegalites).toBeLessThan(-0.95);
  });

  it("decode code de mauvaise longueur → null", () => {
    expect(decodePortraitCode("abc")).toBeNull();
    expect(decodePortraitCode("")).toBeNull();
    expect(decodePortraitCode("a".repeat(20))).toBeNull();
    // Longueur 11 (entre legacy 10 et current 12) → null
    expect(decodePortraitCode("a".repeat(11))).toBeNull();
  });

  it("decode code avec chars inconnus → score 0 (juste) sur ces axes", () => {
    // 12 chars dont des @ (invalides) — on attend des scores 0 sans throw,
    // pas un crash. C'est la défense contre une URL bricolée.
    const decoded = decodePortraitCode("@@@@@@@@@m@@");
    expect(decoded).not.toBeNull();
    for (const id of INDICATOR_IDS) {
      expect(decoded!.scores[id]).toBe(0);
    }
  });
});

describe("codes de portrait canoniques", () => {
  it("accepte un code produit par l'encodeur et refuse ses variantes", async () => {
    const { encodePortraitCode, isCanonicalPortraitCode, decodePortraitCode } = await import("./portrait-url");
    const any12 = "A".repeat(12);
    const payload = decodePortraitCode(any12);
    expect(payload).not.toBeNull();
    const code = encodePortraitCode(payload!);
    expect(isCanonicalPortraitCode(code)).toBe(true);
    // Un caractère hors alphabet est lu comme 0 par le décodeur : même
    // portrait, autre URL → refusé.
    const variant = "!" + code.slice(1);
    expect(isCanonicalPortraitCode(variant)).toBe(false);
    expect(isCanonicalPortraitCode("court")).toBe(false);
  });
});
