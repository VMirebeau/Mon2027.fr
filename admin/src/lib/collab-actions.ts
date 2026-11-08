"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContributor, type CurrentContributor } from "@/lib/auth/session";
import { canEditQuestion, canPublishDirectly, canValidateVersion, hasRole } from "@/lib/auth/roles";
import { bulkPublishMessage, draftBlocker } from "@/lib/bulk-publish";
import { contentHash } from "@/lib/content-hash";
import { preparePublication } from "@/lib/publication";
import { CONTENT_REVISION_KINDS, latestContentAuthors, type PublishMeta } from "@/lib/validation-status";
import { isSuggestionStatut, lastContentAuthorId } from "@/lib/workflow";

export type CollabResult = { ok: boolean; message?: string } | null;

const MAX_COMMENT = 5000;

// ------------------------------------------------------------------
// Validations et publication
// ------------------------------------------------------------------

const OWN_WORK = "Tu es l'auteur de la dernière modification : un autre relecteur doit la valider.";

/// Charge la question et vérifie que sa version en base est celle que la
/// page affichait (`expectedHash`, empreinte calculée au rendu du panneau) :
/// on ne valide ni ne publie un contenu que la personne n'a pas vu, même si
/// quelqu'un l'a modifié entre l'affichage et le clic.
async function loadDisplayedVersion(questionId: string, expectedHash: string) {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    include: { sources: true, validations: true },
  });
  if (!q) return { error: "Question introuvable." } as const;
  const hash = contentHash(q, q.sources);
  if (hash !== expectedHash) {
    return {
      error: "La question a été modifiée depuis l'affichage de la page : recharge-la et relis la nouvelle version.",
    } as const;
  }
  return { q, hash } as const;
}

/// La question a changé entre la lecture et l'écriture (verrou sur updatedAt
/// ou sur le statut) : on annule toute la transaction.
class StaleVersion extends Error {}

/// Publication depuis le panneau, avec ou sans validation dans le même geste.
/// Mêmes règles et mêmes colonnes que la publication par le formulaire
/// (lib/publication), plus une révision « statut » pour l'historique.
async function publishFromPanel(
  me: CurrentContributor,
  questionId: string,
  expectedHash: string,
  { validateFirst }: { validateFirst: boolean },
): Promise<CollabResult> {
  const loaded = await loadDisplayedVersion(questionId, expectedHash);
  if ("error" in loaded) return { ok: false, message: loaded.error };
  const { q, hash } = loaded;
  if (q.statut === "publie") return { ok: false, message: "Cette question est déjà publiée." };

  const lastAuthor = await lastContentAuthorId(questionId);
  const now = new Date();
  let validations: { contributorId: string; contentHash: string; createdAt: Date }[] = q.validations;
  if (validateFirst) {
    if (!canValidateVersion({ role: me.role, contributorId: me.id, lastContentAuthorId: lastAuthor })) {
      return { ok: false, message: OWN_WORK };
    }
    // La validation qu'on s'apprête à enregistrer compte déjà pour la règle.
    validations = [
      ...q.validations.filter((v) => v.contributorId !== me.id),
      { contributorId: me.id, contentHash: hash, createdAt: now },
    ];
  }
  const prep = await preparePublication(me, { contentHash: hash, lastContentAuthorId: lastAuthor, validations });
  if ("blocker" in prep) return { ok: false, message: prep.blocker };

  try {
    await prisma.$transaction(async (tx) => {
      if (validateFirst) {
        await tx.validation.upsert({
          where: { questionId_contributorId: { questionId, contributorId: me.id } },
          create: { questionId, contributorId: me.id, contentHash: hash, createdAt: now },
          update: { contentHash: hash, createdAt: now },
        });
      }
      const res = await tx.question.updateMany({
        where: { id: questionId, updatedAt: q.updatedAt },
        data: { statut: "publie", ...prep.meta },
      });
      if (res.count !== 1) throw new StaleVersion();
      await tx.questionRevision.create({
        data: {
          questionId,
          contributorId: me.id,
          kind: "statut",
          changes: JSON.stringify({ statut: [q.statut, "publie"] }),
          contentHash: hash,
        },
      });
    });
  } catch (e) {
    if (e instanceof StaleVersion) {
      return { ok: false, message: "La question vient d'être modifiée par quelqu'un d'autre : recharge la page." };
    }
    throw e;
  }

  revalidatePath("/");
  revalidatePath(`/questions/${questionId}`);
  return { ok: true, message: validateFirst ? "Validée et publiée." : "Publiée." };
}

