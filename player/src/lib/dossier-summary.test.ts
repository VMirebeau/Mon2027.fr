import { describe, expect, it } from "vitest";
import { dossierSummary, truncateAtWord } from "./dossier-summary";

const src = [{ name: "INSEE", url: "https://insee.fr", tag: "Source primaire" as const }];

describe("languette du dossier mobile", () => {
  it("dit ce qu'il y a dedans, chiffre en détail d'abord", () => {
    const s = dossierSummary({
      explain: "Le taux de pauvreté monétaire est de 14,4 %.",
      why: "Contexte",
      sources: src,
    });
    expect(s.label).toBe("Le chiffre en détail · sources");
    expect(s.excerpt).toBe("Le taux de pauvreté monétaire est de 14,4 %.");
  });

  it("retombe sur le contexte puis la mise en perspective", () => {
    expect(dossierSummary({ explain: " ", why: "Pourquoi", sources: [] })).toEqual({
      label: "Contexte",
      excerpt: "Pourquoi",
    });
    expect(
      dossierSummary({ explain: "", why: "", miseEnPerspective: "×2 depuis 1990", sources: src }).label,
    ).toBe("Mise en perspective · sources");
    expect(dossierSummary({ explain: "", why: "", sources: src })).toEqual({
      label: "Sources",
      excerpt: null,
    });
  });

  it("tronque au mot, avec une ellipse", () => {
    const long =
      "Un texte assez long pour être coupé proprement au dernier mot entier avant la limite fixée.";
    const out = truncateAtWord(long, 40);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("Un texte assez long pour être coupé…");
  });
});
