import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefiClientId } from "@/lib/defi-client-cookie";
import {
  parseAnswersMap,
  parseQuestionIds,
  playableQuestionIds,
  scoreFromAnswers,
} from "@/lib/defi";
import { computeThemeFromNames } from "@/lib/defi-loader";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/defis/mine — défis créés par l'utilisateur courant.
 *
 *  Authentification : on accepte deux preuves complémentaires, l'union est
 *  utilisée pour le filtre Prisma :
 *    - cookie httpOnly signé `mon2027_defi_client` (posé au POST /api/defis)
 *      → clientId vérifié
 *    - session user (`getCurrentUser`)
 *      → creatorUserId
 *  Couvre le cas du militant qui a créé des défis en mode anonyme puis s'est
 *  ensuite connecté : on retourne les deux ensembles.
 *
 *  Retourne 200 { defis: DefiSummary[] } trié par createdAt desc. Si aucune
 *  des deux preuves n'est dispo, retourne 200 { defis: [] } — pas d'erreur,
 *  le client gère un état vide générique.
 *
 *  PRIVACY : on n'expose JAMAIS `creatorClientId` ni `amiClientId` raw.
 *  On renvoie le score brut et le pseudo saisi par l'ami ("Anonyme" par
 *  défaut) — comme la page de résultats publique.
 */
export type DefiResponseSummary = {
  amiLabel: string;
  score: number;
  createdAt: string;
};

export type DefiSummary = {
  shortCode: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  /// Libellé affiché dans la liste. Calculé à partir des thèmes réels des
  /// questions du défi, indépendamment de la façon dont il a été créé
  /// (thème / favoris / récap session) : si toutes les questions partagent
  /// un même thème, on affiche son nom (ex. "Économie") ; sinon
  /// "Questions diverses". C'est ce qui intéresse expéditeur ET destinataire.
  themeLabel: string;
  /// Slug HOME_THEMES.id quand le défi est mono-thème, null sinon. Utilisé
  /// côté client pour résoudre la couleur de la pastille ; pas affiché.
  themeId: string | null;
  /// Titre libre facultatif saisi par le militant à la création. Affiché
  /// EN PLUS du themeLabel. null si laissé vide.
  title: string | null;
  questionsCount: number;
  creatorScore: number;
  /// Nombre de réponses reçues (= ami·e·s qui ont joué).
  responsesCount: number;
  /// Score moyen des ami·e·s sur ce défi, en bonnes réponses (entier),
  /// null si personne n'a encore joué.
  responsesAvgScore: number | null;
  /// Meilleur score d'un·e ami·e, null si personne n'a joué. Utile pour
  /// afficher "Le meilleur a fait 4/5".
  responsesBestScore: number | null;
  /// Détail des réponses (limité aux 5 dernières pour ne pas exploser le
  /// payload sur les défis viraux).
  recentResponses: DefiResponseSummary[];
};

