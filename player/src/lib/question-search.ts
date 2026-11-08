/// Recherche full-text simple sur le catalogue de questions.
///
/// Stratégie : on normalise le terme et chaque champ recherchable (énoncé,
/// précisions, thème) en lowercase + suppression des diacritiques. On match
/// par sous-chaîne — pas de tokenisation ni de recherche flou : avec ~450
/// questions le passage linéaire est < 1ms et l'utilisateur tape vite, donc
/// les match exacts suffisent. Si la base passe à plusieurs milliers de
/// questions, on remontera vers une indexation côté serveur ou un mini-index
/// Fuse.js en lazy.
///
/// Tri du résultat :
///   1. match dans l'énoncé (q.question) → score 3
///   2. match dans les précisions → score 2
///   3. match dans le thème → score 1
/// Au sein d'un même score : ordre catalogue préservé. Le cap (`limit`) est
/// appliqué après tri pour exposer les meilleurs match d'abord.

import type { Question } from "./types";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function searchQuestions(
  questions: Question[],
  query: string,
  limit: number = 30,
): Question[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  const scored: Array<{ q: Question; score: number; idx: number }> = [];
  questions.forEach((q, idx) => {
    const questionText = normalize(q.question);
    const themeText = normalize(q.theme);
    const precisionsText = q.precisions ? normalize(q.precisions) : "";
    let score = 0;
    if (questionText.includes(needle)) score = 3;
    else if (precisionsText.includes(needle)) score = 2;
    else if (themeText.includes(needle)) score = 1;
    if (score > 0) scored.push({ q, score, idx });
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  return scored.slice(0, limit).map((x) => x.q);
}
