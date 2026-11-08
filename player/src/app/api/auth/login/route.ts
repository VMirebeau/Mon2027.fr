import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  PasswordBusyError,
  getDummyHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { normalizePseudo, PASSWORD_RULES, PSEUDO_RULES } from "@/lib/auth/validation";
import { getClientIp, LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/auth/login — connexion pseudo + mot de passe.
 *  Body: { pseudo: string, password: string }
 *  Réponse uniforme en cas d'échec pour éviter l'énumération de pseudos.
 *  Rate-limit : 10 tentatives par IP par minute (anti brute-force).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`login:ip:${ip}`, LIMITS.loginPerIp);
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

  if (!pseudoRaw || !password) {
    return NextResponse.json(
      { error: { message: "Pseudo et mot de passe requis." } },
      { status: 400 }
    );
  }

  // Bornes AVANT de s'en servir comme clé de rate-limit : un pseudo de 1 Mo
  // créerait une entrée de 1 Mo en mémoire par essai (saturation possible).
  // Même réponse qu'un échec normal (pas d'information sur les règles).
  if (pseudoRaw.length > PSEUDO_RULES.max || password.length > PASSWORD_RULES.max) {
    return NextResponse.json(
      { error: { message: "Pseudo ou mot de passe incorrect." } },
      { status: 401 }
    );
  }
  const pseudo = normalizePseudo(pseudoRaw);
  // Anti brute-force par compte visé, indépendamment de l'IP : une salle
  // entière peut se connecter, mais personne ne peut enchaîner les essais
  // sur un même pseudo, même depuis plusieurs adresses.
  const rlPseudo = rateLimit(`login:pseudo:${pseudo}`, LIMITS.loginPerPseudo);
  if (!rlPseudo.ok) return tooManyRequests(rlPseudo.resetAt);
  const user = await prisma.user.findUnique({
    where: { pseudo },
    select: {
      id: true,
      pseudo: true,
      displayPseudo: true,
      passwordHash: true,
    },
  });

  // Hash bidon pour égaliser le temps de réponse même quand le pseudo
  // n'existe pas — résiste à un timing-attack qui distinguerait
  // "pseudo inconnu" de "mot de passe faux". Même coût que le hachage
  // courant (cf. password.ts getDummyHash).
  let ok: boolean;
  try {
    const dummy = await getDummyHash();
    ok = await verifyPassword(password, user?.passwordHash ?? dummy);
  } catch (e) {
    if (e instanceof PasswordBusyError) {
      return NextResponse.json(
      { error: { message: "Beaucoup de connexions en même temps : réessaie dans un instant." } },
      { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    throw e;
  }
  if (!user || !ok) {
    return NextResponse.json(
      { error: { message: "Pseudo ou mot de passe incorrect." } },
      { status: 401 }
    );
  }

  // Ancien hash bcrypt (ou paramètres périmés) : on le remplace maintenant
  // que le mot de passe en clair est connu. Un échec n'empêche pas la
  // connexion, on réessaiera à la prochaine.
  if (needsRehash(user.passwordHash)) {
    try {
      const fresh = await hashPassword(password);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: fresh } });
    } catch {
      /* réessayé à la prochaine connexion */
    }
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
