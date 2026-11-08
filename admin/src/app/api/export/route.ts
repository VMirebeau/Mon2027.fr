import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentContributor } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await getCurrentContributor();
  if (!me || me.mustChangePassword) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  }
  // Export de toute la banque (brouillons compris avec ?all=1) : réservé aux
  // admins et au-dessus, comme le bouton de la liste.
  if (!hasRole(me.role, "admin")) {
    return NextResponse.json({ error: "Export réservé aux admins" }, { status: 403 });
  }
  const url = new URL(request.url);
  const includeAll = url.searchParams.get("all") === "1";

  const questions = await prisma.question.findMany({
    where: includeAll ? undefined : { statut: "publie" },
    orderBy: [{ theme: "asc" }, { customId: "asc" }],
    include: {
      sources: { orderBy: { ordre: "asc" } },
    },
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    count: questions.length,
    scope: includeAll ? "all" : "published",
    questions: questions.map((q) => ({
      id: q.id,
      customId: q.customId,
      theme: q.theme,
      sousTheme: q.sousTheme,
      format: q.format,
      statut: q.statut,
      sensibilite: q.sensibilite,
      difficulte: q.difficulte,
      question: q.question,
      precisions: q.precisions,
      explication: q.explication,
      contextePedagogique: q.contextePedagogique,
      reponse: q.format === "estimation_numerique"
        ? {
            type: "estimation_numerique",
            unite: q.unite,
            plage: [q.plageMin, q.plageMax],
            reponseCorrecte: q.reponseNumerique,
            toleranceVerte: q.toleranceVerte,
            toleranceOrange: q.toleranceOrange,
          }
        : {
            type: q.format,
            ...(q.payload ? safeJsonParse(q.payload) : {}),
          } as Record<string, unknown>,
      dateDonnee: q.dateDonnee,
      auteur: q.auteur,
      valideurs: q.valideurs,
      sources: q.sources.map((s) => ({
        nom: s.nom,
        url: s.url,
        type: s.type,
      })),
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
      dateValidation: q.dateValidation?.toISOString() ?? null,
      datePublication: q.datePublication?.toISOString() ?? null,
    })),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { _raw: s };
  }
}
