import { prisma } from "@/lib/db";
import { addCommentAction, deleteCommentAction } from "@/lib/collab-actions";
import { hasRole } from "@/lib/auth/roles";
import type { CurrentContributor } from "@/lib/auth/session";
import { ActionButton } from "./ActionButton";
import { CommentForm } from "./CommentForm";
import { formatDateTime } from "./format";

/// Discussion entre contributeurs, sur une question ou une proposition.
export async function CommentThread({
  target,
  me,
}: {
  target: { questionId: string } | { suggestionId: string };
  me: CurrentContributor;
}) {
  const comments = await prisma.comment.findMany({
    where: "questionId" in target ? { questionId: target.questionId } : { suggestionId: target.suggestionId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { displayName: true } } },
  });

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Pas encore de message. Une source douteuse, une formulation à revoir ? Lance la discussion.
        </p>
      ) : (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border bg-muted/30 p-3">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{c.author.displayName}</span>
                  {" · "}
                  {formatDateTime(c.createdAt)}
                </span>
                {(c.authorId === me.id || hasRole(me.role, "admin")) && (
                  <ActionButton
                    action={deleteCommentAction.bind(null, c.id)}
                    variant="ghost"
                    size="xs"
                    confirm="Supprimer ce message ?"
                  >
                    Supprimer
                  </ActionButton>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      <CommentForm action={addCommentAction.bind(null, target)} />
    </div>
  );
}
