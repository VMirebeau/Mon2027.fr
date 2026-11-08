import type { Question } from "./types";

/// Texte de dossier réellement rempli (ni absent, ni blanc).
export function hasText(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/// Ce qu'annonce la languette repliée du dossier mobile : le contenu réel
/// (« Le chiffre en détail · sources ») et le début du premier texte, au lieu
/// de « Dossier · Économie » qui ne disait pas ce qu'il y avait dedans.
/// L'ordre suit celui des sections du dossier (chiffre en détail, contexte,
/// mise en perspective, sources).
export function dossierSummary(
  q: Pick<Question, "why" | "explain" | "miseEnPerspective" | "sources">,
  maxExcerpt = 90,
): { label: string; excerpt: string | null } {
  const lead = hasText(q.explain)
    ? "Le chiffre en détail"
    : hasText(q.why)
      ? "Contexte"
      : hasText(q.miseEnPerspective)
        ? "Mise en perspective"
        : null;
  const hasSources = q.sources.length > 0;
  const label = lead
    ? hasSources
      ? `${lead} · sources`
      : lead
    : hasSources
      ? "Sources"
      : "Dossier";
  const first = [q.explain, q.why, q.miseEnPerspective].find(hasText);
  return { label, excerpt: first ? truncateAtWord(first.trim(), maxExcerpt) : null };
}

/// Coupe au dernier espace avant `max` caractères et ajoute « … ». La
/// languette tronque aussi visuellement (ellipse CSS) : cette coupe-ci garde
/// le nom accessible du bouton court pour les lecteurs d'écran.
export function truncateAtWord(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:.\u2013\u2014-]+$/, "") + "…";
}
