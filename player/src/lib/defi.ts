/// Helpers serveur pour le mode Défier un proche.
/// - Parsing/sérialisation des champs JSON du modèle Defi (questionIds,
///   creatorAnswers).
/// - Validation des shapes côté API (sans faire confiance au client).
/// - Construction des objets renvoyés aux écrans (C page).

import type { Question } from "./types";

/// Un "answer record" : la valeur que l'utilisateur a soumise + un booléen
/// "correct" tel qu'évalué côté client (cf. lib/correctness.ts).
/// `value: null` signifie "pas encore joué" — uniquement utilisé pour le
/// militant qui peut créer un défi sans avoir joué les 5 questions.
export type DefiAnswerRecord = {
  value: number | boolean | string | null | string[] | Record<string, unknown>;
  correct: boolean;
};

/// JSON map { [questionId]: DefiAnswerRecord }. Stocké tel quel en DB
/// dans Defi.creatorAnswers et DefiResponse.answers.
export type DefiAnswersMap = Record<string, DefiAnswerRecord>;

const MAX_QUESTIONS = 10;
const MIN_QUESTIONS = 3;
const MAX_LABEL = 40;
const MAX_PSEUDO = 40;
/// Titre libre du défi : assez de place pour une phrase (~ "Pour ma sœur
/// sceptique sur le climat"), sans risquer un débordement visuel sur la
/// carte ou le rendu OG. Vide → null en DB (champ optionnel).
const MAX_TITLE = 60;
const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

/// UUID v4 — format strict. On accepte v1..v5 pour ne pas refuser des
/// clients déjà déployés qui auraient utilisé une autre version, mais on
/// impose la structure (8-4-4-4-12 hex). Empêche un attaquant de soumettre
/// un clientId arbitraire qu'il aurait observé chez quelqu'un d'autre.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidClientUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

export function defaultExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + DEFAULT_EXPIRY_MS);
}

/// Parse Defi.questionIds (JSON string array). Lève si invalide.
export function parseQuestionIds(blob: string): string[] {
  const arr = JSON.parse(blob) as unknown;
  if (!Array.isArray(arr) || arr.some((s) => typeof s !== "string")) {
    throw new Error("invalid_questionIds_blob");
  }
  return arr as string[];
}

/// Parse Defi.creatorAnswers / DefiResponse.answers (JSON map).
export function parseAnswersMap(blob: string): DefiAnswersMap {
  const obj = JSON.parse(blob) as unknown;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("invalid_answers_blob");
  }
  // Validation légère : chaque entrée doit avoir { value, correct }.
  const result: DefiAnswersMap = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const rec = v as { value?: unknown; correct?: unknown };
    if (typeof rec.correct !== "boolean") continue;
    result[k] = {
      value: (rec.value ?? null) as DefiAnswerRecord["value"],
      correct: rec.correct,
    };
  }
  return result;
}

/// Sérialise un answers map vers le format colonne JSON string.
export function serializeAnswersMap(map: DefiAnswersMap): string {
  return JSON.stringify(map);
}

/// Compte les réponses correctes. Source de vérité pour score serveur.
///
/// `onlyIds` : ne compte que ces questions — typiquement les questions du
/// défi encore publiées (cf. playableQuestionIds). Sans lui, une entrée
/// hors défi ou une question dépubliée depuis la création gonflerait le
/// score par rapport au nombre de questions réellement jouables.
export function scoreFromAnswers(
  map: DefiAnswersMap,
  onlyIds?: Iterable<string>,
): number {
  const allowed = onlyIds ? new Set(onlyIds) : null;
  let n = 0;
  for (const k in map) {
    if (allowed && !allowed.has(k)) continue;
    if (map[k].correct) n++;
  }
  return n;
}

