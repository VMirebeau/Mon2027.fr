import { headers } from "next/headers";

/// Petites protections autour de la connexion : limitation des essais
/// (mémoire, une seule instance) et lecture sûre de l'IP.

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

/// Retourne false si la clé a dépassé `limit` essais dans la fenêtre.
export function attempt(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (store.size > 5000) {
    for (const [k, e] of store) if (e.resetAt <= now) store.delete(k);
  }
  const e = store.get(key);
  if (!e || e.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  e.count++;
  return e.count <= limit;
}

export function resetAttempts(key: string): void {
  store.delete(key);
}

/// IP client : dernière entrée de X-Forwarded-For, celle qu'ajoute le nginx
/// de confiance (TRUST_PROXY=xff-last en prod). Sans proxy déclaré, on ne
/// fait confiance à aucun en-tête (forgeable par le client).
export async function clientIp(): Promise<string> {
  if (process.env.TRUST_PROXY !== "xff-last") return "local";
  const xff = (await headers()).get("x-forwarded-for") ?? "";
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/// Cible de redirection après connexion : chemin interne uniquement (pas de
/// redirection ouverte vers un autre site via ?next=//evil.example).
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
