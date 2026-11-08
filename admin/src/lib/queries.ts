import type { Prisma } from "@prisma/client";
import { FORMATS } from "@/lib/constants";

/// Vues de la liste qui ne se résument pas à un filtre de colonne.
///   a-valider : questions « En revue » dont la version actuelle n'a pas de
///               validation qui compte. Dépend de l'empreinte du contenu, qui
///               ne s'exprime pas en SQL : buildWhere ne garde que le statut,
///               le reste est filtré après chargement (lib/validation-queue).
export const VUES = { "a-valider": "À valider" } as const;
export type Vue = keyof typeof VUES;

export function isVue(v: unknown): v is Vue {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(VUES, v);
}

export type QuestionFilters = {
  vue?: Vue;
  theme?: string;
  statut?: string;
  sensibilite?: string;
  format?: string;
  sort?: string;
};

export const REVIEW_PARAM_KEYS: (keyof QuestionFilters)[] = [
  "vue",
  "theme",
  "statut",
  "sensibilite",
  "format",
  "sort",
];

export function pickFilters(
  raw: Record<string, string | string[] | undefined>
): QuestionFilters {
  const out: QuestionFilters = {};
  for (const k of REVIEW_PARAM_KEYS) {
    const v = raw[k];
    if (k === "vue") {
      if (isVue(v)) out.vue = v;
    } else if (typeof v === "string" && v.length > 0) {
      out[k] = v;
    }
  }
  return out;
}

export function hasAnyFilter(f: QuestionFilters): boolean {
  return REVIEW_PARAM_KEYS.some((k) => k !== "sort" && f[k]);
}

export function buildWhere(f: QuestionFilters): Prisma.QuestionWhereInput {
  return {
    ...(f.theme ? { theme: f.theme } : {}),
    ...(f.statut ? { statut: f.statut } : {}),
    ...(f.sensibilite ? { sensibilite: f.sensibilite } : {}),
    ...(f.format ? { format: f.format } : {}),
    // AND plutôt qu'écraser `statut` : « À valider » + « Publiées » donne une
    // liste vide, pas une liste de questions en revue.
    ...(f.vue === "a-valider" ? { AND: [{ statut: "revue" }] } : {}),
  };
}

export function buildOrderBy(
  sort?: string
): Prisma.QuestionOrderByWithRelationInput[] {
  switch (sort) {
    case "theme":
      return [{ theme: "asc" }, { createdAt: "desc" }];
    case "oldest":
      return [{ createdAt: "asc" }];
    case "updated":
      return [{ updatedAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

export function toSearchParams(f: QuestionFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const k of REVIEW_PARAM_KEYS) {
    const v = f[k];
    if (v) sp.set(k, v);
  }
  return sp;
}

/** Human-readable label for a filter set (e.g. "Brouillons · Immigration"). */
export function describeFilters(f: QuestionFilters): string {
  const STATUT_LABELS: Record<string, string> = {
    brouillon: "Brouillons",
    revue: "En revue",
    publie: "Publiées",
    retire: "Retirées",
  };
  const SENS_LABELS: Record<string, string> = {
    standard: "Sensibilité standard",
    haute: "Sensibilité haute",
    critique: "Sensibilité critique",
  };
  const parts: string[] = [];
  if (f.vue) parts.push(VUES[f.vue]);
  if (f.statut && STATUT_LABELS[f.statut]) parts.push(STATUT_LABELS[f.statut]);
  if (f.theme) parts.push(f.theme);
  if (f.sensibilite && SENS_LABELS[f.sensibilite])
    parts.push(SENS_LABELS[f.sensibilite]);
  if (f.format) parts.push(FORMATS.find((x) => x.value === f.format)?.label ?? f.format);
  return parts.length > 0 ? parts.join(" · ") : "Toutes les questions";
}