export async function GET(req: Request) {
  // Pas anti-énumération ici (l'endpoint est gated par cookie + auth), mais
  // un rate-limit modéré protège quand même contre un client buggé qui
  // pollerait en boucle.
  const ip = getClientIp(req.headers);
  const rlIp = rateLimit(`defis:reads:ip:${ip}`, LIMITS.defiReadsPerIp);
  if (!rlIp.ok) return tooManyRequests(rlIp.resetAt);

  const [clientId, user] = await Promise.all([
    getDefiClientId(),
    getCurrentUser(),
  ]);

  // Aucune des deux preuves d'identité : on retourne un set vide. Le client
  // affiche un placeholder cohérent (jamais créé de défi → pas de liste).
  if (!clientId && !user) {
    return NextResponse.json({ defis: [] satisfies DefiSummary[] });
  }

  // Limite serrée par identité (session ou cookie défi signé) : une salle
  // derrière la même IP n'est pas pénalisée, un client qui boucle l'est.
  const identity = user ? `user:${user.id}` : `client:${clientId}`;
  const rl = rateLimit(`defis:mine:${identity}`, LIMITS.defiMinePerIdentity);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  // Construit le filtre OR sur les deux sources possibles de paternité.
  const orConditions: Array<{ creatorClientId?: string; creatorUserId?: string }> = [];
  if (clientId) orConditions.push({ creatorClientId: clientId });
  if (user) orConditions.push({ creatorUserId: user.id });

  const defis = await prisma.defi.findMany({
    where: { OR: orConditions },
    orderBy: { createdAt: "desc" },
    // Limite défensive : un militant prolifique en aurait quelques dizaines,
    // pas des milliers. 50 couvre largement et borne le payload.
    take: 50,
    select: {
      shortCode: true,
      createdAt: true,
      expiresAt: true,
      questionIds: true,
      title: true,
      creatorScore: true,
      creatorAnswers: true,
      responses: {
        select: { amiLabel: true, score: true, createdAt: true, answers: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Pré-parse les questionIds une fois, et collecte l'union des customIds
  // sur tous les défis pour résoudre les thèmes en UNE seule requête au lieu
  // de N (un findMany par défi). Pour 50 défis × 5-10 questions, l'IN porte
  // sur quelques centaines de customIds max.
  const parsedQuestionIds: string[][] = defis.map((d) => {
    try {
      return parseQuestionIds(d.questionIds);
    } catch {
      // Blob corrompu — on garde [] plutôt que de tout faire péter. Ne
      // devrait jamais arriver (Defi.questionIds est écrit via serialize).
      return [];
    }
  });
  const allCustomIds = new Set<string>();
  for (const ids of parsedQuestionIds) for (const id of ids) allCustomIds.add(id);

  const questionRows = allCustomIds.size > 0
    ? await prisma.question.findMany({
        where: { customId: { in: [...allCustomIds] }, statut: "publie" },
        select: { customId: true, theme: true },
      })
    : [];
  const themeByCustomId = new Map<string, string>();
  for (const q of questionRows) {
    if (q.customId) themeByCustomId.set(q.customId, q.theme);
  }

  const now = Date.now();

  const summary: DefiSummary[] = defis.map((d, i) => {
    const ids = parsedQuestionIds[i];
    // Mappe les customIds vers leurs thèmes (filtre les questions disparues),
    // puis délègue à computeThemeFromNames pour la logique 1-thème vs diverses
    // — mêmes règles que le loader recipient-side, donc cohérence garantie.
    const themeNames = ids
      .map((id) => themeByCustomId.get(id))
      .filter((t): t is string => typeof t === "string");
    const bucket = computeThemeFromNames(themeNames);

    // Même périmètre que la page du défi (cf. defi-loader) : seules les
    // questions encore publiées comptent dans le total et les scores, sinon
    // « Mes défis » affichait 3/5 quand la page disait 3/4.
    const playable = playableQuestionIds(ids, themeByCustomId.keys());
    const rescore = (blob: string, stored: number) => {
      if (playable.length === ids.length) return stored;
      try {
        return scoreFromAnswers(parseAnswersMap(blob), playable);
      } catch {
        return stored;
      }
    };
    const scores = d.responses.map((r) => rescore(r.answers, r.score));
    const responsesCount = scores.length;
    const responsesBestScore = responsesCount > 0 ? Math.max(...scores) : null;
    const responsesAvgScore =
      responsesCount > 0
        ? Math.round((scores.reduce((s, x) => s + x, 0) / responsesCount) * 10) / 10
        : null;
    return {
      shortCode: d.shortCode,
      createdAt: d.createdAt.toISOString(),
      expiresAt: d.expiresAt.toISOString(),
      isExpired: d.expiresAt.getTime() < now,
      themeLabel: bucket.themeLabel,
      themeId: bucket.themeId,
      title: d.title,
      questionsCount: playable.length,
      creatorScore: rescore(d.creatorAnswers, d.creatorScore),
      responsesCount,
      responsesAvgScore,
      responsesBestScore,
      recentResponses: d.responses.slice(0, 5).map((r, j) => ({
        amiLabel: r.amiLabel,
        score: scores[j],
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  return NextResponse.json({ defis: summary });
}
