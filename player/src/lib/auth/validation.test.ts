import { describe, expect, it } from "vitest";
import {
  normalizePseudo,
  validatePassword,
  validatePseudo,
} from "./validation";

describe("validatePseudo", () => {
  it("accepte les pseudos valides", () => {
    expect(validatePseudo("alice")).toBeNull();
    expect(validatePseudo("Sarah_M")).toBeNull();
    expect(validatePseudo("éléonore")).toBeNull();
    expect(validatePseudo("user-2027")).toBeNull();
    expect(validatePseudo("a.b.c")).toBeNull();
  });

  it("rejette les pseudos trop courts", () => {
    expect(validatePseudo("ab")).not.toBeNull();
  });

  it("rejette les pseudos trop longs", () => {
    expect(validatePseudo("a".repeat(31))).not.toBeNull();
  });

  it("rejette les pseudos avec espaces ou caractères spéciaux", () => {
    expect(validatePseudo("hello world")).not.toBeNull();
    expect(validatePseudo("user@domain")).not.toBeNull();
    expect(validatePseudo("user!")).not.toBeNull();
  });

  it("rejette les pseudos vides ou whitespace", () => {
    expect(validatePseudo("")).not.toBeNull();
    expect(validatePseudo("   ")).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("accepte les mots de passe ≥ 8 chars qui ne sont pas dans la blacklist", () => {
    expect(validatePassword("CorrectHorseBatteryStaple")).toBeNull();
    expect(validatePassword("mon-secret-2027!")).toBeNull();
  });

  it("rejette les mots de passe trop courts", () => {
    expect(validatePassword("abc")).not.toBeNull();
    expect(validatePassword("1234567")).not.toBeNull();
  });

  it("rejette les mots de passe communs (case-insensitive)", () => {
    expect(validatePassword("password123")).not.toBeNull();
    expect(validatePassword("Password123")).not.toBeNull();
    expect(validatePassword("AZERTY123")).not.toBeNull();
    expect(validatePassword("MotDePasse")).not.toBeNull();
    expect(validatePassword("France2027")).not.toBeNull();
  });

  it("rejette les mots de passe trop longs", () => {
    expect(validatePassword("a".repeat(201))).not.toBeNull();
  });
});

describe("normalizePseudo", () => {
  it("trim et lowercase", () => {
    expect(normalizePseudo("  Alice  ")).toBe("alice");
    expect(normalizePseudo("SARAH_M")).toBe("sarah_m");
  });
});
