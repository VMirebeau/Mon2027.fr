#!/usr/bin/env node
// Gestion des comptes de l'espace contributeurs en ligne de commande.
// C'est le SEUL moyen de créer un superadmin (jamais depuis le web), et le
// moyen de créer le tout premier compte.
//
//   node contributor.cjs list
//   node contributor.cjs create <login> <role> [nom affiché]
//   node contributor.cjs reset <login>          nouveau mot de passe provisoire
//   node contributor.cjs role <login> <role>
//   node contributor.cjs disable <login> | enable <login>
//
// Rôles : contributeur | relecteur | admin | superadmin
//
// En local (depuis admin/) :
//   DATABASE_URL="file:./dev.db" node ../scripts/contributor.cjs create <login> superadmin "Ton nom"
// En prod :
//   python deploy.py contributor create <login> superadmin "Ton nom"
//
// ⚠️ hashPassword est le jumeau de admin/src/lib/auth/password.ts (même
// format scrypt) ; admin/src/lib/auth/password.test.ts vérifie la
// compatibilité.

"use strict";

const { randomBytes, scrypt } = require("node:crypto");

const ROLES = ["contributeur", "relecteur", "admin", "superadmin"];
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function hashPassword(plain) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }, (err, key) =>
      err
        ? reject(err)
        : resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`),
    );
  });
}

function temporaryPassword() {
  return randomBytes(12).toString("base64url");
}

function fail(msg) {
  console.error(`[ERR] ${msg}`);
  process.exit(1);
}

function printTemp(login, password) {
  console.log("");
  console.log(`  Identifiant           : ${login}`);
  console.log(`  Mot de passe provisoire : ${password}`);
  console.log("  (à changer à la première connexion ; il ne sera plus affiché)");
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const { PrismaClient } = require(require.resolve("@prisma/client", { paths: [process.cwd(), "/app"] }));
  const prisma = new PrismaClient({ log: [] });
  const byLogin = async (login) => {
    const c = await prisma.contributor.findUnique({ where: { login: String(login ?? "").toLowerCase() } });
    if (!c) fail(`aucun compte « ${login} »`);
    return c;
  };
  try {
    switch (cmd) {
      case "list": {
        const all = await prisma.contributor.findMany({ orderBy: { createdAt: "asc" } });
        if (all.length === 0) console.log("  Aucun compte. Crée le premier : create <login> superadmin \"Ton nom\"");
        for (const c of all) {
          const flags = [c.disabledAt ? "désactivé" : null, c.mustChangePassword ? "mdp provisoire" : null]
            .filter(Boolean)
            .join(", ");
          console.log(`  ${c.login.padEnd(20)} ${c.role.padEnd(13)} ${c.displayName}${flags ? `  (${flags})` : ""}`);
        }
        break;
      }
      case "create": {
        const [rawLogin, role, ...nameParts] = args;
        const login = String(rawLogin ?? "").toLowerCase();
        if (!LOGIN_RE.test(login)) fail("identifiant : 3 à 32 caractères, a-z 0-9 . _ -");
        if (!ROLES.includes(role)) fail(`rôle inconnu (${ROLES.join(" | ")})`);
        const displayName = (nameParts.join(" ").trim() || login).slice(0, 60);
        if (await prisma.contributor.findUnique({ where: { login } })) fail(`« ${login} » existe déjà`);
        const password = temporaryPassword();
        await prisma.contributor.create({
          data: { login, displayName, role, passwordHash: await hashPassword(password), mustChangePassword: true },
        });
        console.log(`[OK] Compte ${role} « ${displayName} » créé.`);
        printTemp(login, password);
        break;
      }
      case "reset": {
        const c = await byLogin(args[0]);
        const password = temporaryPassword();
        await prisma.contributor.update({
          where: { id: c.id },
          data: { passwordHash: await hashPassword(password), mustChangePassword: true, disabledAt: null },
        });
        await prisma.contributorSession.deleteMany({ where: { contributorId: c.id } });
        console.log(`[OK] Mot de passe réinitialisé (sessions déconnectées, compte réactivé).`);
        printTemp(c.login, password);
        break;
      }
      case "role": {
        const c = await byLogin(args[0]);
        if (!ROLES.includes(args[1])) fail(`rôle inconnu (${ROLES.join(" | ")})`);
        await prisma.contributor.update({ where: { id: c.id }, data: { role: args[1] } });
        console.log(`[OK] ${c.login} : ${c.role} → ${args[1]}`);
        break;
      }
      case "disable":
      case "enable": {
        const c = await byLogin(args[0]);
        await prisma.contributor.update({
          where: { id: c.id },
          data: { disabledAt: cmd === "disable" ? new Date() : null },
        });
        if (cmd === "disable") await prisma.contributorSession.deleteMany({ where: { contributorId: c.id } });
        console.log(`[OK] ${c.login} ${cmd === "disable" ? "désactivé (sessions déconnectées)" : "réactivé"}`);
        break;
      }
      default:
        fail("commandes : list | create <login> <role> [nom] | reset <login> | role <login> <role> | disable <login> | enable <login>");
    }
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { hashPassword, ROLES };

if (require.main === module) {
  main().catch((e) => fail(e?.message ?? String(e)));
}
