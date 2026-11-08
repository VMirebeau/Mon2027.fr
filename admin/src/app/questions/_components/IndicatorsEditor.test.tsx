import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndicatorsEditor } from "./IndicatorsEditor";

const hiddenValue = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[name="indicatorsJson"]')!.value;

describe("IndicatorsEditor", () => {
  it("formule le sens selon le format et envoie toujours [{ id, polarity }]", async () => {
    const { container } = render(
      <IndicatorsEditor format="vrai_faux" initial={[{ id: "sante", polarity: -1 }]} />,
    );
    expect(screen.getByText("Se tromper ici, c'est…")).toBeInTheDocument();
    expect(
      screen.getByText(/Une réponse fausse ici compte comme : sous-estimer les tensions sur le système de santé\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Axe" })).toHaveTextContent("Santé");

    const group = screen.getByRole("radiogroup", { name: "Se tromper ici, c'est…" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /sous-estimer/ })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByText("surestimer les tensions sur le système de santé"));
    expect(hiddenValue(container)).toBe('[{"id":"sante","polarity":1}]');
    expect(screen.getByRole("radio", { name: /^surestimer/ })).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(/Une réponse fausse ici compte comme : surestimer les tensions sur le système de santé\./),
    ).toBeInTheDocument();
  });

  it("pour une estimation, parle de réponse trop haute", () => {
    render(<IndicatorsEditor format="estimation_numerique" initial={[{ id: "precarite", polarity: 1 }]} />);
    expect(screen.getByText("Répondre trop haut, c'est…")).toBeInTheDocument();
    expect(
      screen.getByText(/Une estimation trop haute compte comme : surestimer la précarité des plus modestes ; trop basse/),
    ).toBeInTheDocument();
  });

  it("n'ajoute aucun champ au formulaire en dehors de indicatorsJson", () => {
    const { container } = render(
      <form>
        <IndicatorsEditor format="qcm" initial={[{ id: "ecole", polarity: 1 }]} />
      </form>,
    );
    const names = [...new FormData(container.querySelector("form")!).keys()];
    expect(names).toEqual(["indicatorsJson"]);
  });
});
