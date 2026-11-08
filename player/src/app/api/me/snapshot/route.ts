import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Garde-fou contre un client qui inonderait la base. 64 Ko ne suffisait
// pas : un joueur ayant répondu à tout le catalogue (~450 questions) dépasse
// déjà ~65 Ko de réponses, et sa synchro s'arrêtait sans prévenir (413).
const MAX_BLOB_BYTES = 512 * 1024;

/** GET /api/me/snapshot — renvoie le snapshot serveur pour le user courant.
 *  404 si pas de snapshot encore enregistré.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const snap = await prisma.userSnapshot.findUnique({
    where: { userId: user.id },
    select: { blob: true, updatedAt: true },
  });
  if (!snap) {
    return NextResponse.json({ snapshot: null });
  }
  return NextResponse.json({
    snapshot: { blob: snap.blob, updatedAt: snap.updatedAt.toISOString() },
  });
}

/** PUT /api/me/snapshot — remplace le snapshot serveur, de façon CONDITIONNELLE.
 *  Body: { blob: string, baseUpdatedAt?: string | null }
 *
 *  `baseUpdatedAt` = version du serveur sur laquelle le client s'est basé
 *  (null s'il n'en connaissait aucune). Si un autre appareil a écrit depuis,
 *  on refuse (409) en renvoyant la version courante : le client la fusionne
 *  (mergeProgress) puis renvoie. Sans écriture concurrente, le client reste
 *  autoritaire, ce qui préserve les suppressions (favoris retirés…) qu'une
 *  fusion systématique par union ferait réapparaître.
 *  Sans `baseUpdatedAt` (ancien client encore en cache) : écrase, comme avant.
 */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Le snapshot peut faire 64 Ko et est upsert ; un client malicieux
  // authentifié pourrait écrire en boucle et fatiguer SQLite. 30 PUT/min
  // suffit largement pour un usage normal (debounce client typique ~1 PUT/s).
  const rl = rateLimit(`snapshot:user:${user.id}`, LIMITS.snapshotPerUser);
  if (!rl.ok) return tooManyRequests(rl.resetAt);

  let body: { blob?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // `null` est un JSON valide : sans ce garde-fou, lire un champ plantait (500).
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.blob !== "string") {
    return NextResponse.json({ error: "missing_blob" }, { status: 400 });
  }
  if (body.blob.length > MAX_BLOB_BYTES) {
    return NextResponse.json({ error: "blob_too_large" }, { status: 413 });
  }
  // Validation légère du schéma : on parse, on vérifie que c'est un
  // object avec les top-level keys attendus de `Progress`. On ne valide
  // pas chaque entrée d'answers (les payloads internes peuvent évoluer),
  // juste qu'on n'accepte pas un blob arbitraire (string, array, etc.).
  // Ça protège contre un client qui chercherait à écrire des données
  // étrangères dans son snapshot (qu'il re-lirait ensuite).
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.blob);
  } catch {
    return NextResponse.json({ error: "invalid_blob_json" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "invalid_blob_shape" }, { status: 400 });
  }
  const p = parsed as Record<string, unknown>;
  if (
    typeof p.version !== "number" ||
    typeof p.answers !== "object" ||
    p.answers === null ||
    Array.isArray(p.answers) ||
    typeof p.streak !== "object" ||
    p.streak === null
  ) {
    return NextResponse.json({ error: "invalid_blob_shape" }, { status: 400 });
  }

  const conflict = async () => {
    const current = await prisma.userSnapshot.findUnique({
      where: { userId: user.id },
      select: { blob: true, updatedAt: true },
    });
    return NextResponse.json(
      {
        error: "conflict",
        snapshot: current ? { blob: current.blob, updatedAt: current.updatedAt.toISOString() } : null,
      },
      { status: 409 },
    );
  };

  if (!("baseUpdatedAt" in body)) {
    // Ancien client : écrasement inconditionnel (comportement historique).
    const saved = await prisma.userSnapshot.upsert({
      where: { userId: user.id },
      update: { blob: body.blob },
      create: { userId: user.id, blob: body.blob },
      select: { updatedAt: true },
    });
    return NextResponse.json({ updatedAt: saved.updatedAt.toISOString() });
  }

  // Écriture atomique conditionnée à la version attendue : pas de fenêtre
  // entre la vérification et l'écriture.
  const base = (body as { baseUpdatedAt?: unknown }).baseUpdatedAt;
  if (base === null || base === undefined) {
    try {
      const created = await prisma.userSnapshot.create({
        data: { userId: user.id, blob: body.blob },
        select: { updatedAt: true },
      });
      return NextResponse.json({ updatedAt: created.updatedAt.toISOString() });
    } catch {
      return conflict(); // un snapshot existe déjà (autre appareil)
    }
  }
  const baseDate = typeof base === "string" ? new Date(base) : null;
  if (!baseDate || Number.isNaN(baseDate.getTime())) {
    return NextResponse.json({ error: "bad_baseUpdatedAt" }, { status: 400 });
  }
  const { count } = await prisma.userSnapshot.updateMany({
    where: { userId: user.id, updatedAt: baseDate },
    data: { blob: body.blob },
  });
  if (count === 0) return conflict();
  const saved = await prisma.userSnapshot.findUnique({
    where: { userId: user.id },
    select: { updatedAt: true },
  });
  return NextResponse.json({ updatedAt: saved?.updatedAt.toISOString() ?? null });
}
