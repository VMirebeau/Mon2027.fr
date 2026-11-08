import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmDashNotice } from "./EmDashNotice";

const DASH = "\u2014";

describe("EmDashNotice", () => {
  it("signale les champs qui contiennent un tiret cadratin", async () => {
    render(
      <form>
        <textarea name="question" defaultValue="Une question propre" />
        <textarea name="explication" defaultValue={`Un chiffre ${DASH} une précision.`} />
        <input type="hidden" name="sourcesJson" value={`[{"nom":"INSEE ${DASH} Titre"}]`} readOnly />
        <EmDashNotice />
      </form>,
    );
    const notice = await screen.findByRole("button", { name: /Tiret cadratin/ });
    expect(notice.textContent).toContain("Explication, Sources");
    expect(notice.textContent).not.toContain("Question");
  });

  it("disparaît quand le tiret est corrigé", async () => {
    render(
      <form>
        <textarea name="explication" defaultValue={`A ${DASH} B`} />
        <EmDashNotice />
      </form>,
    );
    await screen.findByRole("button", { name: /Tiret cadratin/ });
    const field = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.input(field, { target: { value: "A : B" } });
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByRole("button", { name: /Tiret cadratin/ })).toBeNull();
  });
});
