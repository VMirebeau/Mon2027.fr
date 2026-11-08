// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// guard.ts importe next/headers (pour clientIp) : inutile ici.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const { attempt, resetAttempts, safeNextPath } = await import("./guard");

describe("redirection après connexion", () => {
  it("n'accepte que des chemins internes", () => {
    expect(safeNextPath("/questions/abc")).toBe("/questions/abc");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});

describe("limitation des essais", () => {
  it("bloque au-delà de la limite puis repart après la fenêtre", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(attempt(key, 3, 1000, 0)).toBe(true);
    expect(attempt(key, 3, 1000, 10)).toBe(false);
    expect(attempt(key, 3, 1000, 2000)).toBe(true);
  });

  it("reset après un succès", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 4; i++) attempt(key, 3, 60_000);
    resetAttempts(key);
    expect(attempt(key, 3, 60_000)).toBe(true);
  });
});
