import type { Answer, Question } from "./types";
import { isCorrect } from "./correctness";

/// Validation d'une réponse envoyée par un client (statistiques anonymes,
/// réponses aux défis) CONTRE la question elle-même : seuls les identifiants
/// d'items/affirmations/catégories de cette question sont acceptés, avec le
/// bon type de valeur et une taille bornée.
///
/// Sans ça, n'importe qui pouvait stocker du JSON arbitraire (jusqu'à la
/// taille max d'un corps de requête) dans Answer/DefiResponse : base qui
/// gonfle, clés inventées qui ressortent dans les statistiques publiques,
/// pages de résultats de défi qui deviennent énormes à charger.

/// Taille max d'une réponse sérialisée. La plus grosse réponse légitime
/// (catégorisation ~12 items) tient en quelques centaines d'octets.
export const MAX_ANSWER_JSON = 2000;

export type AnswerCheck = { ok: true; value: Exclude<Answer, null> } | { ok: false; error: string };

const fail = (error: string): AnswerCheck => ({ ok: false, error });

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/// Objet { id autorisé : valeur valide }, au moins une entrée.
function checkMap(
  value: unknown,
  allowedIds: readonly string[],
  isValidValue: (v: unknown) => boolean,
): AnswerCheck {
  if (!isPlainObject(value)) return fail("bad_value");
  const allowed = new Set(allowedIds);
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > allowed.size) return fail("bad_value");
  for (const [k, v] of entries) {
    if (!allowed.has(k) || !isValidValue(v)) return fail("bad_value");
  }
  return { ok: true, value: value as Record<string, boolean | number | string> };
}

export function validateAnswer(q: Question, value: unknown): AnswerCheck {
  let result: AnswerCheck;
  switch (q.format) {
    case "estimation": {
      if (!isFiniteNumber(value)) return fail("bad_value");
      // Marge d'un pas autour de la plage du curseur (arrondis côté client).
      const [min, max] = q.range;
      const margin = Math.abs(q.step) || 1;
      if (value < min - margin || value > max + margin) return fail("out_of_range");
      result = { ok: true, value };
      break;
    }
    case "ab":
      if (value !== 0 && value !== 1) return fail("bad_value");
      result = { ok: true, value };
      break;
    case "qcm":
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= q.choices.length) {
        return fail("bad_value");
      }
      result = { ok: true, value: value as number };
      break;
    case "vraifaux":
      if (typeof value !== "boolean") return fail("bad_value");
      result = { ok: true, value };
      break;
    case "classement": {
      const ids = new Set(q.items.map((it) => it.id));
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.length > ids.size ||
        new Set(value).size !== value.length ||
        value.some((v) => typeof v !== "string" || !ids.has(v))
      ) {
        return fail("bad_value");
      }
      result = { ok: true, value: value as string[] };
      break;
    }
    case "vraifaux_multi":
      result = checkMap(
        value,
        q.statements.map((s) => s.id),
        (v) => typeof v === "boolean",
      );
      break;
    case "curseur_multi":
      result = checkMap(
        value,
        q.items.map((it) => it.id),
        isFiniteNumber,
      );
      break;
    case "categorisation": {
      const bins = new Set(q.bins.map((b) => b.id));
      result = checkMap(
        value,
        q.items.map((it) => it.id),
        (v) => typeof v === "string" && bins.has(v),
      );
      break;
    }
    case "pondere":
      result = checkMap(
        value,
        q.categories.map((c) => c.id),
        (v) => isFiniteNumber(v) && v >= 0 && v <= q.pool,
      );
      break;
    default:
      return fail("unsupported_format");
  }
  if (result.ok && JSON.stringify(result.value).length > MAX_ANSWER_JSON) return fail("too_large");
  return result;
}

/// Format stocké en base (Answer.format) à partir du format joueur.
export const DB_FORMAT: Record<Question["format"], string> = {
  estimation: "estimation_numerique",
  vraifaux: "vrai_faux",
  ab: "ab",
  qcm: "qcm",
  classement: "classement",
  vraifaux_multi: "vraifaux_multi",
  curseur_multi: "curseur_multi",
  categorisation: "categorisation",
  pondere: "pondere",
};

/// Sérialisation pour la colonne Answer.value (cf. commentaire du modèle).
export function serializeForStats(value: Exclude<Answer, null>): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

/// Recalcule côté serveur les réponses d'un défi (créateur ou ami) : ne garde
/// que les questions du défi, valide chaque valeur et réévalue sa justesse
/// avec `isCorrect` au lieu de croire le flag `correct` envoyé par le client
/// (qui permettait d'afficher « 1000/5 »). Une réponse absente ou invalide
/// compte comme non répondue.
export function rescoreAnswers(
  questions: readonly Question[],
  answers: Readonly<Record<string, { value?: unknown } | undefined>>,
): Record<string, { value: Exclude<Answer, null> | null; correct: boolean }> {
  const out: Record<string, { value: Exclude<Answer, null> | null; correct: boolean }> = {};
  for (const q of questions) {
    const raw = answers[q.id]?.value;
    const check = raw == null ? null : validateAnswer(q, raw);
    out[q.id] = check?.ok ? { value: check.value, correct: isCorrect(q, check.value) } : { value: null, correct: false };
  }
  return out;
}
