import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireContributor } from "@/lib/auth/session";
import { SUGGESTION_KINDS, SUGGESTION_STATUTS } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, previewValue } from "../_components/format";
import { X } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Propositions des joueurs · Mon2027" };

/// Vues de la file : « à traiter » par défaut (nouvelles + en cours).
const VIEWS = [
  { value: "a_traiter", label: "À traiter", statuses: ["nouvelle", "en_cours"] },
  { value: "acceptee", label: "Acceptées", statuses: ["acceptee"] },
  { value: "refusee", label: "Refusées", statuses: ["refusee"] },
  { value: "toutes", label: "Toutes", statuses: null },
] as const;

export default async function SuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireContributor();
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.value === sp.vue) ?? VIEWS[0];
  const kind = SUGGESTION_KINDS.find((k) => k.value === sp.type)?.value;
  /// Propositions sur une question précise (lien depuis la page de la
  /// question ou d'une autre proposition), désignée par son code.
  const questionCode = typeof sp.question === "string" && sp.question.trim() ? sp.question.trim() : undefined;

  const where: Prisma.SuggestionWhereInput = {
    ...(view.statuses ? { status: { in: [...view.statuses] } } : {}),
    ...(kind ? { kind } : {}),
    ...(questionCode ? { questionCustomId: questionCode } : {}),
  };
  const countWhere: Prisma.SuggestionWhereInput = questionCode ? { questionCustomId: questionCode } : {};
  const [suggestions, counts] = await Promise.all([
    prisma.suggestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { displayPseudo: true } },
        handledBy: { select: { displayName: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.suggestion.groupBy({ by: ["status"], where: countWhere, _count: true }),
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  // Lien vers la question concernée : les joueurs la désignent par customId.
  const customIds = [...new Set(suggestions.map((s) => s.questionCustomId).filter((x): x is string => !!x))];
  const questions = await prisma.question.findMany({
    where: { customId: { in: customIds } },
    select: { id: true, customId: true },
  });
  const qIdByCustom = new Map(questions.map((q) => [q.customId, q.id]));
  const filteredQuestionId = questionCode
    ? (qIdByCustom.get(questionCode) ??
      (await prisma.question.findUnique({ where: { customId: questionCode }, select: { id: true } }))?.id)
    : undefined;

  const href = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ vue: view.value, type: kind, question: questionCode, ...params })) {
      if (v) p.set(k, v);
    }
    return `/suggestions?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Propositions des joueurs</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Envoyées depuis l&apos;app publique (erreurs, sources, idées de questions). Elles ne modifient rien
        d&apos;elles-mêmes : à vous de les examiner, d&apos;en discuter, puis de corriger la question si besoin.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => {
          const n = v.statuses ? v.statuses.reduce((sum, s) => sum + (countBy[s] ?? 0), 0) : undefined;
          return (
            <Link
              key={v.value}
              href={href({ vue: v.value })}
              className={buttonVariants({ variant: v.value === view.value ? "default" : "outline", size: "sm" })}
            >
              {v.label}
              {n !== undefined && <span className="ml-1 opacity-70">{n}</span>}
            </Link>
          );
        })}
        <span className="mx-2 h-5 w-px bg-border" />
        <Link href={href({ type: undefined })} className={buttonVariants({ variant: !kind ? "secondary" : "ghost", size: "sm" })}>
          Tous types
        </Link>
        {SUGGESTION_KINDS.map((k) => (
          <Link
            key={k.value}
            href={href({ type: k.value })}
            className={buttonVariants({ variant: kind === k.value ? "secondary" : "ghost", size: "sm" })}
          >
            {k.label}
          </Link>
        ))}
      </div>

      {questionCode && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Propositions sur la question</span>
          {filteredQuestionId ? (
            <Link href={`/questions/${filteredQuestionId}`} className="font-mono underline">
              {questionCode}
            </Link>
          ) : (
            <span className="font-mono">{questionCode}</span>
          )}
          <Link
            href={href({ question: undefined })}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label="Voir les propositions sur toutes les questions"
          >
            <X className="mr-1 h-4 w-4" /> Toutes les questions
          </Link>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Reçue</TableHead>
              <TableHead className="w-32">Type</TableHead>
              <TableHead className="w-28">Question</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-28">Joueur</TableHead>
              <TableHead className="w-36">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  Rien ici pour l&apos;instant.
                </TableCell>
              </TableRow>
            ) : (
              suggestions.map((s) => {
                const statut = SUGGESTION_STATUTS.find((x) => x.value === s.status);
                const qId = s.questionCustomId ? qIdByCustom.get(s.questionCustomId) : undefined;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell className="text-sm">
                      {SUGGESTION_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.questionCustomId ? (
                        qId ? (
                          <Link href={`/questions/${qId}`} className="underline">
                            {s.questionCustomId}
                          </Link>
                        ) : (
                          s.questionCustomId
                        )
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <Link href={`/suggestions/${s.id}`} className="line-clamp-2 hover:underline">
                        {previewValue(s.message, 220)}
                      </Link>
                      {s._count.comments > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {s._count.comments} message{s._count.comments > 1 ? "s" : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.user?.displayPseudo ?? "anonyme"}</TableCell>
                    <TableCell>
                      <Badge className={statut?.color}>{statut?.label ?? s.status}</Badge>
                      {s.handledBy && (
                        <div className="mt-1 text-xs text-muted-foreground">par {s.handledBy.displayName}</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
