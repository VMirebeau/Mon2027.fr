/**
 * Audit du contenu : équilibre des questions en base.
 *
 * Usage :
 *   npx tsx prisma/stats.ts          # ne compte que statut=publie
 *   npx tsx prisma/stats.ts --all    # toutes les questions, tous statuts
 *
 * Sortie console : répartition par statut, format, thème, sensibilité,
 * difficulté, et croisement format × thème pour repérer les déséquilibres.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FORMAT_SHORT: Record<string, string> = {
  vrai_faux: "V/F",
  estimation_numerique: "Estim",
  qcm: "QCM",
  ab: "A/B",
  classement: "Class",
  curseur_multi: "Curs",
  vraifaux_multi: "VFmul",
  categorisation: "Categ",
  pondere: "Pond",
};

function pct(n: number, total: number): string {
  if (total === 0) return "  0%";
  const p = (n / total) * 100;
  return `${p.toFixed(1).padStart(4)}%`;
}

function bar(n: number, total: number, width = 20): string {
  if (total === 0) return "";
  const filled = Math.round((n / total) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function printTable(title: string, rows: Array<[string, number]>, total: number) {
  console.log(`\n## ${title}\n`);
  const maxKey = Math.max(...rows.map(([k]) => k.length), 10);
  for (const [key, n] of rows) {
    console.log(
      `  ${key.padEnd(maxKey)}  ${String(n).padStart(4)}  ${pct(n, total)}  ${bar(n, total)}`,
    );
  }
  console.log(`  ${"TOTAL".padEnd(maxKey)}  ${String(total).padStart(4)}`);
}

async function main() {
  const all = process.argv.includes("--all");
  const where = all ? {} : { statut: "publie" };

  const questions = await prisma.question.findMany({
    where,
    select: {
      format: true,
      theme: true,
      statut: true,
      sensibilite: true,
      difficulte: true,
    },
  });

  const total = questions.length;
  console.log(`\n# Audit contenu — ${all ? "TOUTES" : "publiées uniquement"} (${total} questions)`);

  // Statut (toujours utile, même filtré : confirme le filtre)
  if (all) {
    const byStatut = new Map<string, number>();
    for (const q of questions) byStatut.set(q.statut, (byStatut.get(q.statut) ?? 0) + 1);
    printTable("Par statut", [...byStatut.entries()].sort((a, b) => b[1] - a[1]), total);
  }

  // Format (formats détectés dynamiquement)
  const byFormat = new Map<string, number>();
  for (const q of questions) byFormat.set(q.format, (byFormat.get(q.format) ?? 0) + 1);
  const FORMATS = [...byFormat.keys()].sort((a, b) => (byFormat.get(b) ?? 0) - (byFormat.get(a) ?? 0));
  printTable("Par format", [...byFormat.entries()].sort((a, b) => b[1] - a[1]), total);

  // Thème
  const byTheme = new Map<string, number>();
  for (const q of questions) byTheme.set(q.theme, (byTheme.get(q.theme) ?? 0) + 1);
  printTable("Par thème", [...byTheme.entries()].sort((a, b) => b[1] - a[1]), total);

  // Sensibilité
  const bySens = new Map<string, number>();
  for (const q of questions) bySens.set(q.sensibilite, (bySens.get(q.sensibilite) ?? 0) + 1);
  printTable(
    "Par sensibilité",
    [...bySens.entries()].sort((a, b) => b[1] - a[1]),
    total,
  );

  // Difficulté
  const byDiff = new Map<number, number>();
  for (let i = 1; i <= 5; i++) byDiff.set(i, 0);
  for (const q of questions) byDiff.set(q.difficulte, (byDiff.get(q.difficulte) ?? 0) + 1);
  printTable(
    "Par difficulté",
    [...byDiff.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [`★ ${k}`, v]),
    total,
  );

  // Croisement format × thème
  console.log(`\n## Croisement format × thème\n`);
  const themes = [...byTheme.keys()].sort();
  const matrix = new Map<string, Map<string, number>>();
  for (const t of themes) {
    matrix.set(t, new Map(FORMATS.map((f) => [f, 0])));
  }
  for (const q of questions) {
    const row = matrix.get(q.theme);
    if (row) row.set(q.format, (row.get(q.format) ?? 0) + 1);
  }

  const maxThemeLen = Math.max(...themes.map((t) => t.length), 6);
  const colWidth = 6;

  // Header
  let header = "  " + "Thème".padEnd(maxThemeLen);
  for (const f of FORMATS) header += (FORMAT_SHORT[f] ?? f).padStart(colWidth);
  header += "Total".padStart(colWidth);
  console.log(header);
  console.log("  " + "─".repeat(maxThemeLen + colWidth * (FORMATS.length + 1)));

  // Rows
  for (const t of themes) {
    let line = "  " + t.padEnd(maxThemeLen);
    const row = matrix.get(t)!;
    let rowTotal = 0;
    for (const f of FORMATS) {
      const n = row.get(f) ?? 0;
      rowTotal += n;
      line += (n === 0 ? "·" : String(n)).padStart(colWidth);
    }
    line += String(rowTotal).padStart(colWidth);
    console.log(line);
  }

  // Footer : total par format
  console.log("  " + "─".repeat(maxThemeLen + colWidth * (FORMATS.length + 1)));
  let footer = "  " + "TOTAL".padEnd(maxThemeLen);
  for (const f of FORMATS) {
    footer += String(byFormat.get(f) ?? 0).padStart(colWidth);
  }
  footer += String(total).padStart(colWidth);
  console.log(footer);

  // Hints de déséquilibre
  console.log(`\n## Signaux\n`);
  const hints: string[] = [];

  // Format dominant
  const formatEntries = [...byFormat.entries()].sort((a, b) => b[1] - a[1]);
  if (formatEntries.length > 0 && total > 0) {
    const [topF, topN] = formatEntries[0];
    if (topN / total > 0.45) {
      hints.push(`Format dominant : ${topF} pèse ${pct(topN, total).trim()} du total.`);
    }
  }

  // Thèmes mal couverts (< 3 questions)
  const thinThemes = [...byTheme.entries()].filter(([, n]) => n < 3);
  if (thinThemes.length > 0) {
    hints.push(
      `Thèmes avec < 3 questions : ${thinThemes.map(([t, n]) => `${t} (${n})`).join(", ")}.`,
    );
  }

  // Thèmes monoformat
  for (const t of themes) {
    const row = matrix.get(t)!;
    const used = [...row.entries()].filter(([, n]) => n > 0);
    const rowTotal = used.reduce((s, [, n]) => s + n, 0);
    if (rowTotal >= 5 && used.length === 1) {
      hints.push(`Thème monoformat : ${t} (${rowTotal} questions, toutes en ${used[0][0]}).`);
    }
  }

  // Absence de vrai_faux dans un thème significatif
  for (const t of themes) {
    const row = matrix.get(t)!;
    const rowTotal = [...row.values()].reduce((s, n) => s + n, 0);
    if (rowTotal >= 5 && (row.get("vrai_faux") ?? 0) === 0) {
      hints.push(`Pas de vrai/faux dans ${t} (${rowTotal} questions au total).`);
    }
  }

  if (hints.length === 0) {
    console.log("  (rien à signaler)");
  } else {
    for (const h of hints) console.log(`  • ${h}`);
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
