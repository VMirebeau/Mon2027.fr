import { describe, expect, it } from "vitest";
import { questionSchema } from "@/lib/schema";
import fixtures from "./__fixtures__/real-payloads.json";
import { issuesOf, MODELS, roundTrip, type Model, type PayloadFormat } from "./formats";
import { parsePayload } from "./shared";

/// Échantillon de payloads réels (base de dev du 2026-11-08) : quelques-uns
/// par format, plus tous les cas particuliers rencontrés (éléments de
/// classement en simple texte, `ordreCorrect`, champs inconnus, valeurs A/B
/// non numériques, ancien format de catégorisation).
type Fixture = { format: PayloadFormat; customId: string; payload: string };
const REAL = fixtures as Fixture[];

/// Ancien format de catégorisation (`items` + `categorieCorrecte`) : converti
/// volontairement, le player ne le lit pas.
const LEGACY = new Set(["Q-SAN-063", "Q-SAN-065"]);

const base = {
  theme: "Santé",
  question: "Question de test assez longue ?",
  explication: "Explication de test.",
  auteur: "test",
  sources: [],
};

describe("aller-retour sur des questions réelles", () => {
  it("couvre chaque format", () => {
    const formats = new Set(REAL.map((f) => f.format));
    expect([...formats].sort()).toEqual(Object.keys(MODELS).sort());
  });

  for (const f of REAL.filter((f) => !LEGACY.has(f.customId))) {
    it(`${f.format} ${f.customId} : ouvert puis enregistré sans modification, JSON identique`, () => {
      expect(roundTrip(f.format, f.payload)).toBe(f.payload);
    });
  }

  it("les payloads renvoyés passent la validation serveur", () => {
    for (const f of REAL) {
      const res = questionSchema.safeParse({ ...base, format: f.format, payload: roundTrip(f.format, f.payload) });
      expect(res.success, `${f.customId} : ${JSON.stringify(res.error?.issues)}`).toBe(true);
    }
  });

  it("aucune erreur signalée sur les questions réelles (hors ancien format)", () => {
    for (const f of REAL.filter((f) => !LEGACY.has(f.customId))) {
      const errors = issuesOf(f.format, f.payload).filter((i) => i.level === "error");
      expect(errors, f.customId).toEqual([]);
    }
  });

  it("relire le JSON produit redonne le même JSON (idempotent)", () => {
    for (const f of REAL) {
      const once = roundTrip(f.format, f.payload);
      expect(roundTrip(f.format, once)).toBe(once);
    }
  });

  it("ancien format de catégorisation : converti, mêmes identifiants, mêmes bonnes catégories", () => {
    for (const f of REAL.filter((f) => LEGACY.has(f.customId))) {
      const before = JSON.parse(f.payload);
      const after = JSON.parse(roundTrip("categorisation", f.payload));
      expect(after.items).toBeUndefined();
      expect(after.categories).toEqual(before.categories);
      expect(after.etiquettes.map((e: { id: string }) => e.id)).toEqual(before.items.map((e: { id: string }) => e.id));
      after.etiquettes.forEach((e: { categorie: number; texte: string }, i: number) => {
        expect(e.texte).toBe(before.items[i].texte);
        expect(after.categories[e.categorie].id).toBe(before.items[i].categorieCorrecte);
      });
    }
  });

  it("signale les vraies parts que le curseur du joueur ne peut pas atteindre (pas de 5)", () => {
    const f = REAL.find((x) => x.customId === "Q-ECO-006")!;
    const warnings = issuesOf("pondere", f.payload).filter((i) => i.level === "warning");
    expect(warnings.map((w) => w.message).join(" ")).toMatch(/multiple de 5/);
  });

  it("signale les valeurs A/B non numériques, que le jeu ignore", () => {
    const f = REAL.find((x) => x.customId === "Q-CLI-055")!;
    expect(issuesOf("ab", f.payload).map((i) => i.message).join(" ")).toMatch(/« ~10 % » n'est pas un nombre/);
  });

  it("garde les champs inconnus et les liste comme conservés", () => {
    const f = REAL.find((x) => x.customId === "Q-EDU-044")!;
    const m = MODELS.classement as Model<unknown>;
    expect(m.preserved(m.parse(parsePayload(f.payload).obj))).toEqual([
      "unite",
      "labelOrdre",
      "items[].position",
      "items[].valeur",
    ]);
  });
});
