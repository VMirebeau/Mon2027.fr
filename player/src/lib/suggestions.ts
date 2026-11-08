/// Propositions des joueurs (erreur, source, formulation, nouvelle question)
/// envoyées à l'espace contributeurs. Validation pure, partagée entre la
/// route API et l'interface. Les valeurs doivent rester alignées avec
/// admin/src/lib/workflow.ts (SUGGESTION_KINDS).

/// Types proposés depuis une question précise.
export const QUESTION_SUGGESTION_KINDS = [
  { value: "erreur", label: "Une erreur dans la réponse ou les chiffres" },
  { value: "source", label: "Une source à ajouter ou à corriger" },
  { value: "formulation", label: "La question est ambiguë ou mal formulée" },
  { value: "autre", label: "Autre remarque" },
] as const;

/// Types proposés hors question (page Méthode).
export const GENERAL_SUGGESTION_KINDS = [
  { value: "nouvelle_question", label: "Proposer une nouvelle question" },
  { value: "autre", label: "Autre remarque sur l'app" },
] as const;

const KINDS = new Set(["erreur", "source", "formulation", "autre", "nouvelle_question"]);

export const SUGGESTION_LIMITS = { messageMin: 10, messageMax: 2000, urlMax: 500 } as const;

export type SuggestionInput = {
  kind: string;
  questionCustomId: string | null;
  message: string;
  sourceUrl: string | null;
};

export type ParseResult =
  | { ok: true; data: SuggestionInput }
  | { ok: false; error: string; honeypot?: boolean };

/// Retire les caractères de contrôle (sauf retours à la ligne et tabulations).
function clean(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function parseSuggestion(body: unknown): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Requête invalide." };
  const b = body as Record<string, unknown>;

  // Champ piège invisible pour les humains : rempli = robot. On fait mine
  // d'accepter (pas d'indice pour le robot), sans rien enregistrer.
  if (typeof b.website === "string" && b.website.trim() !== "") {
    return { ok: false, error: "", honeypot: true };
  }

  const kind = typeof b.kind === "string" ? b.kind : "";
  if (!KINDS.has(kind)) return { ok: false, error: "Type de proposition inconnu." };

  let questionCustomId: string | null = null;
  if (kind !== "nouvelle_question" && b.questionId !== undefined && b.questionId !== null && b.questionId !== "") {
    if (typeof b.questionId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(b.questionId)) {
      return { ok: false, error: "Question inconnue." };
    }
    questionCustomId = b.questionId;
  }
  if (["erreur", "source", "formulation"].includes(kind) && !questionCustomId) {
    return { ok: false, error: "Indique la question concernée." };
  }

  const message = typeof b.message === "string" ? clean(b.message) : "";
  if (message.length < SUGGESTION_LIMITS.messageMin) {
    return { ok: false, error: `Explique un peu plus (au moins ${SUGGESTION_LIMITS.messageMin} caractères).` };
  }
  if (message.length > SUGGESTION_LIMITS.messageMax) {
    return { ok: false, error: `${SUGGESTION_LIMITS.messageMax} caractères maximum.` };
  }

  let sourceUrl: string | null = null;
  if (typeof b.sourceUrl === "string" && b.sourceUrl.trim() !== "") {
    const raw = b.sourceUrl.trim();
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { ok: false, error: "Le lien de la source n'est pas une adresse web valide." };
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || raw.length > SUGGESTION_LIMITS.urlMax) {
      return { ok: false, error: "Le lien de la source doit commencer par https://." };
    }
    sourceUrl = url.toString();
  }

  return { ok: true, data: { kind, questionCustomId, message, sourceUrl } };
}
