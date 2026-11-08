import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { parseQuestionIds } from "@/lib/defi";
import { computeThemeFromNames } from "@/lib/defi-loader";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/me/defis-played — défis JOUÉS par l'utilisateur connecté.
 *
 *  Auth requise (401 si pas de session). Liste les DefiResponse dont
 *  `amiUserId === user.id` — c-à-d. les défis auxquels l'utilisateur a
 *  répondu en étant authentifié (set à la soumission, ou via le rétro-claim
 *  côté /d/CODE/resultats quand l'utilisateur crée son compte ensuite).
 *
 *  Symétrique de /api/defis/mine (qui liste les défis créés). Permet un
 *  affichage "Défis joués" cross-device : sans cet endpoint, B perd la trace
 *  de ses défis joués dès qu'il change de navigateur (le clientId
 *  localStorage est device-scoped).
 *
 *  PRIVACY : on n'expose ni `creatorClientId` ni `amiClientId` raw — le
 *  filtrage par userId est suffisant côté serveur, et la page /resultats
 *  fait son propre check d'identité pour l'affichage des réponses détaillées.
 */
export type PlayedDefiSummary = {
  shortCode: string;
  /// Pseudo du créateur tel qu'affiché à l'ami au moment du jeu (snapshot
  /// figé dans Defi.creatorPseudo).
  creatorPseudo: string;
  /// Libellé thématique recalculé depuis les questions du défi, identique à
  /// celui exposé par /api/defis/mine et la page /resultats. Source unique.
  themeLabel: string;
  themeId: string | null;
  /// Titre libre éventuel.
  title: string | null;
  questionsCount: number;
  /// Score de l'utilisateur sur ce défi joué.
  myScore: number;
  /// Score du créateur (snapshot à la création) — utile pour afficher le
  /// récap "moi N/total et lui M/total".
  creatorScore: number;
  /// Quand l'utilisateur a soumis sa réponse.
  playedAt: string;
  /// Quand le défi a été créé (utile pour ordonner / situer dans le temps).
  createdAt: string;
  /// Date d'expiration soft (J+30 par défaut). Au-delà, /resultats affiche
  /// un état expiré mais le score reste consultable.
  expiresAt: string;
  isExpired: boolean;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Endpoint authentifié : limite par utilisateur (pas par IP, pour ne pas
  // pénaliser une salle derrière la même adresse).
  const rl = rateLimit(`defis:played:user:${user.id}`, LIMITS.defiPlayedPerUser);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  const responses = await prisma.defiResponse.findMany({
    where: {
      amiUserId: user.id,
      // Defense-in-depth : exclut les self-defis (le user a joué son propre
      // défi). Devrait déjà être bloqué côté POST + auto-claim — voir les
      // gardes dans /api/defis/[shortCode]/responses et /resultats/page.tsx
      // — mais on filtre aussi à la lecture pour qu'une régression future
      // (ou une donnée importée externalisée) n'affiche pas un "Pierre a joué
      // le défi de Pierre" en UI.
      // `not: user.id` seul exclurait aussi les défis de créateurs anonymes
      // (NULL ≠ x est NULL en SQL, donc filtré) : on les garde explicitement.
      defi: { OR: [{ creatorUserId: null }, { creatorUserId: { not: user.id } }] },
    },
    orderBy: { createdAt: "desc" },
    // Limite défensive : un user prolifique peut en avoir quelques dizaines,
    // pas des milliers. 50 borne le payload sans handicaper l'UX réaliste.
    take: 50,
    select: {
      score: true,
      createdAt: true,
      defi: {
        select: {
          shortCode: true,
          creatorPseudo: true,
          title: true,
          questionIds: true,
          creatorScore: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    },
  });

  // Pré-collecte les customIds de toutes les questions pour résoudre les
  // thèmes en UNE seule requête (cohérent avec /api/defis/mine).
  const parsedQuestionIds: string[][] = responses.map((r) => {
    try {
      return parseQuestionIds(r.defi.questionIds);
    } catch {
      // Blob corrompu — on garde [] pour éviter de planter la liste entière.
      return [];
    }
  });
  const allCustomIds = new Set<string>();
  for (const ids of parsedQuestionIds) for (const id of ids) allCustomIds.add(id);

  const questionRows =
    allCustomIds.size > 0
      ? await prisma.question.findMany({
          where: { customId: { in: [...allCustomIds] } },
          select: { customId: true, theme: true },
        })
      : [];
  const themeByCustomId = new Map<string, string>();
  for (const q of questionRows) {
    if (q.customId) themeByCustomId.set(q.customId, q.theme);
  }

  const now = Date.now();

  const summary: PlayedDefiSummary[] = responses.map((r, i) => {
    const ids = parsedQuestionIds[i];
    const themeNames = ids
      .map((id) => themeByCustomId.get(id))
      .filter((t): t is string => typeof t === "string");
    const bucket = computeThemeFromNames(themeNames);
    return {
      shortCode: r.defi.shortCode,
      creatorPseudo: r.defi.creatorPseudo,
      themeLabel: bucket.themeLabel,
      themeId: bucket.themeId,
      title: r.defi.title,
      questionsCount: ids.length,
      myScore: r.score,
      creatorScore: r.defi.creatorScore,
      playedAt: r.createdAt.toISOString(),
      createdAt: r.defi.createdAt.toISOString(),
      expiresAt: r.defi.expiresAt.toISOString(),
      isExpired: r.defi.expiresAt.getTime() < now,
    };
  });

  return NextResponse.json({ defis: summary });
}
