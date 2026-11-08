#!/usr/bin/env node
// Indique si la migration de rattrapage (tables créées jadis par `db push`)
// doit être marquée « appliquée » sans être exécutée : c'est le cas d'une
// base existante qui a déjà ces tables mais pas la ligne dans
// _prisma_migrations. Une base neuve, elle, doit l'exécuter normalement.
//
//   node migrate-baseline.cjs <nom_migration>   → affiche RESOLVE ou OK
// Utilisé par `python deploy.py migrate`.

"use strict";

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error("usage : node migrate-baseline.cjs <nom_migration>");
  const { PrismaClient } = require(require.resolve("@prisma/client", { paths: [process.cwd(), "/app"] }));
  const prisma = new PrismaClient({ log: [] });
  try {
    const hasTable = async (t) =>
      Number(
        (await prisma.$queryRawUnsafe(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
          t,
        ))[0].n,
      ) > 0;
    if (!(await hasTable("_prisma_migrations"))) return console.log("OK (base neuve)");
    const recorded = Number(
      (await prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM _prisma_migrations WHERE migration_name = ?", name))[0].n,
    );
    console.log(!recorded && (await hasTable("User")) ? "RESOLVE" : "OK");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`[ERR] ${e?.message ?? e}`);
  process.exit(1);
});
