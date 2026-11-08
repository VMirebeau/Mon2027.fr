// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  awaitsValidation,
  latestContentAuthors,
  publishedBeforeValidations,
  publishMetaFrom,
  versionValidation,
} from "./validation-status";

const at = (iso: string) => new Date(iso);
const v = (contributorId: string, contentHash: string, contributorName = contributorId) => ({
  contributorId,
  contentHash,
  contributorName,
  createdAt: at("2026-11-07T10:00:00Z"),
});

describe("versionValidation", () => {
  it("validée : une validation d'un tiers sur la version actuelle", () => {
    expect(
      versionValidation({ contentHash: "h2", lastContentAuthorId: "alice", validations: [v("bob", "h2", "Bob")] }),
    ).toEqual({ kind: "validee", validators: ["Bob"] });
  });

  it("caduque : validations sur une version précédente seulement", () => {
    expect(
      versionValidation({ contentHash: "h2", lastContentAuthorId: "alice", validations: [v("bob", "h1")] }),
    ).toEqual({ kind: "caduque" });
  });

  it("caduque aussi quand la seule validation vient de l'auteur de la dernière modification", () => {
    expect(
      versionValidation({ contentHash: "h1", lastContentAuthorId: "bob", validations: [v("bob", "h1")] }),
    ).toEqual({ kind: "caduque" });
  });

  it("aucune : jamais validée", () => {
    expect(versionValidation({ contentHash: "h1", lastContentAuthorId: null, validations: [] })).toEqual({
      kind: "aucune",
    });
  });
});

describe("file « À valider »", () => {
  it("contient les questions en revue sans validation qui compte", () => {
    expect(awaitsValidation("revue", { kind: "aucune" })).toBe(true);
    expect(awaitsValidation("revue", { kind: "caduque" })).toBe(true);
  });

  it("exclut les questions validées (il reste à publier) et celles hors revue", () => {
    expect(awaitsValidation("revue", { kind: "validee", validators: ["Bob"] })).toBe(false);
    expect(awaitsValidation("brouillon", { kind: "aucune" })).toBe(false);
    expect(awaitsValidation("publie", { kind: "aucune" })).toBe(false);
  });
});

describe("latestContentAuthors", () => {
  it("retient la dernière révision de contenu par question, quel que soit l'ordre reçu", () => {
    const authors = latestContentAuthors([
      { questionId: "q1", contributorId: "bob", kind: "modification", createdAt: at("2026-11-07T12:00:00Z") },
      { questionId: "q1", contributorId: "alice", kind: "creation", createdAt: at("2026-11-07T09:00:00Z") },
      // Changement de statut postérieur : n'est pas une modification du contenu.
      { questionId: "q1", contributorId: "carol", kind: "statut", createdAt: at("2026-11-07T13:00:00Z") },
      { questionId: "q2", contributorId: null, kind: "import", createdAt: at("2026-11-07T08:00:00Z") },
    ]);
    expect(authors.get("q1")).toBe("bob");
    expect(authors.get("q2")).toBeNull();
    expect(authors.has("q3")).toBe(false);
  });
});

describe("publishedBeforeValidations", () => {
  it("publiée sans validation ni révision d'un contributeur : antérieure aux validations", () => {
    expect(publishedBeforeValidations({ statut: "publie", validationsCount: 0, contributorRevisionsCount: 0 })).toBe(
      true,
    );
  });

  it("pas si elle a été validée, modifiée par un contributeur, ou n'est pas publiée", () => {
    expect(publishedBeforeValidations({ statut: "publie", validationsCount: 1, contributorRevisionsCount: 0 })).toBe(
      false,
    );
    expect(publishedBeforeValidations({ statut: "publie", validationsCount: 0, contributorRevisionsCount: 2 })).toBe(
      false,
    );
    expect(publishedBeforeValidations({ statut: "revue", validationsCount: 0, contributorRevisionsCount: 0 })).toBe(
      false,
    );
  });
});

describe("publishMetaFrom", () => {
  const now = at("2026-11-07T15:00:00Z");

  it("valideurs = relecteurs dont la validation compte ; date de validation = la plus récente", () => {
    const meta = publishMetaFrom({
      counted: [{ createdAt: at("2026-11-07T10:00:00Z") }, { createdAt: at("2026-11-07T11:00:00Z") }],
      validatorNames: ["Bob", "Carol"],
      publisherName: "Dave",
      now,
    });
    expect(JSON.parse(meta.valideurs)).toEqual(["Bob", "Carol"]);
    expect(meta.dateValidation).toEqual(at("2026-11-07T11:00:00Z"));
    expect(meta.datePublication).toEqual(now);
  });

  it("publication directe (superadmin, sans validation) : il en est le garant", () => {
    const meta = publishMetaFrom({ counted: [], validatorNames: [], publisherName: "Alice", now });
    expect(JSON.parse(meta.valideurs)).toEqual(["Alice"]);
    expect(meta.dateValidation).toEqual(now);
  });
});
