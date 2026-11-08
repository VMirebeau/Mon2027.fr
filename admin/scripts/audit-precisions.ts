/**
 * Audit : pour chaque question estimation_numerique, vérifier que `precisions`
 * fournit un repère permettant au joueur de calibrer son estimation.
 *
 * Lecture éditoriale : le besoin d'ancre dépend de l'UNITÉ.
 *   - Unité concrète (homicides, personnes, communes, %…) :
 *     le joueur connaît le concept et doit estimer la magnitude — c'est le jeu.
 *     Pas besoin d'ancre supplémentaire dans `precisions`.
 *   - Unité abstraite (points PISA, indice, écart-type, multiplicateur…) :
 *     le joueur n'a aucune référence intuitive. `precisions` doit donner un
 *     repère chiffré ou une équivalence concrète.
 *   - Questions formulées « sur 100 X » : le X dans la question CALIBRE
 *     elle-même → pas besoin de repère dans `precisions`.
 *
 * Sortie :
 *   1. Liste des unités distinctes utilisées (à scanner pour repérer
 *      les abstractions).
 *   2. Questions sans repère détecté.
 *   3. Questions à formulation auto-calibrante (« sur 100 », « sur N ») :
 *      écartées des candidats.
 *
 * Usage : DATABASE_URL=file:./dev.db npx tsx scripts/audit-precisions.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ANCHOR_KEYWORDS = [
  "moyenne",
  "médiane",
  "moyen",
  "équivaut",
  "équivalent",
  "échelle",
  "sur 100",
  "sur 10",
  "indice",
  "ratio",
  "repère",
  "comparaison",
  "ordre de grandeur",
];

/** Détecte les formulations « Sur 100 X » / « Sur N kilos » / etc. dans la
 *  question elle-même : la question pose alors son propre dénominateur,
 *  donc le joueur a déjà sa calibration. */
function selfCalibratedQuestion(question: string): boolean {
  return /\bsur\s+\d+/i.test(question);
}

function hasAnchor(precisions: string | null | undefined): boolean {
  if (!precisions) return false;
  if (/\d/.test(precisions)) return true;
  const lower = precisions.toLowerCase();
  return ANCHOR_KEYWORDS.some((kw) => lower.includes(kw));
}

async function main() {
  const rows = await prisma.question.findMany({
    where: { format: "estimation_numerique" },
    orderBy: [{ theme: "asc" }, { customId: "asc" }],
    select: {
      customId: true,
      theme: true,
      statut: true,
      question: true,
      precisions: true,
      unite: true,
      plageMin: true,
      plageMax: true,
      reponseNumerique: true,
    },
  });

  // 1) Recensement des unités distinctes
  const byUnit = new Map<string, number>();
  for (const r of rows) {
    const u = (r.unite ?? "(aucune)").trim() || "(aucune)";
    byUnit.set(u, (byUnit.get(u) ?? 0) + 1);
  }
  const units = [...byUnit.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n=== UNITÉS utilisées (${units.length}) — fréq décroissante ===\n`);
  for (const [u, n] of units) {
    console.log(`  ${String(n).padStart(3)}× ${u}`);
  }

  // 2) Tri : auto-calibrées / avec repère / sans repère
  const selfCal: typeof rows = [];
  const withAnchor: typeof rows = [];
  const flagged: typeof rows = [];

  for (const r of rows) {
    if (selfCalibratedQuestion(r.question)) {
      selfCal.push(r);
    } else if (hasAnchor(r.precisions)) {
      withAnchor.push(r);
    } else {
      flagged.push(r);
    }
  }

  console.log(`\n=== AUDIT ===`);
  console.log(`Total estimation_numerique : ${rows.length}`);
  console.log(`Auto-calibrées (« sur N … » dans la question) : ${selfCal.length}`);
  console.log(`Avec repère détecté dans precisions : ${withAnchor.length}`);
  console.log(`⚠ Sans repère détecté : ${flagged.length}`);

  if (flagged.length > 0) {
    console.log(`\n--- ⚠ Questions à relire à la main ---\n`);
    for (const r of flagged) {
      const range = `[${r.plageMin}, ${r.plageMax}]`;
      const status = r.statut === "publie" ? "📢" : "📝";
      console.log(`${r.customId}  ${status}  ${r.theme}  unité=« ${r.unite ?? "?"} »  ${range}  →  ${r.reponseNumerique}`);
      console.log(`  Q: ${r.question}`);
      console.log(`  P: ${r.precisions ?? "(VIDE)"}`);
      console.log("");
    }
  }

  // 3) Focus unités abstraites : ces unités n'ont pas de référence intuitive,
  //    donc même si l'audit ci-dessus marque la question OK (parce que
  //    `precisions` contient un chiffre), le rédacteur doit s'assurer que
  //    l'ancrage est vraiment calibrant et pas juste de la source.
  const ABSTRACT_UNITS = ["points", "rang", "× plus", "× plus chers", "indice"];
  const abstractRows = rows.filter((r) =>
    r.unite ? ABSTRACT_UNITS.includes(r.unite) : false,
  );
  if (abstractRows.length > 0) {
    console.log(`\n--- ⚠ UNITÉS ABSTRAITES (revue manuelle systématique) ---\n`);
    for (const r of abstractRows) {
      const status = r.statut === "publie" ? "📢" : "📝";
      console.log(`${r.customId}  ${status}  ${r.theme}  unité=« ${r.unite} »  [${r.plageMin}, ${r.plageMax}]  →  ${r.reponseNumerique}`);
      console.log(`  Q: ${r.question}`);
      console.log(`  P: ${r.precisions ?? "(VIDE)"}`);
      console.log("");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
