import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from "./password";

describe("mots de passe joueurs", () => {
  it("hache en scrypt et vérifie", async () => {
    const h = await hashPassword("une phrase de passe");
    expect(h.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("une phrase de passe", h)).toBe(true);
    expect(await verifyPassword("autre chose", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
  });

  it("vérifie encore les anciens hashs bcrypt et demande leur remplacement", async () => {
    const legacy = await bcrypt.hash("ancien mot de passe", 4);
    expect(await verifyPassword("ancien mot de passe", legacy)).toBe(true);
    expect(await verifyPassword("faux", legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("refuse un hash illisible sans planter", async () => {
    expect(await verifyPassword("x", "n'importe quoi")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$$")).toBe(false);
  });

  it("supporte des vérifications simultanées au-delà du nombre de places", async () => {
    const h = await getDummyHash();
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyPassword("x", h)));
    expect(results.every((r) => r === false)).toBe(true);
  });
});
