import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import {
  THEMES,
  STATUTS,
  SENSIBILITES,
  FORMATS,
} from "@/lib/constants";
import {
  buildOrderBy,
  buildWhere,
  describeFilters,
  hasAnyFilter,
  pickFilters,
  toSearchParams,
} from "@/lib/queries";
import { Plus, Download, X, ListChecks, MessageSquare, ClipboardCheck } from "lucide-react";
import { DeleteQuestionButton } from "./questions/_components/DeleteQuestionButton";
import { FilterSelect } from "./_components/FilterSelect";
import { QuestionRow } from "./_components/QuestionRow";
import { requireContributor } from "@/lib/auth/session";
import { canDeleteQuestion, canPublishDirectly, hasRole } from "@/lib/auth/roles";
import { PublishDraftsButton } from "./_components/PublishDraftsButton";
import { awaitingValidationIds, VALIDATION_INCLUDE, validationStatuses } from "@/lib/validation-queue";
import { awaitsValidation, type VersionValidation } from "@/lib/validation-status";

/// Ligne « validation » sous le statut : qui a validé la version actuelle,
/// ou si les validations existantes portent sur une version précédente.
function ValidationLine({ status }: { status: VersionValidation }) {
  if (status.kind === "validee") {
    const [first, ...others] = status.validators;
    return (
      <span
        className="mt-1 block text-xs text-emerald-800 dark:text-emerald-400"
        title={`Validée par ${status.validators.join(", ")}`}
      >
        ✓ {first}
        {others.length > 0 && ` +${others.length}`}
      </span>
    );
  }
  if (status.kind === "caduque") {
    return (
      <span
        className="mt-1 block text-xs text-amber-800 dark:text-amber-400"
        title="Le contenu a changé depuis la dernière validation"
      >
        validation caduque
      </span>
    );
  }
  return null;
}

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireContributor();
  const sp = await searchParams;
  const filters = pickFilters(sp);
  const where = buildWhere(filters);
  const orderBy = buildOrderBy(filters.sort);

  // Superadmin : brouillons visibles avec les filtres en cours, pour le bouton
  // « Publier les brouillons » (liste figée au rendu, cf. publishDraftsAction).
  const draftsQuery = canPublishDirectly(me.role)
    ? prisma.question.findMany({ where: { AND: [where, { statut: "brouillon" }] }, select: { id: true } })
    : Promise.resolve([] as { id: string }[]);

  const [rows, total, byStatut, awaiting, drafts] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy,
      include: { ...VALIDATION_INCLUDE, _count: { select: { comments: true } } },
    }),
    prisma.question.count(),
    prisma.question.groupBy({ by: ["statut"], _count: true }),
    awaitingValidationIds(),
    draftsQuery,
  ]);
  const statuses = await validationStatuses(rows, where);
  const statusOf = (id: string): VersionValidation => statuses.get(id) ?? { kind: "aucune" };
  // Vue « À valider » : buildWhere n'a gardé que le statut « En revue », le
  // reste dépend de l'empreinte du contenu.
  const questions =
    filters.vue === "a-valider" ? rows.filter((q) => awaitsValidation(q.statut, statusOf(q.id))) : rows;

  const counts = Object.fromEntries(byStatut.map((s) => [s.statut, s._count]));
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  // Bascule de la vue « À valider » en gardant les autres filtres.
  const queueToggle = new URLSearchParams(toSearchParams(filters));
  if (filters.vue === "a-valider") queueToggle.delete("vue");
  else queueToggle.set("vue", "a-valider");
  const queueToggleQs = queueToggle.toString();
  const anyFilter = hasAnyFilter(filters);
  const reviewQs = toSearchParams(filters).toString();
  const linkSuffix = reviewQs ? `?${reviewQs}` : "";
  // Colonne de suppression : seulement pour qui peut supprimer (admin et +).
  const canDeleteAny = hasRole(me.role, "admin");
  // Périmètre du bouton « Publier les brouillons » (le filtre de statut est
  // implicite : ce sont des brouillons).
  const narrowing = { theme: filters.theme, sensibilite: filters.sensibilite, format: filters.format };
  const draftScope = narrowing.theme || narrowing.sensibilite || narrowing.format ? describeFilters(narrowing) : null;
  const columnCount = canDeleteAny ? 6 : 5;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mon2027 · Banque de questions</h1>
          <p className="text-sm text-muted-foreground">
            {plural(total, "question", "questions")} · {plural(counts.publie ?? 0, "publiée", "publiées")} ·{" "}
            {counts.revue ?? 0} en revue{awaiting.size > 0 && ` (${awaiting.size} à valider)`} ·{" "}
            {plural(counts.brouillon ?? 0, "brouillon", "brouillons")}
            {(counts.retire ?? 0) > 0 && ` · ${plural(counts.retire ?? 0, "retirée", "retirées")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {drafts.length > 0 && (
            <PublishDraftsButton draftIds={drafts.map((d) => d.id)} scope={draftScope} />
          )}
          {/* Export complet de la banque : réservé aux admins (la route
              vérifie aussi). <a> brut (téléchargement) : Next n'y ajoute pas
              le basePath. */}
          {hasRole(me.role, "admin") && (
            <a
              href={`${process.env.NEXT_BASE_PATH ?? ""}/api/export`}
              download="mon2027-questions.json"
              className={buttonVariants({ variant: "outline" })}
            >
              <Download className="mr-1 h-4 w-4" /> Exporter JSON
            </a>
          )}
          <Link href="/questions/new" className={buttonVariants()}>
            <Plus className="mr-1 h-4 w-4" /> Nouvelle question
          </Link>
        </div>
      </header>

      {/* Filtres */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Link
            href={queueToggleQs ? `/?${queueToggleQs}` : "/"}
            className={buttonVariants({ variant: filters.vue === "a-valider" ? "default" : "outline", size: "sm" })}
            title="Questions en revue dont la version actuelle n'a pas encore de validation"
          >
            <ClipboardCheck className="mr-1 h-4 w-4" /> À valider
            <span className="ml-1 opacity-70">{awaiting.size}</span>
          </Link>
          <FilterSelect
            name="theme"
            label="Thème"
            current={filters.theme}
            options={THEMES.map((t) => ({ value: t, label: t }))}
            sp={filters as Record<string, string | undefined>}
          />
          <FilterSelect
            name="statut"
            label="Statut"
            current={filters.statut}
            options={STATUTS.map((s) => ({ value: s.value, label: s.label }))}
            sp={filters as Record<string, string | undefined>}
          />
          <FilterSelect
            name="sensibilite"
            label="Sensibilité"
            current={filters.sensibilite}
            options={SENSIBILITES.map((s) => ({ value: s.value, label: s.label }))}
            sp={filters as Record<string, string | undefined>}
          />
          <FilterSelect
            name="format"
            label="Format"
            current={filters.format}
            options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
            sp={filters as Record<string, string | undefined>}
          />
          <FilterSelect
            name="sort"
            label="Tri"
            current={filters.sort}
            options={[
              { value: "newest", label: "Plus récent" },
              { value: "oldest", label: "Plus ancien" },
              { value: "updated", label: "Modifié récemment" },
              { value: "theme", label: "Par thème" },
            ]}
            sp={filters as Record<string, string | undefined>}
          />
          <div className="flex-1" />
          {questions.length > 0 && anyFilter && (
            <Link
              href={`/questions/${questions[0].id}${linkSuffix}`}
              className={buttonVariants({ variant: "default", size: "sm" })}
              title="Ouvrir la première question en mode revue"
            >
              <ListChecks className="mr-1 h-4 w-4" /> Réviser ces {questions.length}
            </Link>
          )}
          {anyFilter && (
            <Link
              href="/"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <X className="mr-1 h-4 w-4" /> Effacer
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Table : la question prend la place ; les autres colonnes restent
          étroites et se masquent sur petit écran (leur contenu passe sous la
          question). Sur un écran vraiment trop étroit, le tableau défile dans
          son cadre (conteneur overflow-x-auto de <Table>). */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead className="hidden w-40 md:table-cell">Thème</TableHead>
              <TableHead className="hidden w-36 lg:table-cell">Format</TableHead>
              <TableHead className="w-28 sm:w-32">Statut</TableHead>
              <TableHead className="hidden w-24 md:table-cell">Modifiée</TableHead>
              {canDeleteAny && (
                <TableHead className="w-12">
                  <span className="sr-only">Supprimer</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="py-16 text-center text-muted-foreground"
                >
                  {filters.vue === "a-valider" ? (
                    "Rien à valider pour l'instant."
                  ) : anyFilter ? (
                    "Aucune question ne correspond à ces filtres."
                  ) : (
                    <>
                      Aucune question. Commence par en{" "}
                      <Link
                        href="/questions/new"
                        className="text-foreground underline"
                      >
                        créer une
                      </Link>
                      .
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              questions.map((q) => {
                const statut = STATUTS.find((s) => s.value === q.statut);
                const sensibilite = SENSIBILITES.find(
                  (s) => s.value === q.sensibilite
                );
                const format = FORMATS.find((f) => f.value === q.format);
                const href = `/questions/${q.id}${linkSuffix}`;
                const comments = q._count.comments;
                return (
                  <QuestionRow key={q.id} href={href}>
                    <TableCell className="py-3 whitespace-normal">
                      <Link
                        href={href}
                        data-row-link
                        className="rounded-sm leading-snug font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {q.question}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {q.customId && <span className="font-mono">{q.customId}</span>}
                        <span className="md:hidden">{q.theme}</span>
                        <span className="lg:hidden">{format?.label ?? q.format}</span>
                        {q.sensibilite !== "standard" && sensibilite && (
                          <Badge className={sensibilite.color} variant="secondary">
                            Sensibilité {sensibilite.label.toLowerCase()}
                          </Badge>
                        )}
                        {q.sources.length === 0 ? (
                          <span className="text-amber-800 dark:text-amber-400">Aucune source</span>
                        ) : (
                          <span>{plural(q.sources.length, "source", "sources")}</span>
                        )}
                        {comments > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                            {plural(comments, "message", "messages")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm whitespace-normal md:table-cell">
                      {q.theme}
                      {q.sousTheme && (
                        <span className="block text-xs text-muted-foreground">{q.sousTheme}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs whitespace-normal text-muted-foreground lg:table-cell">
                      {format?.label ?? q.format}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Badge className={statut?.color}>{statut?.label ?? q.statut}</Badge>
                      <ValidationLine status={statusOf(q.id)} />
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {q.updatedAt.toLocaleDateString("fr-FR")}
                    </TableCell>
                    {canDeleteAny && (
                      <TableCell className="text-right">
                        {canDeleteQuestion(me.role, q.statut) && (
                          <DeleteQuestionButton id={q.id} published={q.statut === "publie"} />
                        )}
                      </TableCell>
                    )}
                  </QuestionRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