/// Questions d'un défi encore jouables : identifiants de `questionIds`
/// (ordre et unicité conservés) dont la question a pu être chargée. Une
/// question dépubliée après la création n'empêche pas de jouer les autres ;
/// le total et les scores affichés se calculent alors sur cette liste.
export function playableQuestionIds(
  questionIds: ReadonlyArray<string>,
  loadedIds: Iterable<string>,
): string[] {
  const loaded = new Set(loadedIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of questionIds) {
    if (!loaded.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/// Validation d'un body POST de création de défi. Retourne soit le payload
/// nettoyé, soit un message d'erreur HTTP-friendly.
export type CreatePayload = {
  creatorClientId: string;
  creatorPseudo: string;
  questionIds: string[];
  /// "theme" : 5 questions tirées d'un thème (flow normal de défi-create).
  /// "favoris" : 5 questions piochées dans les favoris du militant.
  /// "session" : ensemble exact des questions jouées en session récap
  /// (création depuis le bouton "Défier" du récap — replay link).
  source: "theme" | "favoris" | "session";
  themeId: string | null;
  /// Titre libre facultatif. null si le militant a laissé le champ vide.
  /// On nettoie (trim + slice MAX_TITLE) côté serveur — on ne fait pas
  /// confiance à la validation client.
  title: string | null;
  creatorAnswers: DefiAnswersMap;
  /// Rang de niveau du militant (1..10) au moment de la création. Snapshot
  /// figé. Optionnel : un ancien client sans gamification peut envoyer
  /// undefined, on stockera null. Bornes strictes pour ne pas accepter
  /// n'importe quel entier client-side.
  creatorLevelRank: number | null;
};

export function validateCreatePayload(body: unknown):
  | { ok: true; data: CreatePayload }
  | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "missing_body", status: 400 };
  }
  const b = body as Record<string, unknown>;
  if (!isValidClientUuid(b.creatorClientId)) {
    return { ok: false, error: "bad_creatorClientId", status: 400 };
  }
  if (typeof b.creatorPseudo !== "string" || b.creatorPseudo.trim().length === 0) {
    return { ok: false, error: "bad_creatorPseudo", status: 400 };
  }
  if (!Array.isArray(b.questionIds)) {
    return { ok: false, error: "bad_questionIds", status: 400 };
  }
  if (b.questionIds.length < MIN_QUESTIONS || b.questionIds.length > MAX_QUESTIONS) {
    return { ok: false, error: "questionIds_count", status: 400 };
  }
  if (b.questionIds.some((q) => typeof q !== "string")) {
    return { ok: false, error: "bad_questionIds", status: 400 };
  }
  if (
    b.source !== "theme" &&
    b.source !== "favoris" &&
    b.source !== "session"
  ) {
    return { ok: false, error: "bad_source", status: 400 };
  }
  if (b.source === "theme" && typeof b.themeId !== "string") {
    return { ok: false, error: "missing_themeId", status: 400 };
  }
  if (!b.creatorAnswers || typeof b.creatorAnswers !== "object") {
    return { ok: false, error: "missing_creatorAnswers", status: 400 };
  }
  // Titre facultatif : on accepte string ou rien. Si fourni, on impose le
  // type string strict (rejette objets/arrays/nombres déguisés). Trim + cap
  // appliqués au moment de construire le payload nettoyé plus bas.
  if (b.title !== undefined && b.title !== null && typeof b.title !== "string") {
    return { ok: false, error: "bad_title", status: 400 };
  }
  // Parse + reserialize pour normaliser et écarter les entrées mal formées.
  let answers: DefiAnswersMap;
  try {
    answers = parseAnswersMap(JSON.stringify(b.creatorAnswers));
  } catch {
    return { ok: false, error: "bad_creatorAnswers", status: 400 };
  }
  const titleTrimmed =
    typeof b.title === "string" ? b.title.trim().slice(0, MAX_TITLE) : "";
  // Level rank facultatif : on accepte un entier 1..10, ou rien. Tout ce qui
  // est hors bornes (négatif, > 10, NaN, string déguisée) tombe à null.
  let levelRank: number | null = null;
  if (typeof b.creatorLevelRank === "number" && Number.isFinite(b.creatorLevelRank)) {
    const r = Math.floor(b.creatorLevelRank);
    if (r >= 1 && r <= 10) levelRank = r;
  }
  return {
    ok: true,
    data: {
      creatorClientId: b.creatorClientId,
      creatorPseudo: b.creatorPseudo.trim().slice(0, MAX_PSEUDO),
      questionIds: b.questionIds as string[],
      source: b.source as "theme" | "favoris" | "session",
      themeId: b.source === "theme" ? (b.themeId as string) : null,
      title: titleTrimmed.length > 0 ? titleTrimmed : null,
      creatorAnswers: answers,
      creatorLevelRank: levelRank,
    },
  };
}

/// Validation d'un body POST de réponse de l'ami.
export type ResponsePayload = {
  amiClientId: string;
  amiLabel: string;
  answers: DefiAnswersMap;
  /// Opt-out explicite du rattachement au compte connecté. Set par le client
  /// quand l'utilisateur a explicitement cliqué "Pas moi" sur l'écran B1
  /// (ex. PC familial : il est logged in mais c'est quelqu'un d'autre qui
  /// joue). Le serveur force alors `amiUserId = null` malgré la session.
  /// Optionnel — défaut false.
  playAsGuest: boolean;
};

export function validateResponsePayload(body: unknown):
  | { ok: true; data: ResponsePayload }
  | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "missing_body", status: 400 };
  }
  const b = body as Record<string, unknown>;
  if (!isValidClientUuid(b.amiClientId)) {
    return { ok: false, error: "bad_amiClientId", status: 400 };
  }
  if (typeof b.amiLabel !== "string") {
    return { ok: false, error: "bad_amiLabel", status: 400 };
  }
  if (!b.answers || typeof b.answers !== "object") {
    return { ok: false, error: "missing_answers", status: 400 };
  }
  // `playAsGuest` est best-effort : un client qui ne l'envoie pas (vieille
  // version ou implémentation alternative) tombe sur false, comportement
  // d'avant l'opt-out — donc rétrocompatible.
  const playAsGuest = b.playAsGuest === true;
  let answers: DefiAnswersMap;
  try {
    answers = parseAnswersMap(JSON.stringify(b.answers));
  } catch {
    return { ok: false, error: "bad_answers", status: 400 };
  }
  return {
    ok: true,
    data: {
      amiClientId: b.amiClientId,
      amiLabel: b.amiLabel.trim().slice(0, MAX_LABEL) || "Anonyme",
      answers,
      playAsGuest,
    },
  };
}

/// Réordonne un set de Question[] selon l'ordre d'origine défini par
/// questionIds. Saute les questions absentes (cas où l'admin a dépublié
/// une question entre la création du défi et la lecture).
export function reorderQuestions(
  questions: Question[],
  questionIds: string[]
): Question[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((q): q is Question => q !== undefined);
}
