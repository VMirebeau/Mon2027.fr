import { useActionState } from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { submitWithoutReset } from "./submit-without-reset";

type Result = { ok: boolean } | null;

/// Action qui échoue toujours, comme un enregistrement refusé.
async function failingAction(): Promise<Result> {
  return { ok: false };
}

function Form({ preserve }: { preserve: boolean }) {
  const [state, formAction] = useActionState<Result, FormData>(failingAction, null);
  return (
    <form
      action={formAction}
      onSubmit={preserve ? submitWithoutReset(formAction) : undefined}
      data-testid="form"
    >
      <input name="question" defaultValue="version initiale" aria-label="question" />
      {state && <p>refusé</p>}
    </form>
  );
}

async function typeAndSubmit() {
  const input = screen.getByLabelText<HTMLInputElement>("question");
  await userEvent.clear(input);
  await userEvent.type(input, "mon travail");
  await act(async () => {
    fireEvent.submit(screen.getByTestId("form"));
  });
  await screen.findByText("refusé");
  return input;
}

describe("submitWithoutReset", () => {
  it("témoin : avec action= seul, React 19 remet les champs à leur valeur initiale même en cas d'échec", async () => {
    render(<Form preserve={false} />);
    const input = await typeAndSubmit();
    expect(input.value).toBe("version initiale");
  });

  it("garde la saisie quand l'action échoue", async () => {
    render(<Form preserve />);
    const input = await typeAndSubmit();
    expect(input.value).toBe("mon travail");
  });
});
