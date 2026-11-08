import "server-only";
import { createHash } from "node:crypto";

/// Pendant Node de defi-identity.ts. Sépare server-only pour éviter de
/// bundler `node:crypto` dans le code client (Webpack n'a pas le shim).

const TAG_LENGTH = 16;

export function computeIdentityTag(
  shortCode: string,
  clientId: string,
): string {
  return createHash("sha256")
    .update(`${shortCode}:${clientId}`)
    .digest("hex")
    .slice(0, TAG_LENGTH);
}
