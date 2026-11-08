// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canChangeIdentifiers,
  canDeleteQuestion,
  canEditQuestion,
  canManageAccount,
  canPublishDirectly,
  canValidateVersion,
  countingValidations,
  publicationBlocker,
  selectableStatuts,
} from "./roles";

describe("permissions sur les questions", () => {
  it("un contributeur ne touche pas aux questions publiées ou retirées", () => {
    expect(canEditQuestion("contributeur", "brouillon")).toBe(true);
    expect(canEditQuestion("contributeur", "revue")).toBe(true);
    expect(canEditQuestion("contributeur", "publie")).toBe(false);
    expect(canEditQuestion("contributeur", "retire")).toBe(false);
    expect(canEditQuestion("relecteur", "publie")).toBe(true);
  });

  it("un contributeur ne peut choisir que brouillon ou revue", () => {
    expect(selectableStatuts("contributeur")).toEqual(["brouillon", "revue"]);
    expect(selectableStatuts("relecteur")).toContain("publie");
  });

  it("suppression : admin hors questions publiées, superadmin partout", () => {
    expect(canDeleteQuestion("relecteur", "brouillon")).toBe(false);
    expect(canDeleteQuestion("admin", "brouillon")).toBe(true);
    expect(canDeleteQuestion("admin", "publie")).toBe(false);
    expect(canDeleteQuestion("superadmin", "publie")).toBe(true);
  });

  it("code et adresse courte figés dès qu'une question a été en ligne, sauf pour le superadmin", () => {
    expect(canChangeIdentifiers("contributeur", { statut: "brouillon" })).toBe(true);
    expect(canChangeIdentifiers("relecteur", { statut: "revue", datePublication: null })).toBe(true);
    expect(canChangeIdentifiers("relecteur", { statut: "publie" })).toBe(false);
    expect(canChangeIdentifiers("admin", { statut: "retire" })).toBe(false);
    // Publiée puis repassée en brouillon : des joueurs y ont peut-être répondu.
    expect(canChangeIdentifiers("admin", { statut: "brouillon", datePublication: new Date() })).toBe(false);
    expect(canChangeIdentifiers("superadmin", { statut: "publie" })).toBe(true);
  });

  it("seul le superadmin publie sans validation", () => {
    expect(canPublishDirectly("superadmin")).toBe(true);
    expect(canPublishDirectly("admin")).toBe(false);
  });
});

describe("gestion des comptes", () => {
  it("seul le superadmin gère les comptes", () => {
    expect(canManageAccount("superadmin", "relecteur")).toBe(true);
    expect(canManageAccount("admin", "contributeur")).toBe(false);
    expect(canManageAccount("admin", "relecteur")).toBe(false);
    expect(assignableRoles("admin")).toEqual([]);
    expect(assignableRoles("superadmin")).toEqual(["contributeur", "relecteur", "admin"]);
  });

  it("personne ne crée de superadmin depuis le web", () => {
    expect(assignableRoles("superadmin")).not.toContain("superadmin");
    expect(canManageAccount("superadmin", "admin")).toBe(true);
    expect(canManageAccount("superadmin", "superadmin")).toBe(false);
  });

  it("un relecteur n'accède pas à la gestion des comptes", () => {
    expect(assignableRoles("relecteur")).toEqual([]);
    expect(canManageAccount("relecteur", "contributeur")).toBe(false);
  });
});

describe("règle de publication : une validation d'un autre relecteur sur cette version", () => {
  const v = (contributorId: string, contentHash: string) => ({ contributorId, contentHash });

  it("bloque sans validation", () => {
    expect(publicationBlocker({ contentHash: "h1", lastContentAuthorId: "alice", validations: [] })).toMatch(
      /validée/,
    );
  });

  it("une validation d'un autre relecteur suffit", () => {
    expect(
      publicationBlocker({ contentHash: "h1", lastContentAuthorId: "alice", validations: [v("bob", "h1")] }),
    ).toBeNull();
  });

  it("l'auteur de la modification ne compte pas", () => {
    const args = { contentHash: "h1", lastContentAuthorId: "alice", validations: [v("alice", "h1")] };
    expect(publicationBlocker(args)).not.toBeNull();
    expect(countingValidations(args)).toEqual([]);
  });

  it("une validation devient caduque si le contenu change", () => {
    const msg = publicationBlocker({ contentHash: "h2", lastContentAuthorId: "alice", validations: [v("bob", "h1")] });
    expect(msg).toMatch(/a changé/);
  });

  it("après un import (auteur inconnu), toute validation de relecteur compte", () => {
    expect(
      publicationBlocker({ contentHash: "h1", lastContentAuthorId: null, validations: [v("bob", "h1")] }),
    ).toBeNull();
  });

  it("un relecteur ne valide pas son propre travail", () => {
    expect(canValidateVersion({ role: "relecteur", contributorId: "alice", lastContentAuthorId: "alice" })).toBe(false);
    expect(canValidateVersion({ role: "relecteur", contributorId: "bob", lastContentAuthorId: "alice" })).toBe(true);
    expect(canValidateVersion({ role: "contributeur", contributorId: "bob", lastContentAuthorId: "alice" })).toBe(false);
  });
});