export async function validateQuestionAction(questionId: string, expectedHash: string): Promise<CollabResult> {
  const me = await requireContributor({ minRole: "relecteur" });
  const loaded = await loadDisplayedVersion(questionId, expectedHash);
  if ("error" in loaded) return { ok: false, message: loaded.error };
  const lastAuthor = await lastContentAuthorId(questionId);
  if (!canValidateVersion({ role: me.role, contributorId: me.id, lastContentAuthorId: lastAuthor })) {
    return { ok: false, message: OWN_WORK };
  }
  const { hash } = loaded;
  await prisma.validation.upsert({
    where: { questionId_contributorId: { questionId, contributorId: me.id } },
    create: { questionId, contributorId: me.id, contentHash: hash },
    update: { contentHash: hash, createdAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath(`/questions/${questionId}`);
  return { ok: true, message: "Version validée." };
}

/// « Valider et publier » : un relecteur autorisé (pas l'auteur de la
/// dernière modification) valide la version affichée et la publie d'un geste.
export async function validateAndPublishQuestionAction(
  questionId: string,
  expectedHash: string,
): Promise<CollabResult> {
  const me = await requireContributor({ minRole: "relecteur" });
  return publishFromPanel(me, questionId, expectedHash, { validateFirst: true });
}

/// « Publier » : la version a déjà une validation qui compte, ou la personne
/// est superadmin (publication directe, sans validation).
export async function publishQuestionAction(questionId: string, expectedHash: string): Promise<CollabResult> {
  const me = await requireContributor({ minRole: "relecteur" });
  return publishFromPanel(me, questionId, expectedHash, { validateFirst: false });
}

/// « Demander une relecture » : un brouillon passe « En revue » et entre dans
/// la file « À valider » des relecteurs. Même effet que choisir ce statut dans
/// le formulaire, sans avoir à passer par lui.
export async function requestReviewAction(questionId: string): Promise<CollabResult> {
  const me = await requireContributor();
  const q = await prisma.question.findUnique({ where: { id: questionId }, include: { sources: true } });
  if (!q) return { ok: false, message: "Question introuvable." };
  if (q.statut !== "brouillon") return { ok: false, message: "Seul un brouillon peut être envoyé en relecture." };
  if (!canEditQuestion(me.role, q.statut)) return { ok: false, message: "Action réservée aux relecteurs." };
  try {
    await prisma.$transaction(async (tx) => {
      const res = await tx.question.updateMany({
        where: { id: questionId, statut: "brouillon" },
        data: { statut: "revue" },
      });
      if (res.count !== 1) throw new StaleVersion();
      await tx.questionRevision.create({
        data: {
          questionId,
          contributorId: me.id,
          kind: "statut",
          changes: JSON.stringify({ statut: ["brouillon", "revue"] }),
          contentHash: contentHash(q, q.sources),
        },
      });
    });
  } catch (e) {
    if (e instanceof StaleVersion) return { ok: false, message: "Le statut vient de changer : recharge la page." };
    throw e;
  }
  revalidatePath("/");
  revalidatePath(`/questions/${questionId}`);
  return { ok: true, message: "Relecture demandée : la question est « En revue », dans la file « À valider »." };
}

/// « Publier les brouillons » (superadmin seulement) : publie d'un geste les
/// brouillons listés à l'écran (`draftIds`, calculés au rendu de la page selon
/// les filtres en cours). Chacun passe d'abord les mêmes contrôles que
/// l'enregistrement par le formulaire, plus au moins une source ; ceux qui
/// échouent restent en brouillon et sont nommés dans le message. Une question
/// modifiée ou sortie du statut brouillon depuis l'affichage n'est pas publiée.
export async function publishDraftsAction(draftIds: string[]): Promise<CollabResult> {
  const me = await requireContributor({ minRole: "relecteur" });
  if (!canPublishDirectly(me.role)) {
    return { ok: false, message: "La publication en masse est réservée au superadmin." };
  }
  if (!Array.isArray(draftIds) || draftIds.some((id) => typeof id !== "string")) {
    return { ok: false, message: "Liste de brouillons invalide." };
  }
  const ids = [...new Set(draftIds)];
  if (ids.length === 0) return { ok: false, message: "Aucun brouillon à publier." };

  const drafts = await prisma.question.findMany({
    where: { id: { in: ids }, statut: "brouillon" },
    include: { sources: true, validations: true },
  });
  const revisions = await prisma.questionRevision.findMany({
    where: { questionId: { in: drafts.map((q) => q.id) }, kind: { in: [...CONTENT_REVISION_KINDS] } },
    select: { questionId: true, contributorId: true, kind: true, createdAt: true },
  });
  const authors = latestContentAuthors(revisions);

  const blocked: { label: string; reason: string }[] = [];
  const ready: { q: (typeof drafts)[number]; hash: string; meta: PublishMeta }[] = [];
  for (const q of drafts) {
    const reason = draftBlocker(q);
    if (reason) {
      blocked.push({ label: q.customId ?? q.question.slice(0, 40), reason });
      continue;
    }
    const hash = contentHash(q, q.sources);
    const prep = await preparePublication(me, {
      contentHash: hash,
      lastContentAuthorId: authors.get(q.id) ?? null,
      validations: q.validations,
    });
    if ("blocker" in prep) {
      blocked.push({ label: q.customId ?? q.question.slice(0, 40), reason: prep.blocker });
      continue;
    }
    ready.push({ q, hash, meta: prep.meta });
  }

  let published = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const { q, hash, meta } of ready) {
        // Verrou : même version et toujours en brouillon qu'à la lecture.
        const res = await tx.question.updateMany({
          where: { id: q.id, updatedAt: q.updatedAt, statut: "brouillon" },
          data: { statut: "publie", ...meta },
        });
        if (res.count !== 1) continue;
        await tx.questionRevision.create({
          data: {
            questionId: q.id,
            contributorId: me.id,
            kind: "statut",
            changes: JSON.stringify({ statut: ["brouillon", "publie"] }),
            contentHash: hash,
          },
        });
        published++;
      }
    },
    { timeout: 60_000 },
  );

  revalidatePath("/");
  // Brouillons affichés mais introuvables, modifiés ou déjà sortis du statut
  // brouillon entre l'affichage et le clic.
  const changed = ids.length - published - blocked.length;
  return {
    ok: published > 0,
    message: bulkPublishMessage({ published, blocked, changed }),
  };
}

