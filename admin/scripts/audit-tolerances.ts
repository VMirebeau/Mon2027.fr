/**
 * Audit one-shot : pour toutes les questions estimation_numerique en DB,
 * affiche span, toleranceVerte/Orange en valeur ET en % de plage.
 * Flag les tolérances qui paraissent disproportionnées vs la plage actuelle.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const qs = await prisma.question.findMany({
    where: { format: "estimation_numerique" },
    select: {
      customId: true,
      plageMin: true,
      plageMax: true,
      reponseNumerique: true,
      toleranceVerte: true,
      toleranceOrange: true,
    },
    orderBy: { customId: "asc" },
  });

  const flagged: string[] = [];
  for (const q of qs) {
    if (q.plageMin == null || q.plageMax == null) continue;
    const span = q.plageMax - q.plageMin;
    if (span <= 0) continue;
    // Doit refléter la dérivation côté player (player/src/lib/content.ts).
    const v = q.toleranceVerte ?? span * 0.05;
    const o = q.toleranceOrange ?? span * 0.15;
    const vPct = (v / span) * 100;
    const oPct = (o / span) * 100;
    // Cible : verte ~3-7 %, orange ~10-20 %. Hors-bornes = warning.
    const warn: string[] = [];
    if (vPct > 8) warn.push(`VERT trop large ${vPct.toFixed(1)}%`);
    if (vPct < 2) warn.push(`VERT trop strict ${vPct.toFixed(1)}%`);
    if (oPct > 25) warn.push(`ORANGE trop large ${oPct.toFixed(1)}%`);
    if (oPct < 8) warn.push(`ORANGE trop strict ${oPct.toFixed(1)}%`);
    if (warn.length) {
      flagged.push(
        `${q.customId} [${q.plageMin}-${q.plageMax}] v=${v}(${vPct.toFixed(1)}%) o=${o}(${oPct.toFixed(1)}%) — ${warn.join(", ")}`,
      );
    }
  }

  console.log(`\n${qs.length} questions estimation_numerique analysées.`);
  console.log(`${flagged.length} avec tolérances hors cible (vert 2-8%, orange 8-25%) :\n`);
  for (const line of flagged) console.log(line);
}

main().finally(() => prisma.$disconnect());
