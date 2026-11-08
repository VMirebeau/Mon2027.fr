#!/usr/bin/env node
// Synchronisation du contenu éditorial (Question + Source) entre ta base
// locale et la prod, sans jamais toucher aux joueurs (User, Answer, Defi…)
// ni au travail collectif (historique, validations, discussion).
//
// La PROD est la référence : les contributeurs y travaillent. Trois modes :
//
//   export  <out.json>              (prod)  exporte le contenu → `deploy.py pull`
//   push    <in.json> [--apply]     (prod)  fusionne le contenu local → `deploy.py content`
//   replace <in.json> [--apply]     (local) remplace le contenu local par celui de la prod
//
// Fusion (push), question par question, clé = customId :
//   - absente en prod, jamais synchronisée → créée (avec son statut local) ;
//   - absente en prod mais déjà synchronisée → supprimée en prod depuis :
//                                            non recréée (conflit si tu
//                                            l'as modifiée entre-temps) ;
//   - identique                            → rien ;
//   - prod inchangée depuis ton dernier
//     pull/push (empreinte = base)         → mise à jour ;
//   - prod modifiée, local inchangé        → on garde la prod (fais un pull) ;
//   - modifiée des deux côtés              → CONFLIT, ignorée, listée ;
//   - présente en prod seulement           → conservée (jamais de suppression).
// Sans base connue (premier envoi), une question n'est mise à jour que si
// aucun contributeur ne l'a encore modifiée en prod.
//
// ⚠️ contentHash/stateHash/diffQuestion sont les jumeaux de
// admin/src/lib/content-hash.ts ; admin/src/lib/content-hash.test.ts
// vérifie qu'ils produisent les mêmes empreintes.

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

// ------------------------------------------------------------------
// Empreintes (jumelles de admin/src/lib/content-hash.ts)
// ------------------------------------------------------------------

const CONTENT_FIELDS = [
  "customId", "slug", "theme", "sousTheme", "format", "sensibilite", "difficulte",
  "question", "precisions", "explication", "contextePedagogique", "miseEnPerspective",
  "indicators", "unite", "plageMin", "plageMax", "reponseNumerique", "toleranceVerte",
  "toleranceOrange", "payload", "dateDonnee",
];
const TRACKED_FIELDS = [...CONTENT_FIELDS, "statut", "auteur"];

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function canonicalSources(sources) {
  return sources
    .map((s) => [s.nom, s.url, s.type, s.ordre])
    .sort((a, b) => a[3] - b[3] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

function contentHash(q, sources) {
  const values = CONTENT_FIELDS.map((f) => q[f] ?? null);
  return sha256(JSON.stringify([values, canonicalSources(sources)]));
}

function stateHash(q, sources) {
  return sha256(`${contentHash(q, sources)}|${String(q.statut ?? "")}`);
}

function diffQuestion(before, beforeSources, after, afterSources) {
  const changes = {};
  for (const f of TRACKED_FIELDS) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (a !== b) changes[f] = [a, b];
  }
  const sa = canonicalSources(beforeSources);
  const sb = canonicalSources(afterSources);
  if (JSON.stringify(sa) !== JSON.stringify(sb)) {
    const toObj = ([nom, url, type]) => ({ nom, url, type });
    changes.sources = [sa.map(toObj), sb.map(toObj)];
  }
  return changes;
}

const keyOf = (q) => q.customId ?? `id:${q.id}`;

// ------------------------------------------------------------------
// Plan de fusion (pur, testé dans admin/src/lib/content-hash.test.ts)
// ------------------------------------------------------------------

/// incoming / prod : [{ q, sources }] ; prod porte aussi `humanEdited`
/// (un contributeur l'a créée ou modifiée). base : { clé: stateHash }.
function planPush({ incoming, prod, base = {} }) {
  const prodByKey = new Map(prod.map((p) => [keyOf(p.q), p]));
  const plan = { created: [], updated: [], identical: [], prodAhead: [], conflicts: [], prodOnly: [], deletedInProd: [] };
  const seen = new Set();
  for (const inc of incoming) {
    const key = keyOf(inc.q);
    seen.add(key);
    const cur = prodByKey.get(key);
    const inHash = stateHash(inc.q, inc.sources);
    if (!cur) {
      // Connue de la base de synchro mais absente en prod : un contributeur
      // l'a supprimée depuis. On ne la ressuscite pas en douce.
      if (!base[key]) plan.created.push({ key, inc, inHash });
      else if (inHash === base[key]) plan.deletedInProd.push({ key, inc, inHash });
      else plan.conflicts.push({ key, inc, inHash });
      continue;
    }
    const prodHash = stateHash(cur.q, cur.sources);
    const entry = { key, inc, cur, inHash };
    if (prodHash === inHash) plan.identical.push(entry);
    else if (base[key]) {
      if (prodHash === base[key]) plan.updated.push(entry);
      else if (inHash === base[key]) plan.prodAhead.push(entry);
      else plan.conflicts.push(entry);
    } else if (!cur.humanEdited) plan.updated.push(entry);
    else plan.conflicts.push(entry);
  }
  for (const p of prod) if (!seen.has(keyOf(p.q))) plan.prodOnly.push({ key: keyOf(p.q), cur: p });
  return plan;
}

module.exports = { CONTENT_FIELDS, contentHash, stateHash, diffQuestion, planPush, keyOf };

// ------------------------------------------------------------------
// Exécution
// ------------------------------------------------------------------

const BACKUPS_KEPT = 10;
const BACKUP_PREFIX = "prod-avant-contenu-";
const LIST_MAX = 15;

function fail(msg) {
  console.error(`[ERR] ${msg}`);
  process.exit(1);
}
const warn = (msg) => console.log(`[!] ${msg}`);

function showList(title, keys, max = LIST_MAX) {
  if (!keys.length) return;
  console.log(`  ${title} (${keys.length}) : ${keys.slice(0, max).join(", ")}${keys.length > max ? ", …" : ""}`);
}

function readExport(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`export illisible (${file}) : ${e.message}`);
  }
  if (!Array.isArray(data.Question) || !Array.isArray(data.Source)) fail("export invalide : tableaux Question/Source manquants");
  if (data.Question.length === 0) fail("l'export ne contient aucune question — base vide ? Abandon.");
  return data;
}

