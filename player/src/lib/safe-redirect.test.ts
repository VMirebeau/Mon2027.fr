import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./safe-redirect";

describe("sanitizeNextPath", () => {
  describe("accepte les chemins internes valides", () => {
    it("racine", () => {
      expect(sanitizeNextPath("/")).toBe("/");
    });
    it("chemin simple", () => {
      expect(sanitizeNextPath("/defis")).toBe("/defis");
    });
    it("chemin avec paramètres", () => {
      expect(sanitizeNextPath("/d/abc-123/resultats")).toBe(
        "/d/abc-123/resultats"
      );
    });
    it("chemin avec query string", () => {
      expect(sanitizeNextPath("/?s=challenge&x=1")).toBe("/?s=challenge&x=1");
    });
    it("chemin avec fragment", () => {
      expect(sanitizeNextPath("/d/abc#q-42")).toBe("/d/abc#q-42");
    });
    it("chemin contenant : après le /", () => {
      // `:` est légitime dans un path (ex. /path/foo:bar), pas un scheme.
      expect(sanitizeNextPath("/path/foo:bar")).toBe("/path/foo:bar");
    });
  });

  describe("rejette les redirections externes (open redirect)", () => {
    it("URL absolue http", () => {
      expect(sanitizeNextPath("http://evil.com")).toBeNull();
    });
    it("URL absolue https", () => {
      expect(sanitizeNextPath("https://evil.com")).toBeNull();
    });
    it("protocol-relative //evil.com", () => {
      expect(sanitizeNextPath("//evil.com")).toBeNull();
    });
    it("protocol-relative avec path", () => {
      expect(sanitizeNextPath("//evil.com/phish")).toBeNull();
    });
    it("scheme javascript:", () => {
      expect(sanitizeNextPath("javascript:alert(1)")).toBeNull();
    });
    it("scheme data:", () => {
      expect(sanitizeNextPath("data:text/html,<script>")).toBeNull();
    });
  });

  describe("rejette les entrées tordues", () => {
    it("backslash après le /", () => {
      // /\evil.com fait croire à un path interne mais certains navigateurs
      // normalisent en //evil.com — on bloque.
      expect(sanitizeNextPath("/\\evil.com")).toBeNull();
    });
    it("CR/LF (anti header-injection)", () => {
      expect(sanitizeNextPath("/foo\r\nSet-Cookie: x=1")).toBeNull();
      expect(sanitizeNextPath("/foo\nbar")).toBeNull();
      expect(sanitizeNextPath("/foo\rbar")).toBeNull();
    });
    it("chemin relatif sans /", () => {
      expect(sanitizeNextPath("foo")).toBeNull();
      expect(sanitizeNextPath("./foo")).toBeNull();
      expect(sanitizeNextPath("../foo")).toBeNull();
    });
    it("chaîne vide", () => {
      expect(sanitizeNextPath("")).toBeNull();
    });
    it("chemin trop long (> 2KB)", () => {
      expect(sanitizeNextPath("/" + "a".repeat(2048))).toBeNull();
    });
  });

  describe("rejette les valeurs non-string", () => {
    it("null", () => {
      expect(sanitizeNextPath(null)).toBeNull();
    });
    it("undefined", () => {
      expect(sanitizeNextPath(undefined)).toBeNull();
    });
  });
});
