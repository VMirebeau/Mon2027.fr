"use server";

import { revalidatePath } from "next/cache";
import { appRedirect } from "@/lib/redirect";
import { prisma } from "@/lib/db";
import { questionSchema } from "@/lib/schema";
import { parseFormData, toPersistence, toSources } from "@/lib/question-form-data";
import { requireContributor } from "@/lib/auth/session";
import {
  canChangeIdentifiers,
  canDeleteQuestion,
  canEditQuestion,
  canPublishDirectly,
  selectableStatuts,
} from "@/lib/auth/roles";
import { contentChanged, contentHash, diffQuestion } from "@/lib/content-hash";
import { lastContentAuthorId } from "@/lib/workflow";
import { preparePublication } from "@/lib/publication";
import type { PublishMeta } from "@/lib/validation-status";


export type ActionResult = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  /// Après un enregistrement : nouvelle version (updatedAt, ms), que le
  /// formulaire reprend comme base de son verrou optimiste.
  version?: string;
};

function validationErrors(issues: { path: PropertyKey[]; message: string }[]): ActionResult {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    if (!errors[path]) errors[path] = issue.message;
  }
  // Pas « Validation échouée » : confusion avec la validation par un relecteur.
  return { ok: false, errors, message: "Le formulaire contient des erreurs" };
}

/// Contraintes d'unicité violées (customId, slug) : message lisible plutôt
/// qu'une erreur 500.
function uniqueViolation(e: unknown): ActionResult | null {
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== "P2002") return null;
  const target = [].concat((err.meta?.target ?? []) as never).join(", ");
  const field = target.includes("slug") ? "slug" : "customId";
  return {
    ok: false,
    errors: { [field]: "Déjà utilisé par une autre question." },
    message: field === "slug" ? "Adresse courte déjà utilisée" : "Code déjà utilisé",
  };
}

export async function createQuestionAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireContributor();
  const raw = parseFormData(formData);
  if (typeof raw.auteur !== "string" || raw.auteur.trim() === "") raw.auteur = me.displayName;

  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) return validationErrors(parsed.error.issues);
  const data = parsed.data;
  const persistence = toPersistence(data);
  const sources = toSources(data);

  if (!selectableStatuts(me.role).includes(persistence.statut)) {
    return { ok: false, errors: { statut: "Ce statut est réservé aux relecteurs." } };
  }
  const directPublish = persistence.statut === "publie";
  if (directPublish && !canPublishDirectly(me.role)) {
    const msg =
      "Une nouvelle question doit être validée par un relecteur avant publication : choisis le statut « En revue » pour demander une relecture.";
    return { ok: false, errors: { statut: msg }, message: msg };
  }

  let createdId: string;
  try {
    const created = await prisma.question.create({
      data: {
        ...persistence,
        ...(directPublish
          ? { valideurs: JSON.stringify([me.displayName]), dateValidation: new Date(), datePublication: new Date() }
          : {}),
        sources: { create: sources },
        revisions: {
          create: {
            contributorId: me.id,
            kind: "creation",
            contentHash: contentHash(persistence, sources),
          },
        },
      },
    });
    createdId = created.id;
  } catch (e) {
    const unique = uniqueViolation(e);
    if (unique) return unique;
    throw e;
  }

  revalidatePath("/");
  return appRedirect(`/questions/${createdId}`);
}