function scalarFields(Prisma, model) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  if (!m) fail(`modèle ${model} absent du client Prisma`);
  return m.fields.filter((f) => f.kind === "scalar");
}

function toDate(value, where) {
  if (value === null || value === undefined) return value;
  const d =
    typeof value === "number"
      ? new Date(value)
      : /^\d+$/.test(String(value))
        ? new Date(Number(value))
        : new Date(String(value));
  if (Number.isNaN(d.getTime())) fail(`${where} : date invalide (${value})`);
  return d;
}

/// Colonnes de l'export = colonnes du schéma déployé, sinon les deux bases
/// ne sont pas à la même version de schéma.
function normalize(Prisma, model, rows) {
  const fields = scalarFields(Prisma, model);
  const names = new Set(fields.map((f) => f.name));
  const dateFields = fields.filter((f) => f.type === "DateTime").map((f) => f.name);
  const incoming = new Set(rows.flatMap((r) => Object.keys(r)));
  const extra = [...incoming].filter((k) => !names.has(k));
  const missing = rows.length ? [...names].filter((k) => !incoming.has(k)) : [];
  if (extra.length || missing.length) {
    fail(
      `${model} : schémas différents (en trop : ${extra.join(", ") || "—"} ; manquantes : ${missing.join(", ") || "—"}).\n` +
        "      Déploie le code (python deploy.py player), applique les migrations des deux côtés, puis recommence.",
    );
  }
  return rows.map((r) => {
    const o = { ...r };
    for (const f of dateFields) if (f in o) o[f] = toDate(o[f], `${model}.${f}`);
    return o;
  });
}

async function checkMigrations(prisma, theirs, where) {
  const ours = (
    await prisma.$queryRawUnsafe(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
    )
  ).map((r) => r.migration_name);
  const onlyTheirs = (theirs ?? []).filter((m) => !ours.includes(m));
  const onlyOurs = ours.filter((m) => !(theirs ?? []).includes(m));
  if (onlyTheirs.length || onlyOurs.length) {
    fail(
      `migrations différentes entre l'export et ${where}.\n` +
        `      Seulement dans l'export : ${onlyTheirs.join(", ") || "—"}\n` +
        `      Seulement dans ${where} : ${onlyOurs.join(", ") || "—"}\n` +
        "      Aligne les deux bases (python deploy.py migrate en prod ; npx prisma migrate deploy en local).",
    );
  }
}

