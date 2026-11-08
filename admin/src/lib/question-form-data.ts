import type { QuestionInput } from "@/lib/schema";

/// Lecture du formulaire de question et projection vers les colonnes de la
/// base. Module ordinaire (pas « use server ») : partagé par les actions
/// d'enregistrement (lib/actions.ts) et l'aperçu jouable
/// (lib/preview-actions.ts), pour que l'aperçu montre exactement ce qui
/// serait enregistré.

export function parseFormData(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "sourcesJson" || key === "indicatorsJson") continue;
    raw[key] = value;
  }
  const sourcesJson = formData.get("sourcesJson");
  if (typeof sourcesJson === "string" && sourcesJson.trim() !== "") {
    try {
      raw.sources = JSON.parse(sourcesJson);
    } catch {
      raw.sources = [];
    }
  } else {
    raw.sources = [];
  }
  const indicatorsJson = formData.get("indicatorsJson");
  if (typeof indicatorsJson === "string" && indicatorsJson.trim() !== "") {
    try {
      raw.indicators = JSON.parse(indicatorsJson);
    } catch {
      raw.indicators = [];
    }
  } else {
    raw.indicators = [];
  }
  return raw;
}

/// Colonnes écrites depuis le formulaire. `valideurs` n'en fait plus partie :
/// il est calculé à la publication à partir des validations réelles.
export function toPersistence(input: QuestionInput) {
  // Champs d'estimation : seulement pour ce format. Une question convertie
  // (estimation → vrai/faux ou A/B) gardait sinon ses anciennes plage et
  // réponse, invisibles dans le formulaire mais comptées dans l'empreinte
  // du contenu (nettoyage des 126 restes le 2026-11-08).
  const est = input.format === "estimation_numerique";
  return {
    customId: input.customId?.trim() ? input.customId.trim() : null,
    slug: input.slug?.trim() ? input.slug.trim() : null,
    theme: input.theme,
    sousTheme: input.sousTheme?.trim() ? input.sousTheme.trim() : null,
    format: input.format,
    statut: input.statut,
    sensibilite: input.sensibilite,
    difficulte: input.difficulte,
    question: input.question.trim(),
    precisions: input.precisions?.trim() ? input.precisions.trim() : null,
    explication: input.explication.trim(),
    contextePedagogique: input.contextePedagogique?.trim()
      ? input.contextePedagogique.trim()
      : null,
    miseEnPerspective: input.miseEnPerspective?.trim()
      ? input.miseEnPerspective.trim()
      : null,
    /// indicators stocké en JSON sérialisé sur la colonne SQLite. Liste vide
    /// = NULL, pour pouvoir distinguer "non taggé" vs "taggé sans match" côté
    /// agrégation portrait.
    indicators: input.indicators.length > 0 ? JSON.stringify(input.indicators) : null,
    unite: est && input.unite?.trim() ? input.unite.trim() : null,
    plageMin: est ? (input.plageMin ?? null) : null,
    plageMax: est ? (input.plageMax ?? null) : null,
    reponseNumerique: est ? (input.reponseNumerique ?? null) : null,
    toleranceVerte: est ? (input.toleranceVerte ?? null) : null,
    toleranceOrange: est ? (input.toleranceOrange ?? null) : null,
    payload: input.payload?.trim() ? input.payload.trim() : null,
    dateDonnee: input.dateDonnee ?? null,
    auteur: input.auteur.trim(),
  };
}

/// L'ordre affiché dans le formulaire fait foi. (Avant : `s.ordre ?? idx`,
/// mais le schéma met `ordre` à 0 par défaut et le formulaire ne l'envoie
/// pas — chaque enregistrement aplatissait l'ordre des sources à 0.)
export function toSources(input: QuestionInput) {
  return input.sources.map((s, idx) => ({
    nom: s.nom,
    url: s.url,
    type: s.type,
    ordre: idx,
  }));
}
