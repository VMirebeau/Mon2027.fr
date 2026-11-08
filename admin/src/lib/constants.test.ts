import { describe, expect, it } from "vitest";
import { INDICATORS } from "./constants";
// Source de vérité des indicateurs : le player (même dépôt, cf. CI).
import { INDICATORS as PLAYER_INDICATORS, INDICATOR_IDS } from "../../../player/src/lib/indicators";

describe("INDICATORS (copie admin)", () => {
  it("reprend à l'identique les axes du player : ordre, libellé, sujet, définition", () => {
    expect(INDICATORS.map((i) => i.value)).toEqual(INDICATOR_IDS);
    for (const i of INDICATORS) {
      const p = PLAYER_INDICATORS[i.value];
      expect({ label: i.label, subject: i.subject, description: i.description }).toEqual({
        label: p.label,
        subject: p.subjectShort,
        description: p.definitionPlus1,
      });
    }
  });
});