function group(sources) {
  const by = new Map();
  for (const s of sources) {
    if (!by.has(s.questionId)) by.set(s.questionId, []);
    by.get(s.questionId).push(s);
  }
  return by;
}

const srcData = (s) => ({ nom: s.nom, url: s.url, type: s.type, ordre: s.ordre });
const ms = (d) => (d instanceof Date ? d.getTime() : d);

function backupDir() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) fail(`DATABASE_URL inattendue (${url}) — sauvegarde impossible`);
  return path.join(path.dirname(url.slice("file:".length)), "backups");
}

async function backup(prisma) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${out}'`);
  const old = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(".db"))
    .sort()
    .slice(0, -BACKUPS_KEPT);
  for (const f of old) fs.unlinkSync(path.join(dir, f));
  console.log(`  Sauvegarde : ${out}`);
}

/// Dernière ligne, lue par deploy.py (empreintes de base à mémoriser).
function printResult(result) {
  console.log(`RESULT_JSON:${JSON.stringify(result)}`);
}

async function withBusyRetry(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const busy = /database is locked|SQLITE_BUSY|P1008|timed out/i.test(String(e?.message ?? e));
      if (!busy || attempt >= 5) throw e;
      warn(`base occupée, nouvel essai (${attempt}/5)…`);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

async function runExport(prisma, out) {
  const migrations = (
    await prisma.$queryRawUnsafe(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
    )
  ).map((r) => r.migration_name);
  const questions = await prisma.question.findMany({ orderBy: { createdAt: "asc" } });
  const sources = await prisma.source.findMany();
  const toPlain = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, ms(v)]));
  fs.writeFileSync(out, JSON.stringify({ migrations, Question: questions.map(toPlain), Source: sources.map(toPlain) }));
  console.log(`  Export : ${questions.length} questions, ${sources.length} sources.`);
}

async function runPush(prisma, Prisma, data, apply) {
  await checkMigrations(prisma, data.migrations, "la prod");
  const questions = normalize(Prisma, "Question", data.Question);
  const sources = normalize(Prisma, "Source", data.Source);
  const srcBy = group(sources);
  const ids = new Set(questions.map((q) => q.id));
  const orphans = sources.filter((s) => !ids.has(s.questionId));
  if (orphans.length) fail(`${orphans.length} source(s) pointent vers une question absente de l'export`);

  const prodRows = await prisma.question.findMany({
    include: {
      sources: true,
      revisions: { where: { contributorId: { not: null } }, select: { id: true }, take: 1 },
    },
  });
  const prod = prodRows.map(({ sources: s, revisions, ...q }) => ({ q, sources: s, humanEdited: revisions.length > 0 }));
  const plan = planPush({
    incoming: questions.map((q) => ({ q, sources: srcBy.get(q.id) ?? [] })),
    prod,
    base: data.base ?? {},
  });

  const pubBefore = prod.filter((p) => p.q.statut === "publie").length;
  console.log("");
  console.log(`  En prod : ${prod.length} questions (${pubBefore} publiées) · en local : ${questions.length}`);
  showList("À créer", plan.created.map((e) => e.key));
  showList("À mettre à jour", plan.updated.map((e) => e.key));
  console.log(`  Identiques : ${plan.identical.length}`);
  showList("Modifiées en prod seulement (gardées, fais un pull)", plan.prodAhead.map((e) => e.key));
  showList("Présentes en prod seulement (gardées, fais un pull)", plan.prodOnly.map((e) => e.key));
  showList("Supprimées en prod depuis ton dernier envoi (non recréées)", plan.deletedInProd.map((e) => e.key));
  if (plan.conflicts.length) {
    warn(`${plan.conflicts.length} CONFLIT(S) : modifiées (ou supprimées) en prod ET modifiées chez toi. Ignorées.`);
    showList("Conflits", plan.conflicts.map((e) => e.key), 50);
    warn("Fais `python deploy.py pull` (tes changements locaux sur ces questions seront perdus : note-les),");
    warn("ou reporte-les à la main dans l'admin de prod.");
  }
  const unpublished = plan.updated.filter((e) => e.cur.q.statut === "publie" && e.inc.q.statut !== "publie");
  showList("Seront dépubliées", unpublished.map((e) => e.key));

  const baseUpdates = {};
  for (const e of [...plan.created, ...plan.updated, ...plan.identical]) baseUpdates[e.key] = e.inHash;

  if (!plan.created.length && !plan.updated.length) {
    console.log("  Rien à envoyer.");
    if (apply) printResult({ baseUpdates });
    return;
  }
  if (!apply) {
    console.log("");
    console.log("  (aperçu uniquement — rien n'a été modifié)");
    return;
  }

  await backup(prisma);
  const prodIds = new Set(prod.map((p) => p.q.id));
  const ops = [];
  for (const { inc } of plan.created) {
    const { id, updatedAt, ...fields } = inc.q;
    void updatedAt;
    ops.push(
      prisma.question.create({
        data: {
          ...(prodIds.has(id) ? {} : { id }),
          ...fields,
          sources: { create: inc.sources.map(srcData) },
          revisions: { create: { kind: "import", contentHash: contentHash(inc.q, inc.sources) } },
        },
      }),
    );
  }
  for (const { inc, cur } of plan.updated) {
    // On garde l'id de prod (historique, discussion, validations y sont rattachés).
    const { id, createdAt, updatedAt, ...fields } = inc.q;
    void id, createdAt, updatedAt;
    ops.push(prisma.source.deleteMany({ where: { questionId: cur.q.id } }));
    ops.push(
      prisma.question.update({
        where: { id: cur.q.id },
        data: { ...fields, sources: { create: inc.sources.map(srcData) } },
      }),
    );
    ops.push(
      prisma.questionRevision.create({
        data: {
          questionId: cur.q.id,
          kind: "import",
          changes: JSON.stringify(diffQuestion(cur.q, cur.sources, inc.q, inc.sources)),
          contentHash: contentHash(inc.q, inc.sources),
        },
      }),
    );
  }
  await withBusyRetry(() => prisma.$transaction(ops));
  console.log(`  Envoyé : ${plan.created.length} créée(s), ${plan.updated.length} mise(s) à jour.`);
  printResult({ baseUpdates });
}

