// @vitest-environment node
import { describe, expect, it } from "vitest";
import { indicatorsError, sourceErrors, unplacedErrors } from "./form-errors";

describe("erreurs du formulaire de question", () => {
  it("range les erreurs de sources par ligne et par champ", () => {
    expect(
      sourceErrors({
        "sources.0.url": "URL invalide",
        "sources.2.nom": "Nom requis",
        "sources.2.url": "URL invalide",
        "sources.1.ordre": "Ordre invalide",
        question: "Question requise",
      }),
    ).toEqual({
      0: { url: "URL invalide" },
      1: { ligne: "Ordre invalide" },
      2: { nom: "Nom requis", url: "URL invalide" },
    });
  });

  it("retrouve une erreur d'indicateur, quelle que soit sa profondeur", () => {
    expect(indicatorsError({ "indicators.1.id": "Indicateur inconnu" })).toBe("Indicateur inconnu");
    expect(indicatorsError({ question: "x" })).toBeUndefined();
  });

  it("signale les erreurs qui n'ont pas de champ visible pour le format affiché", () => {
    const errors = { question: "a", payload: "b", reponseNumerique: "c", "sources.0.url": "d", valideurs: "e" };
    expect(unplacedErrors(errors, "estimation_numerique")).toEqual([
      ["payload", "b"],
      ["valideurs", "e"],
    ]);
    expect(unplacedErrors(errors, "qcm")).toEqual([
      ["reponseNumerique", "c"],
      ["valideurs", "e"],
    ]);
  });
});
