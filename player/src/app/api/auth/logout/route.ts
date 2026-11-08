import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — détruit la session courante (DB + cookie). */
export async function POST() {
  await destroyCurrentSession();
  return NextResponse.json({ ok: true });
}
