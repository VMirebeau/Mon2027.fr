import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PasswordBusyError, hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  normalizePseudo,
  validatePassword,
  validatePseudo,
} from "@/lib/auth/validation";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/auth/signup — crée un compte pseudo + mot de passe.
 *  Pas d'email collecté. Pas de mécanisme de récupération.
 *  Body: { pseudo: string, password: string }
 *  Rate-limit : 5 créations par IP par heure (anti création massive).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`signup:ip:${ip}`, LIMITS.signupPerIp);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  let body: { pseudo?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // `null` est un JSON valide : sans ce garde-fou, lire un champ plantait (500).
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pseudoRaw = typeof body.pseudo === "string" ? body.pseudo : "";
  const password = typeof body.password === "string" ? body.password : "";

  const pseudoErr = validatePseudo(pseudoRaw);
  if (pseudoErr) {
    return NextResponse.json({ error: pseudoErr }, { status: 400 });
  }
  const passwordErr = validatePassword(password);
  if (passwordErr) {
    return NextResponse.json({ error: passwordErr }, { status: 400 });
  }

  const pseudo = normalizePseudo(pseudoRaw);
  const displayPseudo = pseudoRaw.trim();
  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (e) {
    if (e instanceof PasswordBusyError) {
      return NextResponse.json(
      { error: { message: "Beaucoup d'inscriptions en même temps : réessaie dans un instant." } },
      { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    throw e;
  }

  let user;
  try {
    user = await prisma.user.create({
      data: { pseudo, displayPseudo, passwordHash },
      select: { id: true, pseudo: true, displayPseudo: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: { field: "pseudo", message: "Ce pseudo est déjà pris." } },
        { status: 409 }
      );
    }
    throw e;
  }

  await createSession(user.id);
  return NextResponse.json({
    user: {
      id: user.id,
      pseudo: user.pseudo,
      displayPseudo: user.displayPseudo,
    },
  });
}
