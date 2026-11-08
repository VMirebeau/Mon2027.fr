import { prisma } from "@/lib/db";
import type { CurrentContributor } from "@/lib/auth/session";
import {
  canPublishDirectly,
  canValidate,
  canValidateVersion,
  countingValidations,
} from "@/lib/auth/roles";
import { contentHash } from "@/lib/content-hash";
import {
  publishQuestionAction,
  requestReviewAction,
  unvalidateQuestionAction,
  validateAndPublishQuestionAction,
  validateQuestionAction,
} from "@/lib/collab-actions";
import { publishedBeforeValidations } from "@/lib/validation-status";
import {
  FIELD_LABELS,
  lastContentAuthorId,
  REVISION_LABELS,
  SUGGESTION_KINDS,
  SUGGESTION_STATUTS,
} from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "../../_components/ActionButton";
import { CommentThread } from "../../_components/CommentThread";
import { formatDateTime, isHttpUrl, previewValue } from "../../_components/format";
import { GuardedLink } from "./GuardedLink";
import { WorkflowButton } from "./WorkflowButton";

/// Propositions des joueurs affichées en entier dans le panneau ; au-delà,
/// lien vers la liste filtrée sur cette question.
const PANEL_SUGGESTIONS = 5;

/// Colonne de travail collectif à côté du formulaire : validation de la
/// version courante, propositions des joueurs, discussion, historique.
export async function CollaborationPanel({ questionId, me }: { questionId: string; me: CurrentContributor }) {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      sources: true,
      validations: { include: { contributor: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } },
      revisions: {
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { contributor: { select: { displayName: true } } },
      },
    },
  });
  if (!q) return null;

  const hash = contentHash(q, q.sources);
  const [lastAuthor, contributorRevisions] = await Promise.all([
    lastContentAuthorId(questionId),
    prisma.questionRevision.count({ where: { questionId, contributorId: { not: null } } }),
  ]);
  const counting = countingValidations({ contentHash: hash, lastContentAuthorId: lastAuthor, validations: q.validations });
  const countingIds = new Set(counting.map((v) => v.id));
  const stale = q.validations.filter((v) => v.contentHash !== hash);
  const mine = q.validations.find((v) => v.contributorId === me.id);
  const mineIsCurrent = mine?.contentHash === hash;

  const isPublished = q.statut === "publie";
  const validated = counting.length > 0;
  const reviewer = canValidate(me.role);
  const superadmin = canPublishDirectly(me.role);
  const canValidateHere = canValidateVersion({ role: me.role, contributorId: me.id, lastContentAuthorId: lastAuthor });
  const legacy = publishedBeforeValidations({
    statut: q.statut,
    validationsCount: q.validations.length,
    contributorRevisionsCount: contributorRevisions,
  });

  const suggestionWhere = q.customId ? { questionCustomId: q.customId } : null;
  const [suggestions, suggestionsTotal] = suggestionWhere
    ? await Promise.all([
        prisma.suggestion.findMany({ where: suggestionWhere, orderBy: { createdAt: "desc" }, take: PANEL_SUGGESTIONS }),
        prisma.suggestion.count({ where: suggestionWhere }),
      ])
    : ([[], 0] as const);
  const allSuggestionsHref = q.customId
    ? `/suggestions?${new URLSearchParams({ question: q.customId, vue: "toutes" }).toString()}`
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Validation de cette version</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {counting.length > 0 ? (
            <ul className="space-y-1">
              {q.validations
                .filter((v) => countingIds.has(v.id))
                .map((v) => (
                  <li key={v.id} className="text-emerald-800">
                    ✓ Validée par <strong>{v.contributor.displayName}</strong>{" "}
                    <span className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
                  </li>
                ))}
            </ul>
          ) : legacy ? (
            <p className="text-muted-foreground">
              Publiée avant la mise en place des validations
              {q.revisions.some((r) => r.kind === "import") && " (ou importée depuis le poste local)"}
              {" : aucune relecture n'est enregistrée pour cette version."}
            </p>
          ) : isPublished ? (
            <p className="text-amber-800">
              {stale.length > 0
                ? "Publiée, mais modifiée depuis sa dernière validation : cette version n'a pas été relue."
                : "Publiée sans validation enregistrée (publication directe)."}
            </p>
          ) : (
            <p className="text-muted-foreground">Cette version n&apos;a pas encore été validée.</p>
          )}
          {stale.length > 0 && (
            <p className="text-xs text-amber-800">
              {stale.length} validation{stale.length > 1 ? "s" : ""} sur une version précédente (
              {stale.map((v) => v.contributor.displayName).join(", ")}) : le contenu a changé depuis.
            </p>
          )}

          {/* Circuit : demander une relecture → valider → publier. Les boutons
              portent sur la version enregistrée (bloqués si le formulaire a
              des modifications en cours, cf. WorkflowButton). */}
          <div className="flex flex-wrap gap-2">
            {!isPublished && reviewer && (validated || superadmin) && (
              <WorkflowButton
                action={publishQuestionAction.bind(null, q.id, hash)}
                variant="default"
                confirm={
                  validated
                    ? undefined
                    : "Publier sans validation par un relecteur ? En tant que superadmin, tu en es le garant."
                }
              >
                Publier
              </WorkflowButton>
            )}
            {!isPublished && !validated && !superadmin && canValidateHere && (
              <WorkflowButton action={validateAndPublishQuestionAction.bind(null, q.id, hash)} variant="default">
                Valider et publier
              </WorkflowButton>
            )}
            {reviewer &&
              (mineIsCurrent ? (
                <ActionButton action={unvalidateQuestionAction.bind(null, q.id)}>Retirer ma validation</ActionButton>
              ) : canValidateHere ? (
                <WorkflowButton action={validateQuestionAction.bind(null, q.id, hash)}>
                  {isPublished || validated || superadmin ? "Valider cette version" : "Valider sans publier"}
                </WorkflowButton>
              ) : null)}
            {q.statut === "brouillon" && (
              <WorkflowButton
                action={requestReviewAction.bind(null, q.id)}
                variant={reviewer && canValidateHere ? "outline" : "default"}
              >
                Demander une relecture
              </WorkflowButton>
            )}
          </div>

          {/* Consignes : une seule formulation du circuit partout (« demander
              une relecture » = passer « En revue »). */}
          {!isPublished && reviewer && !canValidateHere && !validated && !superadmin && (
            <p className="text-xs text-muted-foreground">
              Tu as fait la dernière modification du contenu : un autre relecteur doit la valider
              {q.statut === "revue"
                ? " (elle est dans sa file « À valider »)."
                : q.statut === "brouillon"
                  ? ". Demande une relecture."
                  : "."}
            </p>
          )}
          {!reviewer && q.statut === "brouillon" && (
            <p className="text-xs text-muted-foreground">
              Quand elle est prête, demande une relecture : elle passera « En revue » et un relecteur pourra la
              valider puis la publier.
            </p>
          )}
          {!reviewer && q.statut === "revue" && (
            <p className="text-xs text-muted-foreground">
              {validated
                ? "Validée : un relecteur peut maintenant la publier."
                : "Relecture demandée : elle attend la validation d'un relecteur (autre que l'auteur de la dernière modification)."}
            </p>
          )}
          {!reviewer && q.statut === "retire" && (
            <p className="text-xs text-muted-foreground">Retirée : seul un relecteur peut la republier.</p>
          )}
          {!isPublished && superadmin && !validated && (
            <p className="rounded-md bg-violet-50 p-2 text-xs text-violet-900">
              Superadmin : tu peux publier directement, sans validation.
            </p>
          )}
          {isPublished && q.datePublication && (
            <p className="text-xs text-muted-foreground">Publiée le {formatDateTime(q.datePublication)}.</p>
          )}
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Propositions des joueurs ({suggestionsTotal})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-3 text-sm">
              {suggestions.map((s) => {
                const st = SUGGESTION_STATUTS.find((x) => x.value === s.status);
                return (
                  <li key={s.id} className="space-y-1.5 rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge className={st?.color}>{st?.label}</Badge>
                      <span>
                        {SUGGESTION_KINDS.find((k) => k.value === s.kind)?.label} · {formatDateTime(s.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{s.message}</p>
                    {s.sourceUrl && (
                      <p className="text-xs">
                        Source proposée :{" "}
                        {isHttpUrl(s.sourceUrl) ? (
                          <a
                            href={s.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="break-all underline"
                          >
                            {s.sourceUrl}
                          </a>
                        ) : (
                          <span className="break-all">{s.sourceUrl}</span>
                        )}
                      </p>
                    )}
                    <GuardedLink href={`/suggestions/${s.id}`} className="inline-block text-xs underline">
                      Traiter ou discuter cette proposition
                    </GuardedLink>
                  </li>
                );
              })}
            </ul>
            {allSuggestionsHref && suggestionsTotal > suggestions.length && (
              <GuardedLink href={allSuggestionsHref} className="inline-block text-sm underline">
                Voir les {suggestionsTotal} propositions sur cette question
              </GuardedLink>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread target={{ questionId: q.id }} me={me} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique</CardTitle>
        </CardHeader>
        <CardContent>
          {q.revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune modification enregistrée depuis la mise en place de l&apos;historique.
            </p>
          ) : (
            <ol className="space-y-2 text-sm">
              {q.revisions.map((r) => {
                const changes: Record<string, [unknown, unknown]> = r.changes ? JSON.parse(r.changes) : {};
                const fields = Object.keys(changes);
                const who = r.contributor?.displayName ?? (r.kind === "import" ? "Import local" : "Compte supprimé");
                return (
                  <li key={r.id} className="border-l-2 pl-3">
                    <div>
                      <strong>{who}</strong> {r.kind === "import" ? "a mis à jour" : REVISION_LABELS[r.kind] ?? r.kind}
                      {fields.length > 0 && ` : ${fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</div>
                    {fields.length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Détail</summary>
                        <dl className="mt-1 space-y-1">
                          {fields.map((f) => (
                            <div key={f}>
                              <dt className="font-medium">{FIELD_LABELS[f] ?? f}</dt>
                              <dd className="text-rose-800 line-through decoration-rose-300">
                                {previewValue(changes[f][0])}
                              </dd>
                              <dd className="text-emerald-800">{previewValue(changes[f][1])}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
