/// Helpers partagés entre les deux écrans Recap (desktop `recap-dt.tsx` et
/// mobile `screens/recap.tsx`).
///
/// Avant : chaque écran avait sa propre `factFigure` / `keyFact` /
/// `shareQuestionCard` / logique de filtrage. Les deux divergeaient
/// silencieusement — par exemple, le desktop a longtemps retourné `"—"`
/// pour les formats composites (curseur_multi, classement, etc.) alors
/// que le mobile retombait sur le texte de la question. Un nouveau format
/// devait être ajouté à plusieurs endroits et on oubliait facilement
/// l'un des deux. Maintenant tout passe par ce fichier.

import type { Answer, Question } from "./types";
import type { DefiAnswersMap } from "./defi";
import { fmt } from "./fmt";
import { slugForQuestion } from "./question-slug";
import { isCorrect } from "./correctness";
import { getOrCreateClientId } from "./defi-client-id";
import { copyToClipboard } from "./clipboard";

/// Item du recap : la question, sa réponse non-null, et son index dans le
/// tableau d'origine (préservé pour permettre aux call sites — `onChallenge`
/// côté AppShell par exemple — de retrouver la question via l'index initial).
export type AnsweredItem = {
  q: Question;
  answer: Answer;
  originalIndex: number;
};

/// Filtre `questions[]` aux seules questions effectivement répondues
/// (`answers[i] != null`). Indispensable pour les "parties écourtées" : on
/// ne veut pas afficher 35 cartes vides quand le joueur a abandonné après 8
/// questions sur 43. Préserve l'index d'origine pour les callers qui
/// indexent dans le tableau initial.
export function getAnsweredItems(
  questions: Question[],
  answers: Answer[],
): AnsweredItem[] {
  return questions
    .map((q, i) => ({ q, answer: answers[i] as Answer, originalIndex: i }))
    .filter((x) => x.answer != null);
}

/// Au-delà, le libellé d'un élément ne précède plus son chiffre (« Retraites :
/// 45 % ») : la cellule du récap bureau passerait sur trois lignes.
const FIGURE_LABEL_MAX = 22;

function labelledFigure(label: string, figure: string): string {
  return label.length <= FIGURE_LABEL_MAX ? `${label} : ${figure}` : figure;
}

/// "Chiffre-clé" à mettre en avant dans une carte récap : un VRAI chiffre de
/// la question, ou rien. Pour les formats simples (estimation / ab /
/// vraifaux / qcm), c'est la réponse correcte formatée. Pour les formats
/// composites :
///   - classement : le chiffre du n°1 quand l'auteur l'a renseigné
///     (« Manutention manuelle : ~50 % »)
///   - curseur_multi : la plage des vraies valeurs (« 16–25 élèves »)
///   - pondere : la plus grosse part réelle (« Retraites : 45 % »)
///   - vraifaux_multi, categorisation : pas de chiffre → null
/// Avant, « Top 5 », « 8 items », « 100 pts » ou « 3/5 vraies » passaient pour
/// des chiffres-clés alors qu'ils ne décrivaient que la forme de la question.
///
/// null = pas de chiffre : l'écran affiche alors seulement l'énoncé. Ajouter
/// un nouveau format implique d'ajouter une branche ici (et seulement ici).
export function factFigure(q: Question): string | null {
  if (q.format === "estimation") {
    return fmt(q.answer, q.unitShort || q.unit);
  }
  if (q.format === "ab") {
    const c = q.choices[q.correctIndex];
    if (typeof c.valeur === "number") {
      return fmt(c.valeur, q.unite);
    }
    return c.label;
  }
  if (q.format === "vraifaux") return q.correctAnswer ? "Vrai" : "Faux";
  if (q.format === "qcm") return q.choices[q.correctIndex];
  if (q.format === "classement") {
    const top = q.items.find((it) => it.id === q.correctOrder[0]);
    const figure = top?.figure?.trim();
    return top && figure ? labelledFigure(top.label, figure) : null;
  }
  if (q.format === "curseur_multi") {
    const reals = q.items.map((it) => it.real).filter(Number.isFinite);
    if (reals.length === 0) return null;
    const unit = q.unit;
    const min = Math.min(...reals);
    const max = Math.max(...reals);
    if (min === max) return fmt(min, unit);
    // Plage min–max : donne l'amplitude observée entre les items, plus
    // parlant qu'une moyenne anonyme.
    return `${fmt(min)}–${fmt(max, unit)}`;
  }
  if (q.format === "pondere") {
    if (q.categories.length === 0 || q.pool <= 0) return null;
    const top = q.categories.reduce((a, b) => (b.real > a.real ? b : a));
    // Pool de 100 (le cas de toutes les questions) : la part est un %.
    const figure = q.pool === 100 ? fmt(top.real, "%") : `${fmt(top.real)} / ${q.pool}`;
    return labelledFigure(top.label, figure);
  }
  // vraifaux_multi, categorisation : aucun chiffre dans la question.
  return null;
}

