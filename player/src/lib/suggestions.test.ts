import { describe, expect, it } from "vitest";
import { parseSuggestion } from "./suggestions";

const base = { kind: "erreur", questionId: "Q-IMM-001", message: "Le chiffre date de 2019, l'Insee a publié 2023." };

describe("propositions des joueurs", () => {
  it("accepte une proposition valide et nettoie le message", () => {
    const r = parseSuggestion({ ...base, message: "  Le chiffre\u0007 est faux depuis 2023.  ", sourceUrl: "https://insee.fr/x" });
    expect(r).toEqual({
      ok: true,
      data: { kind: "erreur", questionCustomId: "Q-IMM-001", message: "Le chiffre est faux depuis 2023.", sourceUrl: "https://insee.fr/x" },
    });
  });

  it("piège à robots : refus silencieux", () => {
    expect(parseSuggestion({ ...base, website: "http://spam" })).toMatchObject({ ok: false, honeypot: true });
  });

  it("exige la question pour une erreur, une source ou une formulation", () => {
    expect(parseSuggestion({ ...base, questionId: undefined })).toMatchObject({ ok: false });
    expect(parseSuggestion({ kind: "nouvelle_question", message: "Combien de logements vacants en France ?" })).toMatchObject({
      ok: true,
      data: { questionCustomId: null },
    });
  });

  it("ignore la question pour une nouvelle question", () => {
    const r = parseSuggestion({ kind: "nouvelle_question", questionId: "Q-IMM-001", message: "Une idée de question assez longue." });
    expect(r).toMatchObject({ ok: true, data: { questionCustomId: null } });
  });

  it("refuse types inconnus, messages trop courts ou trop longs", () => {
    expect(parseSuggestion({ ...base, kind: "pub" })).toMatchObject({ ok: false });
    expect(parseSuggestion({ ...base, message: "court" })).toMatchObject({ ok: false });
    expect(parseSuggestion({ ...base, message: "x".repeat(2001) })).toMatchObject({ ok: false });
    expect(parseSuggestion(null)).toMatchObject({ ok: false });
  });

  it("refuse les identifiants de question et les liens douteux", () => {
    expect(parseSuggestion({ ...base, questionId: "../../etc" })).toMatchObject({ ok: false });
    expect(parseSuggestion({ ...base, sourceUrl: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect(parseSuggestion({ ...base, sourceUrl: "pas une url" })).toMatchObject({ ok: false });
    expect(parseSuggestion({ ...base, sourceUrl: "" })).toMatchObject({ ok: true, data: { sourceUrl: null } });
  });
});
