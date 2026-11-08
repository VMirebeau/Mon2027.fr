import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/// Hachage des mots de passe contributeurs : scrypt (natif Node, aucune
/// dépendance), format auto-décrit `scrypt$N$r$p$sel$hash` pour pouvoir
/// durcir les paramètres plus tard sans casser les hashs existants.
///
/// ⚠️ Implémentation jumelle dans scripts/contributor.cjs (création de comptes
/// en ligne de commande). Le test password.test.ts vérifie la compatibilité.

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
/// scrypt demande 128·N·r octets (32 Mo ici) : au-dessus du plafond par
/// défaut de Node, d'où un maxmem explicite.
const MAXMEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;

function derive(plain: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  if (expected.length === 0) return false;
  try {
    const key = await derive(plain, Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAXMEM,
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/// Hash jetable calculé une fois : la connexion d'un login inconnu prend le
/// même temps qu'un mauvais mot de passe (pas d'énumération des comptes).
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("compte-inexistant-egalisation-du-temps");
  return dummyHash;
}

/// Mot de passe provisoire remis par un admin (16 caractères, ~96 bits).
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

export function validateNewPassword(plain: string, login: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return `Au moins ${MIN_PASSWORD_LENGTH} caractères. Une phrase de plusieurs mots est idéale.`;
  }
  if (plain.length > 200) return "200 caractères maximum.";
  if (plain.toLowerCase().includes(login.toLowerCase())) {
    return "Le mot de passe ne doit pas contenir ton identifiant.";
  }
  if (new Set(plain).size < 5) return "Trop répétitif : varie davantage les caractères.";
  return null;
}
