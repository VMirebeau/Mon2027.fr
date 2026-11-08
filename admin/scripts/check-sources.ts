/// Vérifie que toutes les URLs de Source des questions publiées renvoient
/// un code HTTP < 400. Détecte les liens cassés (404, 403, 5xx) sans
/// crawler en profondeur.
///
/// Usage : npx tsx admin/scripts/check-sources.ts
///
/// À brancher en CI weekly (cron) pour éviter que les liens cassent
/// silencieusement après une refonte du site source (cas typique INSEE
/// qui change l'arborescence des publications de stats).
///
/// Performance : on parallélise par lots de CONCURRENCY pour ne pas
/// inonder un même domaine. Timeout 10s par requête. HEAD plutôt que GET
/// pour économiser la bande passante (la plupart des sites le supportent
/// — on retombe sur GET en cas de 405).

import { prisma } from "../src/lib/db";

const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;

type CheckResult = {
  url: string;
  questionId: string;
  questionLabel: string;
  status: number | "timeout" | "network-error";
  ok: boolean;
};

async function checkOne(
  url: string,
  questionId: string,
  questionLabel: string,
): Promise<CheckResult> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "follow",
    });
    // Certains sites refusent HEAD (405) — on retombe sur GET.
    if (res.status === 405) {
      res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "follow",
      });
    }
    return {
      url,
      questionId,
      questionLabel,
      status: res.status,
      ok: res.status < 400,
    };
  } catch (err) {
    const isTimeout = (err as { name?: string }).name === "AbortError";
    return {
      url,
      questionId,
      questionLabel,
      status: isTimeout ? "timeout" : "network-error",
      ok: false,
    };
  } finally {
    clearTimeout(to);
  }
}

async function main() {
  const questions = await prisma.question.findMany({
    where: { statut: "publie" },
    select: {
      customId: true,
      question: true,
      sources: { select: { url: true } },
    },
  });

  const jobs: Array<{ url: string; questionId: string; questionLabel: string }> = [];
  for (const q of questions) {
    for (const s of q.sources) {
      jobs.push({
        url: s.url,
        questionId: q.customId ?? "?",
        questionLabel: q.question.slice(0, 70),
      });
    }
  }

  console.log(
    `[check-sources] ${jobs.length} URLs à tester sur ${questions.length} questions publiées.`,
  );

  const results: CheckResult[] = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((j) => checkOne(j.url, j.questionId, j.questionLabel)),
    );
    results.push(...batchResults);
    process.stdout.write(`\r[check-sources] ${results.length} / ${jobs.length}`);
  }
  process.stdout.write("\n");

  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) {
    console.log(`✓ Toutes les sources sont OK (${results.length} URLs).`);
    process.exit(0);
  }

  console.log(`\n✗ ${failures.length} URLs cassées :\n`);
  for (const f of failures) {
    console.log(`  [${f.status}] ${f.url}`);
    console.log(`         dans ${f.questionId} — ${f.questionLabel}…`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
