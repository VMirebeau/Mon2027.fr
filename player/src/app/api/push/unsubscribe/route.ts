import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/push/unsubscribe
 *  Body : { endpoint: string }
 *  Supprime l'abonnement correspondant — seulement s'il appartient au
 *  user courant, pour éviter qu'un user déloggé révoque la sub d'un
 *  autre via un endpoint deviné.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // `null` est un JSON valide : sans ce garde-fou, lire un champ plantait (500).
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.endpoint !== "string") {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
