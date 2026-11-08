import { describe, it, expect } from "vitest";
import { bulkPublishMessage, draftBlocker, type DraftRow } from "./bulk-publish";

const draft: DraftRow = {
  customId: "Q-NUM-001",
  slug: null,
  theme: "Numérique & IA",
  sousTheme: null,
  format: "vrai_faux",
  statut: "brouillon",
  sensibilite: "standard",
  difficulte: 3,
  question: "La majorité des Français a déjà utilisé une IA générative.",
  precisions: null,
  explication: "C'est vrai. Selon le baromètre du numérique…",
  contextePedagogique: null,
  miseEnPerspective: null,
  indicators: null,
  unite: null,
  plageMin: null,
  plageMax: null,
  reponseNumerique: null,
  toleranceVerte: null,
  toleranceOrange: null,
  payload: JSON.stringify({ reponseCorrecte: true }),
  dateDonnee: 2025,
  auteur: "claude+alice",
  valideurs: null,
  sources: [{ nom: "Arcep, Baromètre du numérique", url: "https://www.arcep.fr/", type: "primaire", ordre: 0 }],
};

describe("draftBlocker", () => {
  it("accepte un brouillon complet et sourcé", () => {
    expect(draftBlocker(draft)).toBeNull();
  });

  it("refuse un brouillon sans source", () => {
    expect(draftBlocker({ ...draft, sources: [] })).toBe("aucune source");
  });

  it("refuse une réponse mal saisie, comme le formulaire", () => {
    expect(draftBlocker({ ...draft, payload: JSON.stringify({ reponseCorrecte: "oui" }) })).toMatch(/Vrai ou Faux/);
    expect(draftBlocker({ ...draft, payload: "{pas du json" })).toMatch(/JSON invalide/);
  });

  it("refuse une estimation sans réponse ni bornes, accepte une estimation complète", () => {
    const est = { ...draft, format: "estimation_numerique", payload: null, unite: "%" };
    expect(draftBlocker(est)).toMatch(/réponse correcte|bornes/);
    expect(draftBlocker({ ...est, reponseNumerique: 0, plageMin: 0, plageMax: 100 })).toBeNull();
  });

  it("refuse des indicateurs illisibles et une source au schéma dangereux", () => {
    expect(draftBlocker({ ...draft, indicators: "[pas du json" })).not.toBeNull();
    expect(
      draftBlocker({ ...draft, sources: [{ nom: "x", url: "javascript:alert(1)", type: "primaire", ordre: 0 }] }),
    ).not.toBeNull();
  });
});

describe("bulkPublishMessage", () => {
  it("résume publiés, bloqués et modifiés entre-temps", () => {
    const msg = bulkPublishMessage({
      published: 12,
      blocked: [{ label: "Q-INT-003", reason: "aucune source" }],
      changed: 1,
    });
    expect(msg).toContain("12 brouillons publiés");
    expect(msg).toContain("Q-INT-003 (aucune source)");
    expect(msg).toContain("1 question modifiée");
  });

  it("tronque une longue liste de brouillons bloqués", () => {
    const blocked = Array.from({ length: 8 }, (_, i) => ({ label: `Q-X-00${i}`, reason: "aucune source" }));
    expect(bulkPublishMessage({ published: 0, blocked, changed: 0 })).toContain("et 3 autres");
  });
});
