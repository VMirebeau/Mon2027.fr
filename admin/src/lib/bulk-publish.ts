import { questionSchema } from "@/lib/schema";

/// Publication en masse des brouillons (superadmin). Fonctions pures, sans
/// accès base : testables isolément. L'action elle-même est dans
/// lib/collab-actions.ts.

/// Colonnes d'une question en base utiles au contrôle.
export type DraftRow = {
  customId: string | null;
  slug: string | null;
  theme: string;
  sousTheme: string | null;
  format: string;
  statut: string;
  sensibilite: string;
  difficulte: number;
  question: string;
  precisions: string | null;
  explication: string;
  contextePedagogique: string | null;
  miseEnPerspective: string | null;
  indicators: string | null;
  unite: string | null;
  plageMin: number | null;
  plageMax: number | null;
  reponseNumerique: number | null;
  toleranceVerte: number | null;
  toleranceOrange: number | null;
  payload: string | null;
  dateDonnee: number | null;
  auteur: string;
  valideurs: string | null;
  sources: ReadonlyArray<{ nom: string; url: string; type: string; ordre: number }>;
};

/// Projection d'une ligne de la base vers l'entrée du formulaire (chaînes
/// vides plutôt que null, indicateurs décodés), pour lui appliquer
/// exactement les mêmes règles que l'enregistrement par le formulaire.
export function draftToFormInput(q: DraftRow): Record<string, unknown> {
  const text = (v: string | null) => v ?? "";
  const num = (v: number | null) => (v === null ? "" : v);
  let indicators: unknown = [];
  try {
    indicators = q.indicators ? JSON.parse(q.indicators) : [];
  } catch {
    indicators = "illisible";
  }
  return {
    customId: text(q.customId),
    slug: text(q.slug),
    theme: q.theme,
    sousTheme: text(q.sousTheme),
    format: q.format,
    statut: q.statut,
    sensibilite: q.sensibilite,
    difficulte: q.difficulte,
    question: q.question,
    precisions: text(q.precisions),
    explication: q.explication,
    contextePedagogique: text(q.contextePedagogique),
    miseEnPerspective: text(q.miseEnPerspective),
    indicators,
    unite: text(q.unite),
    plageMin: num(q.plageMin),
    plageMax: num(q.plageMax),
    reponseNumerique: num(q.reponseNumerique),
    toleranceVerte: num(q.toleranceVerte),
    toleranceOrange: num(q.toleranceOrange),
    payload: text(q.payload),
    dateDonnee: q.dateDonnee ?? "",
    auteur: q.auteur,
    valideurs: text(q.valideurs),
    sources: q.sources.map((s) => ({ nom: s.nom, url: s.url, type: s.type, ordre: s.ordre })),
  };
}

/// Motif pour lequel un brouillon ne doit pas partir en ligne avec les
/// autres, ou null s'il est publiable : il doit passer la validation du
/// formulaire et citer au moins une source (une question sans source n'est
/// jamais publiée en masse).
export function draftBlocker(q: DraftRow): string | null {
  if (q.sources.length === 0) return "aucune source";
  const parsed = questionSchema.safeParse(draftToFormInput(q));
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const field = issue.path.length > 0 ? `${issue.path.join(".")} : ` : "";
  return `${field}${issue.message}`;
}

/// Résumé lisible du résultat, pour le message affiché après coup.
export function bulkPublishMessage(args: {
  published: number;
  blocked: ReadonlyArray<{ label: string; reason: string }>;
  changed: number;
}): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  const parts = [`${plural(args.published, "brouillon publié", "brouillons publiés")}.`];
  if (args.blocked.length > 0) {
    const shown = args.blocked.slice(0, 5).map((b) => `${b.label} (${b.reason})`).join(" ; ");
    const more = args.blocked.length > 5 ? ` et ${args.blocked.length - 5} autres` : "";
    parts.push(`${plural(args.blocked.length, "laissé", "laissés")} en brouillon, à corriger : ${shown}${more}.`);
  }
  if (args.changed > 0) {
    parts.push(
      `${plural(args.changed, "question modifiée", "questions modifiées")} entre-temps ou déjà ${args.changed > 1 ? "sorties" : "sortie"} du statut brouillon : non ${args.changed > 1 ? "publiées" : "publiée"}, recharge la page.`,
    );
  }
  return parts.join(" ");
}
