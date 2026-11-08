import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { generateShortCode } from "@/lib/defi-shortcode";
import {
  defaultExpiry,
  scoreFromAnswers,
  serializeAnswersMap,
  validateCreatePayload,
} from "@/lib/defi";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { setDefiClientCookie } from "@/lib/defi-client-cookie";
import { loadQuestionsByIds } from "@/lib/content";
import { rescoreAnswers } from "@/lib/answer-validation";

export const dynamic = "force-dynamic";

/** POST /api/defis — créer un défi.
 *
 *  Body (JSON) :
 *    creatorClientId : string  (UUID localStorage du militant)
 *    creatorPseudo   : string  (affiché à l'ami)
 *    questionIds     : string[] (3..10 Question.customId)
 *    source          : "theme" | "favoris"
 *    themeId?        : string  (si source = theme)
 *    creatorAnswers  : { [questionId]: { value, correct } }
 *
 *  Auth optionnelle : si un user est connecté, on lie le défi à son
 *  account ; sinon le défi reste anonyme (creatorUserId = null) et
 *  l'identification "qui est le créateur" repose uniquement sur le
 *  creatorClientId.
 *
 *  Retourne 200 { shortCode, url } où `url` est le chemin relatif vers
 *  la page de réception ; le client construit l'URL absolue depuis
 *  window.location.origin pour matcher le déploiement.
 */
export async function POST(req: Request) {
  // Anti-flood : créer un défi est O(1 DB write + parse questions) et
  // produit une entrée pérenne. Sans rate-limit un seul bot peut polluer
  // la table en quelques secondes. 10 défis / minute / IP suffit largement
  // pour un usage humain.
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`defis:create:ip:${ip}`, LIMITS.defiCreatePerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const v = validateCreatePayload(body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: v.status });
  }

  // Vérifie que toutes les question IDs existent et sont publiées. On lit
  // par customId (= la string visible côté client) et on filtre côté DB
  // sur statut=publie pour éviter qu'un client puisse défier sur un
  // brouillon (qui révélerait du contenu non validé).
  const published = await loadQuestionsByIds(v.data.questionIds);
  const validIds = new Set(published.map((q) => q.id));
  const missing = v.data.questionIds.filter((id) => !validIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "unknown_questions", missing },
      { status: 400 }
    );
  }

  // Identité du créateur — best-effort, sans bloquer.
  const user = await getCurrentUser();

  // Réponses du créateur recalculées côté serveur (questions du défi
  // uniquement, valeurs validées, justesse réévaluée) : le client ne peut
  // ni gonfler son score ni stocker du JSON arbitraire.
  const creatorAnswers = rescoreAnswers(published, v.data.creatorAnswers);
  const score = scoreFromAnswers(creatorAnswers);

  // Génère un short code unique. L'espace de codes (~10 000+ combinaisons)
  // rend la collision quasi-nulle aux volumes attendus ; 3 tentatives
  // séquentielles couvrent largement le cas où le table grossirait. Si on
  // épuise les 3 essais → 503 (mieux que de bloquer la création trop
  // longtemps : l'utilisateur retry et tombera sur un code libre).
  let shortCode: string | null = null;
  for (let i = 0; i < 3; i++) {
    const candidate = generateShortCode();
    const exists = await prisma.defi.findUnique({
      where: { shortCode: candidate },
      select: { shortCode: true },
    });
    if (!exists) {
      shortCode = candidate;
      break;
    }
  }
  if (!shortCode) {
    return NextResponse.json(
      { error: "shortcode_collision" },
      { status: 503 }
    );
  }

  await prisma.defi.create({
    data: {
      shortCode,
      creatorUserId: user?.id ?? null,
      creatorClientId: v.data.creatorClientId,
      creatorPseudo: v.data.creatorPseudo,
      questionIds: JSON.stringify(v.data.questionIds),
      source: v.data.source,
      themeId: v.data.themeId,
      title: v.data.title,
      creatorAnswers: serializeAnswersMap(creatorAnswers),
      creatorScore: score,
      creatorLevelRank: v.data.creatorLevelRank,
      expiresAt: defaultExpiry(),
    },
  });

  // Lie le device au clientId via cookie httpOnly signé : la page
  // /resultats vérifie ce cookie pour décider d'exposer les réponses
  // détaillées (vs un rendu public pour les inconnus).
  await setDefiClientCookie(v.data.creatorClientId);

  return NextResponse.json({
    shortCode,
    url: `/d/${shortCode}`,
    resultsUrl: `/d/${shortCode}/resultats`,
  });
}
