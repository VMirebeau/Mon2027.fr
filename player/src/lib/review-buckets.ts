import type { Question } from "./types";

/// Réponse réduite à l'essentiel pour le tri en buckets — on a besoin
/// de "était-ce juste ?", "à quel ts l'a-t-on jouée ?" (pour l'ordre), et
/// optionnellement de l'état SRS (`nextDueAt`) pour décider si la question
/// est dûe à révision aujourd'hui ou non.
export type AnswerLite = {
  correct: boolean;
  ts: number;
  /// Présent dès qu'une réponse a été enregistrée par le système SRS. Quand
  /// absent (réponses legacy ou tests), on retombe sur "wrong = todo,
  /// correct = done", sans cadence.
  srs?: { nextDueAt: number };
};

/// Trie les questions par bucket en se basant sur progress.answers.
/// Ordre interne : récent → ancien (ts décroissant).
///
/// Sémantique :
///   - `todo` : questions "à revoir maintenant" — fautes + bonnes réponses
///              dont le SRS dit qu'il est temps de les retester (oubli probable).
///   - `done` : questions correctes ET pas encore dûes (« Programmées » :
///              leur prochaine révision est planifiée).
///   - `all`  : tout ce qui a été répondu, dans l'ordre chronologique inversé.
///
/// Helper pur (sans state) — partagé par useReviewView et la version
/// mobile/desktop de l'écran Réviser. `now` injectable pour tests.
export function bucketize(
  questions: Question[],
  answers: Record<string, AnswerLite>,
  now: number = Date.now(),
): { todo: Question[]; done: Question[]; all: Question[] } {
  const todo: Question[] = [];
  const done: Question[] = [];
  const all: Question[] = [];
  const withTs = questions
    .map((q) => ({ q, ts: answers[q.id]?.ts ?? 0 }))
    .filter((x) => x.ts > 0)
    .sort((a, b) => b.ts - a.ts);
  for (const { q } of withTs) {
    all.push(q);
    const a = answers[q.id];
    if (!a) continue;
    // Bucket "todo" = à revoir. Une question fausse y va toujours
    // (l'utilisateur doit la rattraper). Une question juste y va si son
    // intervalle SRS est dépassé (la mémoire a eu le temps de s'étioler,
    // c'est le moment de la retester). Sans SRS (legacy), la question juste
    // reste en `done`.
    // (Avant : une erreur n'était « à revoir » qu'une fois son échéance SRS
    // passée, soit 24 h plus tard — entre-temps elle apparaissait dans
    // l'onglet des réussites, ce qui contredisait la règle ci-dessus.)
    const isDueNow = !a.correct || (a.srs ? a.srs.nextDueAt <= now : false);
    if (isDueNow) todo.push(q);
    else done.push(q);
  }
  return { todo, done, all };
}
