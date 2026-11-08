import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PayloadEditor } from "../PayloadEditor";
import fixtures from "./__fixtures__/real-payloads.json";
import type { PayloadFormat } from "./formats";

type Fixture = { format: PayloadFormat; customId: string; payload: string };
const REAL = fixtures as Fixture[];
/// Ancien format de catégorisation, converti volontairement (cf. roundtrip.test).
const LEGACY = new Set(["Q-SAN-063", "Q-SAN-065"]);

function setup(format: PayloadFormat, initial: string | null) {
  const utils = render(
    <form>
      <PayloadEditor format={format} initial={initial} />
    </form>,
  );
  const hidden = () => utils.container.querySelector<HTMLInputElement>('input[name="payload"]')!;
  return { ...utils, hidden, payload: () => JSON.parse(hidden().value) };
}

describe("PayloadEditor", () => {
  it("chaque format : un seul champ envoyé, caché, identique au JSON enregistré, et aucun JSON à saisir", () => {
    for (const f of REAL.filter((x) => !LEGACY.has(x.customId))) {
      const { container, hidden, unmount } = setup(f.format, f.payload);
      const sent = container.querySelectorAll("[name]");
      expect(sent).toHaveLength(1);
      expect(hidden().type).toBe("hidden");
      expect(hidden().value).toBe(f.payload);
      // Le JSON n'apparaît que dans le bloc replié, en lecture seule.
      expect(container.querySelectorAll("textarea[name], [contenteditable]")).toHaveLength(0);
      expect(within(container).getByText("Voir le format technique").closest("details")?.open).toBe(false);
      unmount();
    }
  });

  it("chaque champ a un libellé associé", () => {
    for (const f of REAL) {
      const { container, unmount } = setup(f.format, f.payload);
      for (const el of container.querySelectorAll<HTMLElement>("input:not([type=hidden]), textarea, select")) {
        expect(el.id, `${f.customId} ${el.outerHTML.slice(0, 80)}`).not.toBe("");
        expect(container.querySelector(`label[for="${el.id}"]`), `${f.customId} ${el.id}`).not.toBeNull();
      }
      unmount();
    }
  });

  it("catégorisation : changer la bonne catégorie met à jour l'index envoyé", async () => {
    const user = userEvent.setup();
    const P =
      '{"categories":[{"id":"yes","label":"Oui"},{"id":"no","label":"Non"}],"etiquettes":[{"id":"a","texte":"A","categorie":0},{"id":"b","texte":"B","categorie":1}]}';
    const { payload } = setup("categorisation", P);
    const selects = screen.getAllByLabelText("Bonne catégorie");
    await user.selectOptions(selects[0], "Non");
    expect(payload().etiquettes[0]).toEqual({ id: "a", texte: "A", categorie: 1 });
  });

  it("répartir des points : le compteur suit la somme", async () => {
    const user = userEvent.setup();
    const P = '{"total":100,"step":5,"parts":[{"id":"a","label":"A","valeur":60},{"id":"b","label":"B","valeur":40}]}';
    const { payload } = setup("pondere", P);
    expect(screen.getByText(/le compte est bon/)).toBeInTheDocument();
    const field = screen.getAllByLabelText("Vraie part (sur 100)")[1];
    await user.clear(field);
    await user.type(field, "35");
    expect(screen.getByText("Somme des vraies parts : 95 / 100")).toBeInTheDocument();
    expect(screen.getByText(/il manque 5/)).toBeInTheDocument();
    expect(payload().parts[1]).toEqual({ id: "b", label: "B", valeur: 35 });
  });

  it("monter un élément au clavier : l'ordre change, les identifiants suivent, le focus reste sur l'élément", async () => {
    const user = userEvent.setup();
    const P = '{"affirmations":[{"id":"s1","texte":"A","vrai":true},{"id":"s2","texte":"B","vrai":false}]}';
    const { payload } = setup("vraifaux_multi", P);
    const up = screen.getByRole("button", { name: "Monter : Affirmation 2" });
    up.focus();
    await user.keyboard("{Enter}");
    expect(payload().affirmations.map((a: { id: string }) => a.id)).toEqual(["s2", "s1"]);
    // Monté en tête, son bouton « Monter » est désactivé : le focus passe à « Descendre ».
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Descendre : Affirmation 1" }));
  });

  it("ajouter un élément place le curseur dans son premier champ", async () => {
    const user = userEvent.setup();
    setup("classement", '{"items":["A","B","C"]}');
    await user.click(screen.getByRole("button", { name: /Ajouter un élément/ }));
    const fields = screen.getAllByLabelText("Élément");
    expect(fields).toHaveLength(4);
    expect(document.activeElement).toBe(fields[3]);
  });

  it("vrai/faux multiple : boutons bascule avec état annoncé", async () => {
    const user = userEvent.setup();
    const { payload } = setup("vraifaux_multi", null);
    const groups = screen.getAllByRole("group", { name: "Réponse" });
    expect(groups).toHaveLength(4);
    const faux = within(groups[0]).getByRole("button", { name: "Faux" });
    expect(faux).toHaveAttribute("aria-pressed", "false");
    await user.click(faux);
    expect(faux).toHaveAttribute("aria-pressed", "true");
    expect(payload().affirmations[0]).toEqual({ id: "s1", texte: "", vrai: false });
  });

  it("nouvelle question : pas d'erreurs rouges avant d'avoir touché un champ, puis affichées", async () => {
    const user = userEvent.setup();
    setup("curseur_multi", null);
    expect(screen.queryByText("Écris le texte de l'étiquette.")).toBeNull();
    const label = screen.getAllByLabelText("Texte de l'étiquette")[0];
    await user.click(label);
    await user.tab();
    expect(screen.getByText("Écris le texte de l'étiquette.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Les afficher" }));
    expect(screen.getAllByText("Écris le texte de l'étiquette.")).toHaveLength(4);
  });

  it("une tentative d'enregistrement révèle tout ce qui manque", () => {
    const { container } = setup("pondere", null);
    expect(screen.queryByText("Indique sa vraie part.")).toBeNull();
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getAllByText("Indique sa vraie part.")).toHaveLength(3);
  });

  it("placer sur une échelle : la ligne d'aide nomme les repères", () => {
    const P =
      '{"echelle":{"min":0,"max":50,"unite":""},"items":[{"id":"dk","label":"Danemark","valeur":27},{"id":"fr","label":"France","valeur":32},{"id":"us","label":"USA","valeur":41},{"id":"de","label":"Allemagne","valeur":30}]}';
    setup("curseur_multi", P);
    expect(screen.getByText(/Posée d'office comme repère/).textContent).toContain("« France »");
  });

  it("ancien format de catégorisation : prévenu, et le JSON envoyé est au format actuel", () => {
    const f = REAL.find((x) => x.customId === "Q-SAN-063")!;
    const { payload } = setup("categorisation", f.payload);
    expect(screen.getByText(/ancien format que le jeu ne lit pas/)).toBeInTheDocument();
    expect(payload().etiquettes).toHaveLength(JSON.parse(f.payload).items.length);
  });
});
