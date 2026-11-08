import { describe, it, expect } from "vitest";
import { questionSchema } from "./schema";

const baseValid = {
  theme: "Immigration",
  format: "estimation_numerique" as const,
  question: "Quel pourcentage de la population française est immigré ?",
  explication: "La part est stable autour de 10%.",
  auteur: "alice",
  plageMin: 0,
  plageMax: 50,
  reponseNumerique: 10.3,
  sources: [],
};

describe("questionSchema", () => {
  it("accepts a minimal valid estimation question", () => {
    const result = questionSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it("rejects an estimation question without numeric answer", () => {
    const { reponseNumerique: _, ...rest } = baseValid;
    void _;
    const result = questionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an estimation question without min/max range", () => {
    const { plageMin: _min, plageMax: _max, ...rest } = baseValid;
    void _min;
    void _max;
    const result = questionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires payload JSON for non-numeric formats", () => {
    const result = questionSchema.safeParse({
      ...baseValid,
      format: "qcm",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid JSON in payload", () => {
    const result = questionSchema.safeParse({
      ...baseValid,
      format: "qcm",
      payload: "not json",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid QCM payload", () => {
    const result = questionSchema.safeParse({
      ...baseValid,
      format: "qcm",
      payload: JSON.stringify({ choix: ["A", "B"], indexCorrect: 0 }),
    });
    expect(result.success).toBe(true);
  });

  it("validates source URLs", () => {
    const result = questionSchema.safeParse({
      ...baseValid,
      sources: [{ nom: "INSEE", url: "not-a-url", type: "primaire" }],
    });
    expect(result.success).toBe(false);
  });

  // Les champs numériques arrivent du formulaire comme chaînes ; vide ne
  // doit pas devenir 0 (Number("") === 0).
  it("une réponse correcte laissée vide est signalée, pas enregistrée comme 0", () => {
    const result = questionSchema.safeParse({ ...baseValid, reponseNumerique: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.path[0] === "reponseNumerique")?.message).toBe(
      "Indique la réponse correcte",
    );
  });

  it("une tolérance laissée vide reste vide (le player applique sa valeur par défaut)", () => {
    const result = questionSchema.safeParse({ ...baseValid, plageMin: "0", plageMax: "50", toleranceVerte: "" });
    expect(result.success).toBe(true);
    expect(result.data?.toleranceVerte).toBeUndefined();
    expect(result.data?.plageMin).toBe(0);
  });

  it("parle français aux contributeurs", () => {
    const qcm = questionSchema.safeParse({
      ...baseValid,
      format: "qcm",
      payload: JSON.stringify({ choix: ["Seul choix"], indexCorrect: 0 }),
    });
    expect(qcm.error?.issues[0].message).toBe("Il faut au moins 2 choix");
    const slug = questionSchema.safeParse({ ...baseValid, slug: "Pas Bon" });
    expect(slug.error?.issues[0].message).toMatch(/^Minuscules, chiffres et tirets/);
    const difficulte = questionSchema.safeParse({ ...baseValid, difficulte: "9" });
    expect(difficulte.error?.issues[0].message).toBe("La difficulté va de 1 à 5");
    const nombre = questionSchema.safeParse({ ...baseValid, plageMax: "beaucoup" });
    expect(nombre.error?.issues[0].message).toBe("Nombre attendu");
  });

  it("rejects customId with invalid characters", () => {
    const result = questionSchema.safeParse({
      ...baseValid,
      customId: "q-imm-001",
    });
    expect(result.success).toBe(false);
  });
});