export async function unvalidateQuestionAction(questionId: string): Promise<CollabResult> {
  const me = await requireContributor({ minRole: "relecteur" });
  await prisma.validation.deleteMany({ where: { questionId, contributorId: me.id } });
  revalidatePath("/");
  revalidatePath(`/questions/${questionId}`);
  return { ok: true, message: "Validation retirée." };
}

// ------------------------------------------------------------------
// Discussion
// ------------------------------------------------------------------

export async function addCommentAction(
  target: { questionId: string } | { suggestionId: string },
  _prev: CollabResult,
  formData: FormData,
): Promise<CollabResult> {
  const me = await requireContributor();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, message: "Message vide." };
  if (body.length > MAX_COMMENT) return { ok: false, message: `${MAX_COMMENT} caractères maximum.` };

  if ("questionId" in target) {
    const exists = await prisma.question.count({ where: { id: target.questionId } });
    if (!exists) return { ok: false, message: "Question introuvable." };
    await prisma.comment.create({ data: { authorId: me.id, questionId: target.questionId, body } });
    revalidatePath(`/questions/${target.questionId}`);
  } else {
    const exists = await prisma.suggestion.count({ where: { id: target.suggestionId } });
    if (!exists) return { ok: false, message: "Proposition introuvable." };
    await prisma.comment.create({ data: { authorId: me.id, suggestionId: target.suggestionId, body } });
    revalidatePath(`/suggestions/${target.suggestionId}`);
  }
  return { ok: true };
}

export async function deleteCommentAction(commentId: string): Promise<CollabResult> {
  const me = await requireContributor();
  const c = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!c) return { ok: false, message: "Message introuvable." };
  if (c.authorId !== me.id && !hasRole(me.role, "admin")) {
    return { ok: false, message: "Tu ne peux supprimer que tes propres messages." };
  }
  await prisma.comment.delete({ where: { id: commentId } });
  if (c.questionId) revalidatePath(`/questions/${c.questionId}`);
  if (c.suggestionId) revalidatePath(`/suggestions/${c.suggestionId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Propositions des joueurs
// ------------------------------------------------------------------

export async function setSuggestionStatusAction(suggestionId: string, status: string): Promise<CollabResult> {
  const me = await requireContributor();
  if (!isSuggestionStatut(status)) return { ok: false, message: "Statut inconnu." };
  const s = await prisma.suggestion.findUnique({ where: { id: suggestionId }, select: { id: true } });
  if (!s) return { ok: false, message: "Proposition introuvable." };
  const closing = status === "acceptee" || status === "refusee";
  await prisma.suggestion.update({
    where: { id: suggestionId },
    data: {
      status,
      handledById: status === "nouvelle" ? null : me.id,
      handledAt: closing ? new Date() : null,
    },
  });
  revalidatePath("/suggestions");
  revalidatePath(`/suggestions/${suggestionId}`);
  return { ok: true };
}