/// Compose le "keyFact" en une seule ligne : chiffre-clé + extrait de la
/// question. Utilisé par le récap mobile (listes denses) où on n'a pas la
/// place de séparer figure et label en deux blocs. Le desktop préfère les
/// avoir séparés (cf. `factFigure` + `factText` séparément). Sans chiffre,
/// seulement l'énoncé.
export function keyFact(q: Question): string {
  const fig = factFigure(q);
  if (!fig) return q.question.length > 80 ? q.question.slice(0, 79) + "…" : q.question;
  const sliceLen = 80 - fig.length;
  const text = q.question.length > sliceLen
    ? q.question.slice(0, Math.max(20, sliceLen - 1)) + "…"
    : q.question;
  return `${fig} : ${text}`;
}

/// Texte court pour le label sous le chiffre-clé (recap desktop). Garde la
/// question lisible sans la tronquer trop agressivement.
export function factText(q: Question): string {
  return q.question.length > 90 ? q.question.slice(0, 87) + "…" : q.question;
}

/// Crée un défi "replay session" : POST /api/defis avec les questions et
/// réponses jouées dans la session récap. Retourne le shortCode et l'URL
/// `/d/[shortCode]` que l'utilisateur peut partager pour faire rejouer la
/// même session à un proche.
///
/// Réutilise volontairement l'infra Defi existante (table Defi, route
/// /d/[shortCode], API POST /api/defis) plutôt que de créer un nouveau
/// modèle. `source: "session"` distingue ces défis "replay" dans la liste
/// "Mes défis" du créateur ; côté friend, le flow de jeu est identique
/// (même /d/[shortCode]/page.tsx, mêmes mécaniques).
///
/// Contraintes API héritées :
///   - 3..10 questions (validateCreatePayload)
///   - creatorClientId stable (UUID localStorage)
///   - creatorPseudo non-vide ; default "Anonyme" si non fourni
///
/// Retourne null en cas d'échec (rate limit, validation, réseau, etc.) —
/// le caller affiche un message d'erreur générique. Le détail est silencé
/// volontairement (pas de fuite d'erreur backend dans l'UI utilisateur).
export async function createSessionReplayDefi(
  items: AnsweredItem[],
  pseudo?: string,
  /// Titre libre facultatif du défi (sera affiché EN PLUS du label thématique
  /// calculé par le serveur depuis les questions). Vide/undefined → null.
  title?: string,
  /// Rang de niveau (1..10) du créateur au moment de la création.
  /// Stocké en DB comme snapshot, affiché à l'ami sur la page d'invitation.
  /// Optionnel : null si le caller n'a pas accès au progress (rare).
  creatorLevelRank?: number | null,
): Promise<{ shortCode: string; url: string } | null> {
  if (typeof window === "undefined") return null;
  const clientId = getOrCreateClientId();
  if (!clientId) return null;

  // Reproduit la même forme de creatorAnswers que step-share.tsx :
  // { [questionId]: { value: <serialized>, correct: boolean } }. Le
  // backend (validateCreatePayload) accepte n'importe quelle valeur
  // JSON-sérialisable comme `value` — on passe la réponse telle quelle.
  const creatorAnswers: DefiAnswersMap = {};
  for (const { q, answer } of items) {
    creatorAnswers[q.id] = {
      value: (answer ?? null) as DefiAnswersMap[string]["value"],
      correct: isCorrect(q, answer),
    };
  }

  const trimmedTitle = (title ?? "").trim();

  const body = {
    creatorClientId: clientId,
    creatorPseudo: (pseudo ?? "").trim() || "Anonyme",
    questionIds: items.map((x) => x.q.id),
    source: "session" as const,
    title: trimmedTitle.length > 0 ? trimmedTitle : null,
    creatorAnswers,
    creatorLevelRank: creatorLevelRank ?? null,
  };

  try {
    const res = await fetch("/api/defis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { shortCode: string; url: string };
    return {
      shortCode: j.shortCode,
      url: `${window.location.origin}${j.url}`,
    };
  } catch {
    return null;
  }
}

/// Partage "curiosité" depuis le Recap : on partage UNE question (la favorite
/// sélectionnée), pas le score. Cohérent avec le ton éditorial "pas un score,
/// une cartographie". L'invité tombe sur /q/[slug] où il joue la question
/// seul, sans contexte de comparaison.
///
/// Retourne :
///   - "shared" : `navigator.share` a réussi (sheet OS natif)
///   - "copied" : fallback clipboard a réussi, le caller affiche "Lien copié ✓"
///   - "failed" : les deux ont échoué (permissions, SSR, etc.)
export async function shareQuestionCard(
  q: Question,
): Promise<"shared" | "copied" | "failed"> {
  if (typeof window === "undefined") return "failed";
  const slug = slugForQuestion(q);
  const url = `${window.location.origin}/q/${slug}`;
  const text =
    "Un chiffre civique sourcé sur Mon2027. Et toi, tu pensais quoi ?";
  const nav: Navigator | undefined =
    typeof navigator !== "undefined" ? navigator : undefined;
  if (nav && "share" in nav) {
    try {
      await nav.share({ title: q.question, text, url });
      return "shared";
    } catch {
      /* user cancelled — on tente le clipboard en fallback */
    }
  }
  const ok = await copyToClipboard(`${q.question}\n\n${text}\n${url}`);
  return ok ? "copied" : "failed";
}
