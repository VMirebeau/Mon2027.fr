import { describe, expect, it } from "vitest";
import { resolveActiveSession } from "./active-session";
import { initialSceneFor } from "@/components/app-shell/helpers";
import type { Question } from "./types";

/// Reprise de session après reload : une question retirée du catalogue (ou
/// dont le slug a changé) ne doit jamais faire basculer la scène game sur
/// tout le catalogue publié.

const mkQ = (id: string, slug: string): Question =>
  ({ id, slug, question: `Question ${id}` }) as unknown as Question;

const catalogue = [mkQ("a", "alpha"), mkQ("b", "beta"), mkQ("c", "gamma")];

describe("resolveActiveSession", () => {
  it("résout les slugs dans l'ordre de la session", () => {
    const r = resolveActiveSession(
      { slugs: ["gamma", "alpha"], idx: 1, answers: [true, null] },
      catalogue,
    );
    expect(r?.questions.map((q) => q.id)).toEqual(["c", "a"]);
    expect(r?.idx).toBe(1);
  });

  it("abandonne si un seul slug ne résout plus", () => {
    const r = resolveActiveSession(
      { slugs: ["alpha", "retiree", "gamma"], idx: 2, answers: [1, 2, null] },
      catalogue,
    );
    expect(r).toBeNull();
  });

  it("abandonne si réponses et slugs ne sont plus alignés", () => {
    const r = resolveActiveSession(
      { slugs: ["alpha", "beta"], idx: 0, answers: [null] },
      catalogue,
    );
    expect(r).toBeNull();
  });

  it("abandonne une session vide", () => {
    expect(resolveActiveSession({ slugs: [], idx: 0, answers: [] }, catalogue)).toBeNull();
  });

  it("borne l'index à la plage valide", () => {
    const hi = resolveActiveSession(
      { slugs: ["alpha", "beta"], idx: 9, answers: [null, null] },
      catalogue,
    );
    expect(hi?.idx).toBe(1);
    const lo = resolveActiveSession(
      { slugs: ["alpha", "beta"], idx: -3, answers: [null, null] },
      catalogue,
    );
    expect(lo?.idx).toBe(0);
  });
});

describe("initialSceneFor", () => {
  it("lance la partie quand une session est jouable", () => {
    expect(initialSceneFor("game", true)).toBe("game");
    expect(initialSceneFor(null, true)).toBe("game");
  });

  it("?s=game sans session jouable retombe sur l'accueil", () => {
    expect(initialSceneFor("game", false)).toBe("home");
  });

  it("respecte les autres scènes valides", () => {
    expect(initialSceneFor("stats", false)).toBe("stats");
  });

  it("sans paramètre ou paramètre inconnu : onboarding", () => {
    expect(initialSceneFor(null, false)).toBe("onboarding");
    expect(initialSceneFor("nimporte", false)).toBe("onboarding");
  });
});
