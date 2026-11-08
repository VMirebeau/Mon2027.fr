import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireContributor } from "@/lib/auth/session";
import { setSuggestionStatusAction } from "@/lib/collab-actions";
import { SUGGESTION_KINDS, SUGGESTION_STATUTS } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "../../_components/ActionButton";
import { CommentThread } from "../../_components/CommentThread";
import { formatDateTime, isHttpUrl } from "../../_components/format";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuggestionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireContributor();
  const { id } = await params;
  const s = await prisma.suggestion.findUnique({
    where: { id },
    include: {
      user: { select: { displayPseudo: true } },
      handledBy: { select: { displayName: true } },
    },
  });
  if (!s) notFound();

  const question = s.questionCustomId
    ? await prisma.question.findUnique({
        where: { customId: s.questionCustomId },
        select: { id: true, customId: true, question: true, statut: true },
      })
    : null;
  const statut = SUGGESTION_STATUTS.find((x) => x.value === s.status);
  // Autres propositions sur la même question : souvent le même problème.
  const siblings = s.questionCustomId
    ? await prisma.suggestion.count({ where: { questionCustomId: s.questionCustomId, id: { not: s.id } } })
    : 0;
  const siblingsHref = s.questionCustomId
    ? `/suggestions?${new URLSearchParams({ question: s.questionCustomId, vue: "toutes" }).toString()}`
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/suggestions" aria-label="Retour aux propositions" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold">
          {SUGGESTION_KINDS.find((k) => k.value === s.kind)?.label ?? "Proposition"}
        </h1>
        <Badge className={statut?.color}>{statut?.label ?? s.status}</Badge>
        {question && (
          <Link
            href={`/questions/${question.id}`}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} ml-auto`}
          >
            Ouvrir la question {question.customId}
          </Link>
        )}
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-4 p-5">
          <div className="text-xs text-muted-foreground">
            Reçue le {formatDateTime(s.createdAt)} · {s.user ? `joueur « ${s.user.displayPseudo} »` : "joueur anonyme"}
            {s.handledBy && ` · prise en charge par ${s.handledBy.displayName}`}
          </div>
          <p className="whitespace-pre-wrap break-words">{s.message}</p>
          {s.sourceUrl && (
            <p className="text-sm">
              Source proposée :{" "}
              {isHttpUrl(s.sourceUrl) ? (
                <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
                  {s.sourceUrl}
                </a>
              ) : (
                <span className="break-all">{s.sourceUrl}</span>
              )}
            </p>
          )}
          {s.questionCustomId && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              {question ? (
                <>
                  <Link href={`/questions/${question.id}`} className="font-mono text-xs underline">
                    {question.customId}
                  </Link>{" "}
                  : {question.question}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Question {s.questionCustomId} introuvable (supprimée ou renommée).
                </span>
              )}
              {siblings > 0 && siblingsHref && (
                <div className="mt-1 text-xs">
                  <Link href={siblingsHref} className="text-muted-foreground underline hover:text-foreground">
                    {siblings} autre{siblings > 1 ? "s" : ""} proposition{siblings > 1 ? "s" : ""} sur cette question
                  </Link>
                </div>
              )}
            </div>
          )}
          {s.kind === "nouvelle_question" && (
            <Link href="/questions/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Rédiger une question à partir de cette idée
            </Link>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {SUGGESTION_STATUTS.filter((x) => x.value !== s.status).map((x) => (
              <ActionButton key={x.value} action={setSuggestionStatusAction.bind(null, s.id, x.value)}>
                {x.value === "nouvelle" ? "Remettre en « nouvelle »" : `Marquer « ${x.label} »`}
              </ActionButton>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread target={{ suggestionId: s.id }} me={me} />
        </CardContent>
      </Card>
    </div>
  );
}
