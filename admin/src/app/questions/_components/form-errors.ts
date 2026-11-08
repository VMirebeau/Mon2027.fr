/// Répartition des erreurs renvoyées par le serveur (clés `champ` ou
/// `sources.N.champ`, cf. validationErrors dans lib/actions) entre les blocs
/// du formulaire de question. Fonctions pures, testées à part.

export type SourceFieldErrors = Partial<Record<"nom" | "url" | "type" | "ligne", string>>;

/// `sources.2.url` → { 2: { url } }. Un champ inconnu de la ligne (ex.
/// `ordre`) est rattaché à la ligne entière.
export function sourceErrors(errors: Record<string, string>): Record<number, SourceFieldErrors> {
  const out: Record<number, SourceFieldErrors> = {};
  for (const [key, message] of Object.entries(errors)) {
    const m = /^sources\.(\d+)(?:\.(\w+))?/.exec(key);
    if (!m) continue;
    const row = Number(m[1]);
    const field = m[2] === "nom" || m[2] === "url" || m[2] === "type" ? m[2] : "ligne";
    const rowErrors = (out[row] ??= {});
    rowErrors[field] ??= message;
  }
  return out;
}

/// Première erreur sur les indicateurs (`indicators` ou `indicators.0.id`…).
export function indicatorsError(errors: Record<string, string>): string | undefined {
  const key = Object.keys(errors).find((k) => k === "indicators" || k.startsWith("indicators."));
  return key ? errors[key] : undefined;
}

/// Champs affichés quel que soit le format.
const ALWAYS_SHOWN = new Set([
  "theme",
  "sousTheme",
  "customId",
  "slug",
  "format",
  "statut",
  "sensibilite",
  "difficulte",
  "question",
  "precisions",
  "explication",
  "contextePedagogique",
  "miseEnPerspective",
  "dateDonnee",
  "auteur",
]);
const NUMERIC_FIELDS = new Set([
  "unite",
  "plageMin",
  "plageMax",
  "reponseNumerique",
  "toleranceVerte",
  "toleranceOrange",
]);

/// Erreurs sans champ visible où s'afficher (ex. champ propre à un format
/// qu'on vient de quitter) : listées en tête du formulaire plutôt que
/// perdues — sinon « N champs à corriger » sans rien à corriger à l'écran.
export function unplacedErrors(errors: Record<string, string>, format: string): [string, string][] {
  return Object.entries(errors).filter(([key]) => {
    if (/^sources\.\d+/.test(key) || key === "indicators" || key.startsWith("indicators.")) return false;
    if (ALWAYS_SHOWN.has(key)) return false;
    return format === "estimation_numerique" ? !NUMERIC_FIELDS.has(key) : key !== "payload";
  });
}
