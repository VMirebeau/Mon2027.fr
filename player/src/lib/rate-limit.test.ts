import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientIp, LIMITS, rateLimit } from "./rate-limit";

describe("getClientIp : TRUST_PROXY=none", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY", "none");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retourne 'unknown' même si XFF est posé (anti-spoof)", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(h)).toBe("unknown");
  });

  it("ignore cf-connecting-ip aussi quand mode=none", () => {
    const h = new Headers({ "cf-connecting-ip": "5.6.7.8" });
    expect(getClientIp(h)).toBe("unknown");
  });
});

describe("getClientIp : TRUST_PROXY=cloudflare", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY", "cloudflare");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lit cf-connecting-ip", () => {
    const h = new Headers({ "cf-connecting-ip": "5.6.7.8" });
    expect(getClientIp(h)).toBe("5.6.7.8");
  });

  it("ignore x-forwarded-for même si posé (cloudflare uniquement)", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(h)).toBe("unknown");
  });
});

describe("getClientIp : TRUST_PROXY=xff-last", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY", "xff-last");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prend la DERNIÈRE IP de XFF, pas la première", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" });
    expect(getClientIp(h)).toBe("9.10.11.12");
  });

  it("trim les espaces autour des IPs", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4,   5.6.7.8" });
    expect(getClientIp(h)).toBe("5.6.7.8");
  });

  it("XFF vide = unknown", () => {
    const h = new Headers();
    expect(getClientIp(h)).toBe("unknown");
  });
});

describe("rateLimit", () => {
  // Une clé unique par test pour éviter la pollution du store partagé.
  let testCounter = 0;
  function k() {
    testCounter += 1;
    return `test-key-${testCounter}-${Date.now()}-${Math.random()}`;
  }

  it("accepte les hits sous la limite", () => {
    const key = k();
    for (let i = 0; i < 5; i++) {
      const r = rateLimit(key, { limit: 5, windowMs: 60_000 });
      expect(r.ok).toBe(true);
    }
  });

  it("rejette dès qu'on dépasse la limite", () => {
    const key = k();
    for (let i = 0; i < 3; i++) {
      rateLimit(key, { limit: 3, windowMs: 60_000 });
    }
    const r = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(r.ok).toBe(false);
  });

  it("remaining décroît à chaque hit", () => {
    const key = k();
    const r1 = rateLimit(key, { limit: 5, windowMs: 60_000 });
    expect(r1.remaining).toBe(4);
    const r2 = rateLimit(key, { limit: 5, windowMs: 60_000 });
    expect(r2.remaining).toBe(3);
  });

  it("reset après la fenêtre", async () => {
    const key = k();
    for (let i = 0; i < 3; i++) {
      rateLimit(key, { limit: 3, windowMs: 50 });
    }
    expect(rateLimit(key, { limit: 3, windowMs: 50 }).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(rateLimit(key, { limit: 3, windowMs: 50 }).ok).toBe(true);
  });

  it("clés différentes ne s'interférent pas", () => {
    const k1 = k();
    const k2 = k();
    for (let i = 0; i < 5; i++) {
      rateLimit(k1, { limit: 5, windowMs: 60_000 });
    }
    // k1 est bloqué mais k2 reste accessible
    expect(rateLimit(k1, { limit: 5, windowMs: 60_000 }).ok).toBe(false);
    expect(rateLimit(k2, { limit: 5, windowMs: 60_000 }).ok).toBe(true);
  });
});

/// Politique : une IP partagée (local militant, lycée, CGNAT mobile) doit
/// supporter une salle d'une trentaine de personnes actives. Ces tests
/// empêchent de resserrer une limite sans y penser.
describe("LIMITS : dimensionnement pour une salle de 30 personnes sur une IP", () => {
  const ROOM = 30;
  const perMinute = (l: { limit: number; windowMs: number }) => (l.limit * 60_000) / l.windowMs;

  it("tout le monde peut créer son compte dans l'heure", () => {
    expect(LIMITS.signupPerIp.windowMs).toBe(60 * 60_000);
    expect(LIMITS.signupPerIp.limit).toBeGreaterThanOrEqual(ROOM);
  });

  it("tout le monde peut se connecter dans la même minute (2 essais chacun)", () => {
    expect(perMinute(LIMITS.loginPerIp)).toBeGreaterThanOrEqual(ROOM * 2);
  });

  it("30 joueurs à ~1 réponse / 10 s ne perdent aucune réponse", () => {
    expect(perMinute(LIMITS.answersPerIp)).toBeGreaterThanOrEqual(ROOM * 6);
  });

  it("30 amis peuvent ouvrir et jouer un défi dans la même minute", () => {
    expect(perMinute(LIMITS.defiReadPerIp)).toBeGreaterThanOrEqual(ROOM * 2);
    expect(perMinute(LIMITS.defiRespondPerIp)).toBeGreaterThanOrEqual(ROOM);
  });

  it("le brute-force sur UN compte reste borné, quelle que soit l'IP", () => {
    // ≤ 1 500 essais par jour sur un pseudo donné.
    const perDay = (LIMITS.loginPerPseudo.limit * 24 * 3_600_000) / LIMITS.loginPerPseudo.windowMs;
    expect(perDay).toBeLessThanOrEqual(1_500);
  });

  it("la limite par pseudo s'applique même si les essais changent d'IP", () => {
    const pseudo = `login:pseudo:test-${Math.random()}`;
    for (let i = 0; i < LIMITS.loginPerPseudo.limit; i++) {
      expect(rateLimit(pseudo, LIMITS.loginPerPseudo).ok).toBe(true);
      // chaque essai vient d'une IP différente : le plafond IP ne joue pas
      expect(rateLimit(`login:ip:10.0.0.${i}`, LIMITS.loginPerIp).ok).toBe(true);
    }
    expect(rateLimit(pseudo, LIMITS.loginPerPseudo).ok).toBe(false);
  });
});
