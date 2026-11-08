import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { QuestionForm } from "../_components/QuestionForm";
import { DeleteQuestionButton } from "../_components/DeleteQuestionButton";
import { DirtyProvider } from "../_components/DirtyProvider";
import { GuardedLink } from "../_components/GuardedLink";
import { updateQuestionAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { FormatValue } from "@/lib/constants";
import {
  buildOrderBy,
  buildWhere,
  describeFilters,
  hasAnyFilter,
  pickFilters,
  toSearchParams,
} from "@/lib/queries";
import { ArrowLeft } from "lucide-react";
import { requireContributor } from "@/lib/auth/session";
import {
  canChangeIdentifiers,
  canDeleteQuestion,
  canEditQuestion,
  selectableStatuts,
} from "@/lib/auth/roles";
import { filteredQuestionIds } from "@/lib/validation-queue";
import { CollaborationPanel } from "../_components/CollaborationPanel";
import { INDICATORS, MAX_INDICATORS_PER_QUESTION, type IndicatorId } from "@/lib/constants";
import type { IndicatorRow } from "../_components/IndicatorsEditor";

export const dynamic = "force-dynamic";

const INDICATOR_VALUES = new Set<string>(INDICATORS.map((i) => i.value));

/// Parser tolérant du JSON `Question.indicators` côté admin. Aligné sur
/// `parseQuestionIndicators` côté player : on filtre silencieusement les
/// entrées corrompues pour ne pas casser le formulaire si la DB contient
/// des reliquats. Cap à MAX_INDICATORS_PER_QUESTION.
function parseIndicators(json: string | null): IndicatorRow[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: IndicatorRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { id?: unknown }).id;
      const pol = (item as { polarity?: unknown }).polarity;
      if (typeof id !== "string" || !INDICATOR_VALUES.has(id)) continue;
      if (pol !== 1 && pol !== -1) continue;
      out.push({ id: id as IndicatorId, polarity: pol });
      if (out.length >= MAX_INDICATORS_PER_QUESTION) break;
    }
    return out;
  } catch {
    return [];
  }
}

export default async function EditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireContributor();
  const { id } = await params;
  const sp = await searchParams;
  const filters = pickFilters(sp);
  const reviewMode = hasAnyFilter(filters) || !!filters.sort;

  const question = await prisma.question.findUnique({
    where: { id },
    include: { sources: { orderBy: { ordre: "asc" } } },
  });
  if (!question) notFound();

  let nav: null | {
    current: number | null;
    total: number;
    prevId: string | null;
    nextId: string | null;
    outOfFilter: boolean;
  } = null;

  if (reviewMode) {
    // Ids filtrés dans l'ordre de tri, vue « À valider » comprise (elle se
    // calcule après chargement, d'où l'aide commune à la liste).
    const filtered = await filteredQuestionIds(filters);
    const idxInFilter = filtered.indexOf(id);
    const outOfFilter = idxInFilter === -1;

    // Si la question courante n'est plus dans le filtre (ex: brouillon passé
    // en publié), on construit une liste virtuelle filter ∪ {current} pour
    // que prev/next aient toujours du sens.
    let navList = filtered;
    if (outOfFilter) {
      const inFilter = new Set(filtered);
      const candidates = await prisma.question.findMany({
        where: { OR: [buildWhere(filters), { id }] },
        orderBy: buildOrderBy(filters.sort),
        select: { id: true },
      });
      navList = candidates.map((q) => q.id).filter((x) => x === id || inFilter.has(x));
    }

    const idx = navList.indexOf(id);
    if (idx !== -1) {
      nav = {
        current: outOfFilter ? null : idxInFilter + 1,
        total: filtered.length,
        prevId: idx > 0 ? navList[idx - 1] : null,
        nextId: idx < navList.length - 1 ? navList[idx + 1] : null,
        outOfFilter,
      };
    }
  }

  const action = updateQuestionAction.bind(null, id);
  const editable = canEditQuestion(me.role, question.statut);

  return (
    <DirtyProvider>
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GuardedLink
            href="/"
            aria-label="Retour à la liste"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </GuardedLink>
          <h1 className="text-2xl font-bold">Modifier la question</h1>
          {question.customId && (
            <span className="font-mono text-sm text-muted-foreground">{question.customId}</span>
          )}
        </div>
        {canDeleteQuestion(me.role, question.statut) && (
          <DeleteQuestionButton
            id={id}
            label="Supprimer"
            variant="outline"
            size="sm"
            published={question.statut === "publie"}
          />
        )}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
      <QuestionForm
        action={action}
        submitLabel="Enregistrer"
        baseVersion={String(question.updatedAt.getTime())}
        statutOptions={selectableStatuts(me.role)}
        readOnlyReason={
          editable
            ? undefined
            : "Question publiée ou retirée : seul un relecteur peut la modifier. Propose ta modification dans la discussion."
        }
        identifiersLockedReason={
          canChangeIdentifiers(me.role, question)
            ? undefined
            : "Figé : la question a été publiée, les réponses et défis des joueurs y font référence. Seul le superadmin peut le changer."
        }
        reviewNav={
          nav
            ? (() => {
                const qs = toSearchParams(filters).toString();
                const suffix = qs ? `?${qs}` : "";
                return {
                  label: describeFilters(filters),
                  current: nav.current,
                  total: nav.total,
                  outOfFilter: nav.outOfFilter,
                  prevHref: nav.prevId
                    ? `/questions/${nav.prevId}${suffix}`
                    : null,
                  nextHref: nav.nextId
                    ? `/questions/${nav.nextId}${suffix}`
                    : null,
                  exitHref: `/${suffix}`,
                };
              })()
            : undefined
        }
        initial={{
          id: question.id,
          customId: question.customId,
          slug: question.slug,
          theme: question.theme,
          sousTheme: question.sousTheme,
          format: question.format as FormatValue,
          statut: question.statut,
          sensibilite: question.sensibilite,
          difficulte: question.difficulte,
          question: question.question,
          precisions: question.precisions,
          explication: question.explication,
          contextePedagogique: question.contextePedagogique,
          unite: question.unite,
          plageMin: question.plageMin,
          plageMax: question.plageMax,
          reponseNumerique: question.reponseNumerique,
          toleranceVerte: question.toleranceVerte,
          toleranceOrange: question.toleranceOrange,
          payload: question.payload,
          dateDonnee: question.dateDonnee,
          auteur: question.auteur,
          valideurs: question.valideurs,
          sources: question.sources.map((s) => ({
            nom: s.nom,
            url: s.url,
            type: s.type as "primaire" | "triangulation",
          })),
          miseEnPerspective: question.miseEnPerspective,
          indicators: parseIndicators(question.indicators),
        }}
      />
      </div>
      <aside className="min-w-0">
        <CollaborationPanel questionId={id} me={me} />
      </aside>
      </div>
    </div>
    </DirtyProvider>
  );
}
