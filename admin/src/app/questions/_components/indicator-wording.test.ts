import { describe, expect, it } from "vitest";
import { polarityWording } from "./indicator-wording";

const S = "la précarité des plus modestes";

describe("polarityWording", () => {
  it("estimation : trop haut = sens de la polarité, trop bas = l'inverse", () => {
    const w = polarityWording("estimation_numerique", S);
    expect(w.prompt).toBe("Répondre trop haut, c'est…");
    expect(w.choice(1)).toBe(`surestimer ${S}`);
    expect(w.choice(-1)).toBe(`sous-estimer ${S}`);
    expect(w.summary(-1)).toBe(
      `Une estimation trop haute compte comme : sous-estimer ${S} ; trop basse, comme : surestimer ${S}. Plus l'écart est grand, plus elle pèse.`,
    );
  });

  it("vrai/faux, A/B, QCM : seule une erreur pèse, dans le sens choisi", () => {
    const vf = polarityWording("vrai_faux", S);
    expect(vf.prompt).toBe("Se tromper ici, c'est…");
    expect(vf.summary(-1)).toBe(
      `Une réponse fausse ici compte comme : sous-estimer ${S}. Une réponse juste compte comme : voir juste.`,
    );
    expect(polarityWording("qcm", S).summary(1)).toContain("Toutes les mauvaises réponses comptent pareil.");
    expect(polarityWording("ab", S).summary(1)).toContain(`compte comme : surestimer ${S}.`);
  });

  it("formats composés : chaque erreur pèse, quel que soit son sens", () => {
    expect(polarityWording("classement", S).summary(1)).toBe(
      `Ici, chaque élément mal placé compte comme : surestimer ${S}. Plus il y a d'erreurs, plus la réponse pèse.`,
    );
    expect(polarityWording("curseur_multi", S).summary(-1)).toContain("trop haut comme trop bas");
    for (const f of ["vraifaux_multi", "categorisation", "pondere"] as const) {
      expect(polarityWording(f, S).summary(1)).toMatch(/^Ici, chaque /);
    }
  });
});
