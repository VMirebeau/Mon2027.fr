import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { mapPreviewToPlayer } from "@/lib/content";
import type { Question } from "@/lib/types";
import { PreviewPlayClient } from "./preview-play-client";

/// Aperçu jouable d'une question, ouvert depuis l'espace contributeurs
/// (bouton « Prévisualiser »). Le jeton (256 bits) est l'adresse : pas de
/// compte requis, durée de vie de deux heures. Jamais indexé.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aperçu",
  robots: { index: false, follow: false },
};

async function loadPreview(token: string): Promise<Question | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await prisma.questionPreview.findUnique({ where: { id: token } });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  try {
    return mapPreviewToPlayer(JSON.parse(row.data));
  } catch {
    return null;
  }
}

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const question = await loadPreview(token);
  if (!question) notFound();
  return <PreviewPlayClient question={question} />;
}
