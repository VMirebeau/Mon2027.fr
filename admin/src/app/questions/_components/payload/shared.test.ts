import { describe, expect, it } from "vitest";
import { newId, OMIT, outNum, outText, parseNumber, parsePayload, rebuild } from "./shared";

describe("parseNumber", () => {
  it("lit les nombres saisis à la française", () => {
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(" 12.5 ")).toBe(12.5);
    expect(parseNumber("1 000")).toBe(1000);
    expect(parseNumber("1 000")).toBe(1000);
    expect(parseNumber("-3")).toBe(-3);
  });
  it("refuse le vide et le texte", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("  ")).toBeNull();
    expect(parseNumber("~10 %")).toBeNull();
    expect(parseNumber("0x10")).toBeNull();
    expect(parseNumber("12 €")).toBeNull();
  });
});

describe("parsePayload", () => {
  it("distingue vide, objet et illisible", () => {
    expect(parsePayload(null).status).toBe("empty");
    expect(parsePayload("  ").status).toBe("empty");
    expect(parsePayload('{"a":1}').status).toBe("ok");
    expect(parsePayload("[1,2]").status).toBe("invalid");
    expect(parsePayload("{oups").status).toBe("invalid");
  });
});

describe("rebuild", () => {
  it("garde l'ordre d'origine, recopie l'inconnu, retire OMIT, ajoute le nouveau à la fin", () => {
    const orig = { z: 1, a: 2, inconnu: { x: 1 }, b: 3 };
    const out = rebuild(orig, [
      ["b", 30],
      ["a", OMIT],
      ["c", 4],
      ["z", 10],
    ]);
    expect(JSON.stringify(out)).toBe('{"z":10,"inconnu":{"x":1},"b":30,"c":4}');
  });
  it("ne transforme pas une clé __proto__ en prototype", () => {
    const orig = JSON.parse('{"__proto__":{"x":1},"a":1}');
    const out = rebuild(orig, [["a", 2]]);
    expect(JSON.stringify(out)).toBe('{"__proto__":{"x":1},"a":2}');
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});

describe("champs inchangés", () => {
  it("un texte inchangé reprend la valeur d'origine, même si ce n'est pas une chaîne", () => {
    expect(outText("12", "12", { label: 12 }, "label", false)).toBe(12);
    expect(outText("", "", {}, "why", true)).toBe(OMIT);
    expect(outText("", "", { why: "" }, "why", true)).toBe("");
  });
  it("un texte modifié est nettoyé ; vidé, un champ facultatif disparaît", () => {
    expect(outText(" Nouveau ", "Ancien", { label: "Ancien" }, "label", false)).toBe("Nouveau");
    expect(outText("  ", "Ancien", { why: "Ancien" }, "why", true)).toBe(OMIT);
    expect(outText("", "Ancien", { label: "Ancien" }, "label", false)).toBe("");
  });
  it("un nombre inchangé garde son type d'origine, un nombre modifié est converti", () => {
    expect(outNum("12", "12", { valeur: "12" }, "valeur")).toBe("12");
    expect(outNum("12,5", "12", { valeur: 12 }, "valeur")).toBe(12.5);
    expect(outNum("abc", "12", { valeur: 12 }, "valeur")).toBe(OMIT);
  });
});

describe("newId", () => {
  it("évite les identifiants déjà vus", () => {
    const seq = ["aaaaa", "aaaaa", "bbbbb"];
    const rand = () => seq.shift()!;
    expect(newId("s", new Set(["s-aaaaa"]), rand)).toBe("s-bbbbb");
  });
  it("tire des identifiants différents", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(newId("e", ids));
    expect(ids.size).toBe(200);
  });
});
