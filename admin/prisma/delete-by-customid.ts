/**
 * Supprime une (ou plusieurs) question(s) en base par customId, avec
 * cascade sur les sources liées. À utiliser pour les doublons identifiés
 * pendant la relecture. Passe les customIds via argv ou hardcode-les
 * dans `TARGETS` ci-dessous.
 *
 * Usage : npx tsx prisma/delete-by-customid.ts Q-IMM-035 Q-IMM-099
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGETS = process.argv.slice(2);

async function main() {
  if (TARGETS.length === 0) {
    console.log("Aucun customId fourni en argv. Rien à faire.");
    return;
  }
  for (const id of TARGETS) {
    const existing = await prisma.question.findUnique({
      where: { customId: id },
    });
    if (!existing) {
      console.log(`✗ ${id} introuvable, skip.`);
      continue;
    }
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { questionId: existing.id } }),
      prisma.question.delete({ where: { id: existing.id } }),
    ]);
    console.log(`🗑  ${id} supprimée (avec ${existing.id ? "sources liées" : ""}).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
