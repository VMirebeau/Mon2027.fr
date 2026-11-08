/// Source unique de vérité pour les couleurs de thème (côté client).
///
/// Ce fichier est volontairement client-safe (zéro import Prisma) pour pouvoir
/// être utilisé dans tous les composants React (chip de thème, accent de row,
/// pastille de défi, etc.) sans tirer le runtime serveur.
///
/// `lib/content.ts > HOME_THEMES` réexporte cette même liste (avec `count`
/// calculé à partir de la BDD côté serveur). Les deux DOIVENT rester
/// synchronisés — d'où la source unique ici.
///
/// Pourquoi pas dériver l'un de l'autre ? Parce que `content.ts` importe
/// `prisma` et serait refusé dans un bundle client.

export type ThemeMeta = {
  /// Slug stable (kebab-case, sans accents). Utilisé comme id dans la BDD
  /// pour les pages thématiques (Découvrir/[theme]).
  id: string;
  /// Libellé affiché et clé dans `Question.theme` (case-sensitive, avec
  /// accents). Match exact attendu — ne jamais normaliser.
  label: string;
  /// Couleur de fond pour les cards Découvrir, accent de border et chip
  /// thématique. Hex 6 chiffres. Pas de variable CSS ici : on veut que la
  /// même valeur soit utilisable comme `background` direct ET dans des
  /// composites (inset shadow, etc.) sans détour.
  color: string;
};

export const THEMES: ReadonlyArray<ThemeMeta> = [
  { id: "immigration",  label: "Immigration",  color: "#FFC845" },
  { id: "securite",     label: "Sécurité",     color: "#FF6B6B" },
  { id: "economie",     label: "Économie",     color: "#4ECDC4" },
  { id: "travail",      label: "Travail",      color: "#6B9DC2" },
  { id: "climat",       label: "Climat",       color: "#7BB069" },
  { id: "sante",        label: "Santé",        color: "#FF9E80" },
  { id: "ecole",        label: "École",        color: "#9B7EDE" },
  { id: "logement",     label: "Logement",     color: "#E08D79" },
  { id: "institutions", label: "Institutions", color: "#B79A6C" },
  { id: "services-publics", label: "Services publics", color: "#F59E42" },
  { id: "egalites", label: "Égalités", color: "#B5D45E" },
  { id: "numerique-ia", label: "Numérique & IA", color: "#F28AC0" },
  { id: "international", label: "International", color: "#5B7BE0" },
];

const BY_LABEL: ReadonlyMap<string, ThemeMeta> = new Map(
  THEMES.map((t) => [t.label, t]),
);

/// Couleur de thème par libellé. Fallback ink-mute pour les libellés
/// inconnus (ex. anciennes questions, libellé mal saisi en BDD).
export function themeColor(label: string): string {
  return BY_LABEL.get(label)?.color ?? "var(--ink-mute)";
}

export function themeMeta(label: string): ThemeMeta | undefined {
  return BY_LABEL.get(label);
}
