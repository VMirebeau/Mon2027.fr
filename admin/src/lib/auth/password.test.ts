// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, validateNewPassword, verifyPassword } from "./password";

const require = createRequire(import.meta.url);
const cli = require("../../../../scripts/contributor.cjs") as { hashPassword: (p: string) => Promise<string> };

describe("mots de passe contributeurs", () => {
  it("vérifie un hash produit ici et refuse un mauvais mot de passe", async () => {
    const h = await hashPassword("une phrase de passe solide");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("une phrase de passe solide", h)).toBe(true);
    expect(await verifyPassword("une phrase de passe solidE", h)).toBe(false);
  });

  it("accepte les hashs créés par le script en ligne de commande", async () => {
    const h = await cli.hashPassword("mot de passe créé en CLI");
    expect(await verifyPassword("mot de passe créé en CLI", h)).toBe(true);
  });

  it("refuse les hashs malformés sans planter", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$2$3$$")).toBe(false);
  });

  it("règles de choix du mot de passe", () => {
    expect(validateNewPassword("court", "alice")).toMatch(/12/);
    expect(validateNewPassword("alice-et-encore", "alice")).toMatch(/identifiant/);
    expect(validateNewPassword("aaaaaaaaaaaaab", "x")).toMatch(/répétitif/);
    expect(validateNewPassword("cheval agrafe batterie", "alice")).toBeNull();
  });

  it("mots de passe provisoires : 16 caractères, tous différents", () => {
    const a = generateTemporaryPassword();
    expect(a).toHaveLength(16);
    expect(generateTemporaryPassword()).not.toBe(a);
  });
});
