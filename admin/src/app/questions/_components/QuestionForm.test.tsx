import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionResult } from "@/lib/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DirtyProvider } from "./DirtyProvider";
import { QuestionForm } from "./QuestionForm";

beforeAll(() => {
  // jsdom n'implémente pas le défilement.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.clearAllMocks());

const initial = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  customId: "Q-TST-001",
  slug: "test",
  theme: "Santé",
  format: "estimation_numerique" as const,
  statut: "revue",
  sensibilite: "standard",
  difficulte: 3,
  question: "Question telle qu'enregistrée ?",
  explication: "Explication enregistrée.",
  plageMin: 0,
  plageMax: 50,
  reponseNumerique: 10,
  auteur: "alice",
  sources: [],
  ...over,
});

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

function setup(action: Action, version = "1") {
  const view = (props: { version: string; over?: Record<string, unknown> }) => (
    <DirtyProvider>
      <QuestionForm
        action={action}
        submitLabel="Enregistrer"
        baseVersion={props.version}
        initial={initial(props.over)}
      />
    </DirtyProvider>
  );
  const utils = render(view({ version }));
  return {
    rerender: (version: string, over?: Record<string, unknown>) => utils.rerender(view({ version, over })),
    question: () => screen.getByPlaceholderText<HTMLTextAreaElement>(/Quel pourcentage/),
    submit: async () => {
      await act(async () => {
        fireEvent.submit(utils.container.querySelector("form")!);
      });
    },
  };
}

describe("QuestionForm", () => {
  it("un enregistrement refusé garde la saisie et annonce les champs à corriger", async () => {
    const action = vi.fn<Action>(async () => ({
      ok: false,
      errors: { explication: "L'explication est requise" },
      message: "Le formulaire contient des erreurs",
    }));
    const f = setup(action);
    await userEvent.clear(f.question());
    await userEvent.type(f.question(), "Mon travail");
    await f.submit();
    expect(await screen.findByText(/Enregistrement impossible : 1 champ à corriger/)).toBeInTheDocument();
    expect(f.question().value).toBe("Mon travail");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("sans modification en cours, une nouvelle version serveur recharge le formulaire", async () => {
    const f = setup(vi.fn<Action>());
    f.rerender("2", { question: "Version publiée depuis le panneau ?", statut: "publie" });
    expect(f.question().value).toBe("Version publiée depuis le panneau ?");
  });

  it("avec des modifications en cours, garde la saisie et la base du verrou optimiste", async () => {
    const action = vi.fn<Action>(async () => ({ ok: false, message: "conflit" }));
    const f = setup(action);
    await userEvent.type(f.question(), " (modifiée)");
    f.rerender("2", { question: "Changement d'un autre contributeur ?" });
    expect(f.question().value).toBe("Question telle qu'enregistrée ? (modifiée)");
    await f.submit();
    expect(action.mock.calls[0][1].get("baseVersion")).toBe("1");
  });

  it("les listes déroulantes affichent des libellés humains, pas les valeurs techniques", () => {
    setup(vi.fn<Action>());
    expect(screen.getByRole("combobox", { name: "Type de question" })).toHaveTextContent("Estimation");
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("En revue");
    expect(screen.getByRole("combobox", { name: "Sensibilité" })).toHaveTextContent("Standard");
    expect(screen.getByRole("combobox", { name: "Difficulté" })).toHaveTextContent("3 · Moyen");
  });

  it("envoie les mêmes champs, aux mêmes valeurs, quelle que soit la mise en page", async () => {
    const action = vi.fn<Action>(async () => ({ ok: true, message: "Enregistré" }));
    const f = setup(action);
    await f.submit();
    const fd = action.mock.calls[0][1];
    expect([...new Set(fd.keys())].sort()).toEqual(
      [
        "baseVersion",
        "theme",
        "sousTheme",
        "customId",
        "slug",
        "format",
        "statut",
        "sensibilite",
        "difficulte",
        "question",
        "precisions",
        "explication",
        "contextePedagogique",
        "miseEnPerspective",
        "unite",
        "plageMin",
        "plageMax",
        "reponseNumerique",
        "toleranceVerte",
        "toleranceOrange",
        "sourcesJson",
        "indicatorsJson",
        "dateDonnee",
        "auteur",
      ].sort(),
    );
    expect(Object.fromEntries(["format", "statut", "sensibilite", "difficulte", "theme", "customId"].map((k) => [k, fd.get(k)]))).toEqual({
      format: "estimation_numerique",
      statut: "revue",
      sensibilite: "standard",
      difficulte: "3",
      theme: "Santé",
      customId: "Q-TST-001",
    });
  });

  it("une erreur dans les réglages avancés les déplie", async () => {
    const action = vi.fn<Action>(async () => ({ ok: false, errors: { slug: "Adresse déjà prise" } }));
    const f = setup(action);
    const details = screen.getByText("Réglages avancés").closest("details")!;
    expect(details.open).toBe(false);
    await f.submit();
    expect(details.open).toBe(true);
    expect(screen.getByText("Adresse déjà prise")).toBeVisible();
  });

  it("place Prévisualiser dans la barre d'actions, à l'intérieur du formulaire", () => {
    const { container } = render(
      <DirtyProvider>
        <QuestionForm action={vi.fn<Action>()} submitLabel="Créer la question" />
      </DirtyProvider>,
    );
    const form = container.querySelector("form")!;
    expect(form).toContainElement(screen.getByRole("button", { name: /Prévisualiser/ }));
    expect(form).toContainElement(screen.getByRole("button", { name: "Créer la question" }));
  });

  it("après son propre enregistrement, la base devient la version renvoyée, sans recharger", async () => {
    const action = vi
      .fn<Action>()
      .mockResolvedValueOnce({ ok: true, version: "2", message: "Enregistré" })
      .mockResolvedValueOnce({ ok: true, message: "Aucun changement" });
    const f = setup(action);
    await userEvent.type(f.question(), " v2");
    await f.submit();
    f.rerender("2", { question: "Question telle qu'enregistrée ? v2" });
    expect(screen.getAllByText("Enregistré").length).toBeGreaterThan(0);
    await f.submit();
    expect(action.mock.calls[1][1].get("baseVersion")).toBe("2");
  });
});
