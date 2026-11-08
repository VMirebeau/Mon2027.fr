import { describe, expect, it } from "vitest";
import {
  as01,
  asBoolean,
  asNumber,
  asRecordBoolean,
  asRecordNumber,
  asRecordString,
  asStringArray,
} from "./coerce-answer";

describe("coerceAnswer narrowers", () => {
  it("asNumber accepte les nombres, rejette le reste", () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-1.5)).toBe(-1.5);
    expect(asNumber("42")).toBeNull();
    expect(asNumber(null)).toBeNull();
    expect(asNumber(undefined)).toBeNull();
    expect(asNumber(true)).toBeNull();
    expect(asNumber({})).toBeNull();
  });

  it("asBoolean accepte true/false, rejette le reste", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
    expect(asBoolean(1)).toBeNull();
    expect(asBoolean("true")).toBeNull();
    expect(asBoolean(null)).toBeNull();
  });

  it("as01 accepte 0 et 1, rejette le reste", () => {
    expect(as01(0)).toBe(0);
    expect(as01(1)).toBe(1);
    expect(as01(2)).toBeNull();
    expect(as01(-1)).toBeNull();
    expect(as01("0")).toBeNull();
    expect(as01(null)).toBeNull();
  });

  it("asStringArray accepte que les arrays de strings", () => {
    expect(asStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(asStringArray([])).toEqual([]);
    expect(asStringArray(["a", 1])).toBeNull();
    expect(asStringArray({ 0: "a" })).toBeNull();
    expect(asStringArray("ab")).toBeNull();
    expect(asStringArray(null)).toBeNull();
  });

  it("asRecord* rejettent null, arrays, primitives", () => {
    expect(asRecordBoolean({ a: true })).toEqual({ a: true });
    expect(asRecordBoolean([])).toBeNull();
    expect(asRecordBoolean(null)).toBeNull();
    expect(asRecordBoolean("foo")).toBeNull();

    expect(asRecordNumber({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(asRecordNumber([1, 2])).toBeNull();

    expect(asRecordString({ a: "x" })).toEqual({ a: "x" });
    expect(asRecordString(null)).toBeNull();
  });
});
