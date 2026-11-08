import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const MAX_SUBSCRIPTIONS_PER_USER = 10;

/// Services Web Push des navigateurs. Le serveur enverra un POST vers cet
/// endpoint quand les notifications seront branchées : sans liste blanche,
/// un compte pourrait le faire pointer vers un service interne (SSRF).
const PUSH_SERVICE_DOMAINS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      PUSH_SERVICE_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))
    );
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

/** POST /api/push/subscribe
 *  Body : PushSubscription sérialisé (toJSON) côté navigateur.
 *  Stocke/met à jour l'abonnement pour le user courant.
 *  L'unicité de `endpoint` garantit qu'un même device n'est pas
 *  dupliqué : si l'user se reconnecte sur un device déjà abonné, on
 *  réattribue la sub à son nouveau userId (cas rare mais propre).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // `null` est un JSON valide : sans ce garde-fou, lire un champ plantait (500).
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;

  const rl = rateLimit(`push:subscribe:user:${user.id}`, LIMITS.pushSubscribePerUser);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  if (
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    endpoint.length > 1000 ||
    p256dh.length > 200 ||
    auth.length > 100 ||
    !isPushServiceEndpoint(endpoint)
  ) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh, auth },
    create: { userId: user.id, endpoint, p256dh, auth },
  });

  // Plafond par compte (téléphone + ordinateur + quelques navigateurs) : on
  // garde les plus récents.
  const extra = await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    skip: MAX_SUBSCRIPTIONS_PER_USER,
    select: { id: true },
  });
  if (extra.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  }

  return NextResponse.json({ ok: true });
}
