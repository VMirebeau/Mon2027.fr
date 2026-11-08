import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/// Garde-fou éditorial : aucun tiret cadratin dans les textes de l'admin
/// (choix du 2026-11-08). Les commentaires ne comptent pas. Pour une valeur
/// vide, le demi-cadratin « – » ; dans une phrase, virgule, deux-points ou
/// parenthèses. Une expression régulière qui doit reconnaître le caractère
/// l'écrit en échappement (\u2014).
///
/// Jumeau : player/src/lib/typography-guard.test.ts.

const EM_DASH = "\u2014";
// Vitest tourne depuis la racine du paquet (player/ ou admin/).
const ROOT = process.cwd();
const DIRS = ["src"];
const CODE = /\.(ts|tsx|js|mjs|cjs|css)$/;
const TEXT = /\.(html|json|webmanifest|txt|svg)$/;
const MARKUP = /\.(html|svg)$/;

/// Remplace les commentaires par des espaces (les retours à la ligne restent,
/// pour garder les numéros de ligne). Chaînes et gabarits sont respectés ;
/// une URL « https:// » n'ouvre pas de commentaire.
function stripComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += src[i + 1] ?? "";
        i++;
      } else if (ch === quote || (ch === "\n" && quote !== "`")) {
        quote = null;
      }
      continue;
    }
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop - 1;
      continue;
    }
    if (src.startsWith("//", i) && src[i - 1] !== ":") {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      out += " ".repeat(stop - i);
      i = stop - 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    out += ch;
  }
  return out;
}

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__fixtures__") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (CODE.test(entry.name) || TEXT.test(entry.name)) yield path;
  }
}

function offenders(): string[] {
  const found: string[] = [];
  for (const dir of DIRS) {
    for (const path of files(join(ROOT, dir))) {
      const raw = readFileSync(path, "utf8");
      if (!raw.includes(EM_DASH)) continue;
      const text = CODE.test(path)
        ? stripComments(raw)
        : MARKUP.test(path)
          ? raw.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "))
          : raw;
      text.split("\n").forEach((line, i) => {
        if (line.includes(EM_DASH)) {
          found.push(`${relative(ROOT, path)}:${i + 1}: ${raw.split("\n")[i].trim()}`);
        }
      });
    }
  }
  return found;
}

describe("typographie", () => {
  it("aucun tiret cadratin dans les textes de l'admin", () => {
    expect(offenders()).toEqual([]);
  });

  it("le filtre ignore les commentaires mais pas les chaînes", () => {
    const src = [
      `// commentaire ${EM_DASH} ignoré`,
      `/* bloc ${EM_DASH} ignoré */`,
      `const url = "https://exemple.fr"; // fin ${EM_DASH} ignorée`,
      `const s = "texte ${EM_DASH} compté";`,
    ].join("\n");
    const lines = stripComments(src)
      .split("\n")
      .filter((l) => l.includes(EM_DASH));
    expect(lines).toEqual([`const s = "texte ${EM_DASH} compté";`]);
  });
});
