#!/usr/bin/env node
// Sauvegarde à chaud de la base de prod (VACUUM INTO = copie cohérente même
// si le player écrit pendant ce temps). Exécuté DANS le conteneur player par
// `python deploy.py backup`, qui rapatrie ensuite le fichier sur le poste.
// Affiche sur la dernière ligne le chemin du fichier créé.

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require(
  require.resolve("@prisma/client", { paths: [process.cwd(), "/app"] }),
);

const PREFIX = "manuel-";
const KEPT = 5;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) throw new Error(`DATABASE_URL inattendue (${url})`);
  const dir = path.join(path.dirname(url.slice("file:".length)), "backups");
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(dir, `${PREFIX}${stamp}.db`);
  const prisma = new PrismaClient({ log: [] });
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${out}'`);
  } finally {
    await prisma.$disconnect();
  }

  // On ne garde que les dernières copies manuelles dans le volume : la vraie
  // archive est celle rapatriée sur le poste.
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(".db"))
    .sort()
    .slice(0, -KEPT)) {
    fs.unlinkSync(path.join(dir, f));
  }
  console.log(out);
}

main().catch((e) => {
  console.error(`[ERR] ${e?.message ?? e}`);
  process.exit(1);
});
