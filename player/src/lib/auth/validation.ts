// Règles de validation partagées entre client (feedback formulaire)
// et serveur (validation autoritaire avant écriture en base).

import { isCommonPassword } from "./common-passwords";

/// Caractères autorisés pour le pseudo. On reste large : lettres
/// (avec accents), chiffres, underscore, tiret, point. Pas d'espace
/// pour éviter la confusion avec des collisions de pseudo invisibles
/// (trailing spaces, etc.).
const PSEUDO_RE = /^[\p{L}\p{N}_.\-]{3,30}$/u;

export const PSEUDO_RULES = {
  min: 3,
  max: 30,
  description:
    "3 à 30 caractères : lettres, chiffres, tirets, points ou underscores.",
};

export const PASSWORD_RULES = {
  min: 8,
  max: 200,
  description: "8 caractères minimum.",
};

export type ValidationError = { field: "pseudo" | "password"; message: string };

export function validatePseudo(raw: string): ValidationError | null {
  const trimmed = raw.trim();
  if (!trimmed) return { field: "pseudo", message: "Pseudo requis." };
  if (!PSEUDO_RE.test(trimmed)) {
    return { field: "pseudo", message: PSEUDO_RULES.description };
  }
  return null;
}

export function validatePassword(raw: string): ValidationError | null {
  if (typeof raw !== "string" || raw.length < PASSWORD_RULES.min) {
    return { field: "password", message: PASSWORD_RULES.description };
  }
  if (raw.length > PASSWORD_RULES.max) {
    return {
      field: "password",
      message: `Mot de passe trop long (max ${PASSWORD_RULES.max} caractères).`,
    };
  }
  if (isCommonPassword(raw)) {
    return {
      field: "password",
      message: "Ce mot de passe est trop courant. Choisis-en un autre.",
    };
  }
  return null;
}

/// Normalise pour l'unicité : minuscules + trim. Le `displayPseudo`
/// préserve la casse choisie par l'utilisateur.
export function normalizePseudo(raw: string): string {
  return raw.trim().toLowerCase();
}