export async function updateQuestionAction(
  id: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireContributor();
  const existing = await prisma.question.findUnique({
    where: { id },
    include: { sources: true, validations: true },
  });
  if (!existing) return { ok: false, message: "Question introuvable (supprimée entre-temps ?)." };

  if (!canEditQuestion(me.role, existing.statut)) {
    return {
      ok: false,
      message: "Seul un relecteur peut modifier une question publiée ou retirée. Propose ta modification dans la discussion.",
    };
  }

  // Verrou optimiste : refuse d'écraser le travail d'un autre contributeur
  // enregistré pendant que ce formulaire était ouvert.
  const base = formData.get("baseVersion");
  if (typeof base === "string" && base && base !== String(existing.updatedAt.getTime())) {
    const last = await prisma.questionRevision.findFirst({
      where: { questionId: id },
      orderBy: { createdAt: "desc" },
      include: { contributor: { select: { displayName: true } } },
    });
    const intro =
      last?.contributorId === me.id
        ? "Cette question a changé depuis l'ouverture du formulaire (par toi, dans un autre onglet ou depuis le panneau)"
        : `${last?.contributor?.displayName ?? "Quelqu'un"} a modifié cette question pendant que tu l'éditais`;
    // Le formulaire n'est plus réinitialisé après un échec (cf.
    // submit-without-reset) : la saisie est bien encore là à recopier.
    return {
      ok: false,
      message: `${intro}. Rien n'a été enregistré, mais tes modifications sont toujours dans le formulaire : copie celles qui comptent, recharge la page pour voir la nouvelle version, puis réapplique-les.`,
    };
  }

  const parsed = questionSchema.safeParse(parseFormData(formData));
  if (!parsed.success) return validationErrors(parsed.error.issues);
  const data = parsed.data;
  const persistence = toPersistence(data);
  const sources = toSources(data);

  if (persistence.statut !== existing.statut && !selectableStatuts(me.role).includes(persistence.statut)) {
    return { ok: false, errors: { statut: "Ce statut est réservé aux relecteurs." } };
  }

  // Code et adresse courte d'une question qui a été en ligne : figés (le
  // formulaire les grise, mais la règle qui fait foi est ici).
  if (!canChangeIdentifiers(me.role, existing)) {
    const locked: Record<string, string> = {};
    const why = "Question déjà publiée : les réponses et défis des joueurs y font référence. Seul le superadmin peut le changer.";
    if (persistence.customId !== existing.customId) locked.customId = why;
    if (persistence.slug !== existing.slug) locked.slug = why;
    if (Object.keys(locked).length > 0) {
      return { ok: false, errors: locked, message: "Le code et l'adresse courte d'une question publiée ne changent plus." };
    }
  }

  const changes = diffQuestion(existing, existing.sources, persistence, sources);
  if (Object.keys(changes).length === 0) return { ok: true, message: "Aucun changement" };

  const hash = contentHash(persistence, sources);
  const changedContent = contentChanged(changes);
  const publishing = persistence.statut === "publie" && existing.statut !== "publie";
  let publishMeta: PublishMeta | null = null;

  if (publishing) {
    const lastAuthor = changedContent ? me.id : await lastContentAuthorId(id);
    const prep = await preparePublication(me, {
      contentHash: hash,
      lastContentAuthorId: lastAuthor,
      validations: existing.validations,
    });
    if ("blocker" in prep) return { ok: false, errors: { statut: prep.blocker }, message: prep.blocker };
    publishMeta = prep.meta;
  }

  let version: string;
  try {
    const [, updated] = await prisma.$transaction([
      prisma.source.deleteMany({ where: { questionId: id } }),
      prisma.question.update({
        where: { id },
        data: { ...persistence, ...publishMeta, sources: { create: sources } },
      }),
      prisma.questionRevision.create({
        data: {
          questionId: id,
          contributorId: me.id,
          kind: changedContent ? "modification" : "statut",
          changes: JSON.stringify(changes),
          contentHash: hash,
        },
      }),
    ]);
    version = String(updated.updatedAt.getTime());
  } catch (e) {
    const unique = uniqueViolation(e);
    if (unique) return unique;
    throw e;
  }

  revalidatePath("/");
  revalidatePath(`/questions/${id}`);
  return {
    ok: true,
    version,
    message: publishing
      ? "Publiée"
      : changedContent && existing.validations.length > 0
        ? "Enregistré : le contenu a changé, les validations précédentes ne comptent plus"
        : "Enregistré",
  };
}

export async function deleteQuestionAction(id: string): Promise<ActionResult> {
  const me = await requireContributor();
  const q = await prisma.question.findUnique({ where: { id }, select: { statut: true } });
  if (!q) return { ok: false, message: "Question introuvable." };
  if (!canDeleteQuestion(me.role, q.statut)) {
    return {
      ok: false,
      message:
        q.statut === "publie"
          ? "Une question publiée ne se supprime pas (des joueurs y ont peut-être répondu) : passe-la en « Retiré ». Seul le superadmin peut la supprimer."
          : "Seul un admin peut supprimer une question.",
    };
  }
  await prisma.question.delete({ where: { id } });
  revalidatePath("/");
  return appRedirect("/");
}
