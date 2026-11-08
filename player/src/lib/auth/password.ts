import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import bcrypt from "bcryptjs";

/// Hachage des mots de passe joueurs.
///
/// scrypt natif (node:crypto) depuis le 2026-11-07, au lieu de bcryptjs :
/// bcryptjs est du JavaScript pur qui calcule ~250-400 ms sur le fil
/// principal à chaque connexion, et quelques connexions simultanées (une
/// salle qui se connecte en même temps) ralentissaient tout le site. scrypt
/// tourne dans le pool de threads de Node, hors du fil principal.
///
/// Format auto-décrit `scrypt$N$r$p$sel$hash`, identique à celui des comptes
/// contributeurs (admin/src/lib/auth/password.ts), pour pouvoir durcir les
/// paramètres plus tard sans casser les hashs existants.
///
/// Comptes existants : leurs hashs bcrypt (`$2a$`/`$2b$`) restent vérifiés
/// par bcryptjs, puis sont remplacés par un hash scrypt à la connexion
/// réussie suivante (cf. needsRehash, appelé par /api/auth/login).

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
/// scrypt demande 128·N·r octets (32 Mo ici) : au-dessus du plafond par
/// défaut de Node, d'où un maxmem explicite.
const MAXMEM = 64 * 1024 * 1024;

/// Au plus MAX_ACTIVE hachages en même temps (32 Mo de mémoire chacun, et
/// le pool de threads de Node ne compte que 4 fils, partagés avec le reste),
/// et au plus MAX_QUEUED en attente. Au-delà, on refuse plutôt que
/// d'accumuler : la route répond 503 « réessaie dans un instant ».
const MAX_ACTIVE = 3;
const MAX_QUEUED = 64;

export class PasswordBusyError extends Error {
  constructor() {
    super("password_hashing_busy");
    this.name = "PasswordBusyError";
  }
}

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_ACTIVE) {
    if (waiting.length >= MAX_QUEUED) throw new PasswordBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active++;
  }
  try {
    return await fn();
  } finally {
    // On passe la place au suivant sans la libérer (active reste stable).
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

function derive(plain: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export function hashPassword(plain: string): Promise<string> {
  return withSlot(async () => {
    const salt = randomBytes(16);
    const key = await derive(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
    return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
  });
}

function isBcrypt(stored: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

export function verifyPassword(plain: string, stored: string): Promise<boolean> {
  return withSlot(async () => {
    if (isBcrypt(stored)) return bcrypt.compare(plain, stored);
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
  });
}

/// Vrai si le hash stocké n'est pas au format et aux paramètres courants :
/// à remplacer après une connexion réussie (le mot de passe en clair n'est
/// connu qu'à ce moment-là).
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  return !(
    parts.length === 6 &&
    parts[0] === "scrypt" &&
    Number(parts[1]) === N &&
    Number(parts[2]) === R &&
    Number(parts[3]) === P
  );
}

/// Hash jetable calculé une fois : la connexion d'un pseudo inconnu prend le
/// même temps qu'un mauvais mot de passe (pas d'énumération des comptes).
/// Limite connue et transitoire : un compte encore en bcrypt répond plus
/// lentement qu'un pseudo inconnu, jusqu'à sa prochaine connexion réussie.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("compte-inexistant-egalisation-du-temps").catch((e) => {
    dummyHash = null;
    throw e;
  });
  return dummyHash;
}
