/// Slug d'URL pour les questions publiques `/q/[slug]`.
///
/// Génération déterministe depuis `question.text` :
/// - normalisation NFKD pour décomposer les accents
/// - retire diacritiques, ponctuation, et chars non-ASCII
/// - lowercase
/// - mots collés par `-`, troncature ~60 chars (sans couper un mot s'il
///   reste assez d'espace)
///
/// Pas de stockage en DB : le slug est recalculable à la volée à partir
/// du texte. La page `/q/[slug]` fait un linear scan sur toutes les
/// questions publiées (qq centaines max, négligeable).
///
/// Collisions : très peu probables vu la longueur (60 chars). Si jamais,
/// on disambigue avec le `customId` en suffixe (rare cas où deux textes
/// produisent le même slug).

const MAX_LEN = 60;

import type { Question } from "./types";

/// Transforme un texte en slug URL-safe. Pur, déterministe.
export function slugifyQuestionText(text: string): string {
  const stripped = text
    // Décompose les accents puis retire les marques de combinaison
    // (é → e + combining acute → e).
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    // Lowercase ASCII.
    .toLowerCase()
    // Remplace tout ce qui n'est pas lettre/chiffre par un espace.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (stripped.length === 0) return "q";

  // Coupe à ~60 chars sans casser un mot quand possible.
  let cut = stripped.slice(0, MAX_LEN);
  if (stripped.length > MAX_LEN) {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 20) {
      cut = cut.slice(0, lastSpace);
    }
  }
  return cut.replace(/\s+/g, "-");
}

/// Slug d'une Question.
/// - Si la question a un `slug` défini en DB (set côté admin), on le retourne
///   tel quel : c'est le slug canonique court (2-3 mots), idéal pour le partage.
/// - Sinon, on retombe sur un slug auto-généré depuis le texte (rétro-compat
///   pour les questions sans slug en base).
export function slugForQuestion(
  q: Pick<Question, "question"> & { slug?: string }
): string {
  if (q.slug && q.slug.length > 0) return q.slug;
  return slugifyQuestionText(q.question);
}

/// Trouve la question correspondant à un slug donné dans une liste.
/// Le match teste d'abord le slug DB puis l'auto-slug : permet aux anciens
/// liens partagés (auto-slug) de continuer à fonctionner même après qu'on a
/// défini un slug court côté admin pour la même question.
export function findQuestionBySlug(
  questions: Question[],
  slug: string
): Question | undefined {
  const target = slug.toLowerCase();
  return questions.find((q) => {
    if (q.slug && q.slug.toLowerCase() === target) return true;
    return slugifyQuestionText(q.question) === target;
  });
}
