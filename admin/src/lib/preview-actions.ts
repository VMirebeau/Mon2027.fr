"use server";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireContributor } from "@/lib/auth/session";
import { questionSchema } from "@/lib/schema";
import { parseFormData, toPersistence, toSources } from "@/lib/question-form-data";

/// Aperçu jouable : copie l'état ACTUEL du formulaire (même non enregistré)
/// dans QuestionPreview, et renvoie l'adresse où le player le rend
/// (/apercu/<jeton>). Rien n'est enregistré dans la question, rien n'est
/// publié ; côté player, l'aperçu ne compte ni dans les statistiques ni dans
/// la progression.

const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

export type PreviewResult = { ok: true; url: string } | { ok: false; error: string };

/// Base du player. En production, player et espace contributeurs partagent
/// le domaine (admin sous /admin) : chemin relatif. En local, ils tournent
/// sur deux ports : PLAYER_URL (ex. https://localhost:2028) dans admin/.env.
function playerBaseUrl(): string {
  return (process.env.PLAYER_URL ?? "").replace(/\/+$/, "");
}

export async function createQuestionPreview(formData: FormData): Promise<PreviewResult> {
  const me = await requireContributor();
  const raw = parseFormData(formData);
  if (typeof raw.auteur !== "string" || raw.auteur.trim() === "") raw.auteur = me.displayName;

  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `Aperçu impossible tant que le formulaire est incomplet : ${first?.message ?? "champ invalide"}.`,
    };
  }

  const data = { ...toPersistence(parsed.data), sources: toSources(parsed.data) };
  const id = randomBytes(32).toString("base64url");
  const now = Date.now();
  await prisma.$transaction([
    // Ménage au passage : les aperçus ne servent que quelques minutes.
    prisma.questionPreview.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
    prisma.questionPreview.create({
      data: {
        id,
        data: JSON.stringify(data),
        contributorId: me.id,
        expiresAt: new Date(now + PREVIEW_TTL_MS),
      },
    }),
  ]);
  return { ok: true, url: `${playerBaseUrl()}/apercu/${id}` };
}
