/// Narrowers pour la valeur `locked` côté runner.
///
/// Le runner reçoit un `Answer | null` (union large) et doit passer à
/// chaque écran de format un `lockedAnswer` typé étroit. Sans ces helpers,
/// chaque cas du switch dans question-runner.tsx répèterait la même
/// garde — 9 occurrences avant cette extraction.
///
/// Tous les helpers retournent `null` quand la valeur ne matche pas le type
/// attendu : le composant cible affichera "pas encore répondu" sans crash.

export function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

export function asBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export function as01(v: unknown): 0 | 1 | null {
  return v === 0 || v === 1 ? v : null;
}

export function asStringArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
    ? (v as string[])
    : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function asRecordBoolean(v: unknown): Record<string, boolean> | null {
  return isPlainObject(v) ? (v as Record<string, boolean>) : null;
}

export function asRecordNumber(v: unknown): Record<string, number> | null {
  return isPlainObject(v) ? (v as Record<string, number>) : null;
}

export function asRecordString(v: unknown): Record<string, string> | null {
  return isPlainObject(v) ? (v as Record<string, string>) : null;
}