async function runReplace(prisma, Prisma, data, apply) {
  await checkMigrations(prisma, data.migrations, "la base locale");
  const questions = normalize(Prisma, "Question", data.Question);
  const sources = normalize(Prisma, "Source", data.Source);
  const before = await prisma.question.count();
  console.log(`  Base locale : ${before} questions → ${questions.length} (copie de la prod)`);
  if (!apply) return;
  // Local uniquement : supprimer les questions supprime en cascade leur
  // historique/discussion LOCAUX, sans valeur (la prod fait foi).
  await withBusyRetry(() =>
    prisma.$transaction([
      prisma.source.deleteMany(),
      prisma.question.deleteMany(),
      prisma.question.createMany({ data: questions }),
      prisma.source.createMany({ data: sources }),
    ]),
  );
  const srcBy = group(sources);
  const base = {};
  for (const q of questions) base[keyOf(q)] = stateHash(q, srcBy.get(q.id) ?? []);
  console.log(`  Base locale à jour : ${questions.length} questions, ${sources.length} sources.`);
  printResult({ base });
}

async function main() {
  const [mode, file, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");
  if (!["export", "push", "replace"].includes(mode) || !file) {
    fail("usage : node content-sync.cjs export <out.json> | push <in.json> [--apply] | replace <in.json> [--apply]");
  }
  // Résolu depuis le dossier de l'app (cwd de `docker exec` = /app), pas
  // depuis l'emplacement du script (copié dans /tmp).
  const { PrismaClient, Prisma } = require(
    require.resolve("@prisma/client", { paths: [process.cwd(), "/app"] }),
  );
  const prisma = new PrismaClient({ log: [] });
  try {
    if (mode === "export") await runExport(prisma, file);
    else if (mode === "push") await runPush(prisma, Prisma, readExport(file), apply);
    else await runReplace(prisma, Prisma, readExport(file), apply);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    if (e?.code === "P2002") {
      fail(`doublon sur ${[].concat(e.meta?.target ?? "?").join(", ")} — transaction annulée, rien n'a changé.`);
    }
    fail(`${e?.message ?? e}\n      Transaction annulée : rien n'a changé.`);
  });
}
