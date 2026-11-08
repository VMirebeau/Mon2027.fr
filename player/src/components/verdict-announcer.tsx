"use client";

/// Région ARIA cachée visuellement, lue par les screen readers quand le
/// verdict d'une question apparaît. Sans elle, les utilisateurs assistifs
/// ne sont jamais avertis du résultat — seul le badge ✓/✗ visuel les renseigne,
/// ce qui est inaccessible.
///
/// Convention : `role="status"` + `aria-live="polite"` = annonce non-intrusive,
/// le screen reader attend que l'utilisateur ait fini sa lecture en cours
/// avant d'annoncer. Le contenu textuel change quand `showVerdict` passe à
/// true, ce qui déclenche l'annonce.
///
/// Mêmes mots que les pastilles visuelles (LEVEL_LABEL : Bien vu / Pas
/// loin / Pas cette fois), niveau calculé par la fonction unique answerLevel.

import { answerLevel, formatUserAnswer, LEVEL_LABEL } from "@/lib/correctness";
import type { Answer, Question } from "@/lib/types";

export function VerdictAnnouncer({
  q,
  answer,
  showVerdict,
}: {
  q: Question;
  /// La réponse jouée par l'utilisateur. null = pas encore répondu.
  answer: Answer;
  /// True quand la phase verdict (ou plus tard) est atteinte. Tant que
  /// false, on rend une chaîne vide pour ne pas annoncer "avant" le tap.
  showVerdict: boolean;
}) {
  let message = "";
  if (showVerdict) {
    const level = answerLevel(q, answer);
    const userAnswerLabel = formatUserAnswer(q, answer);
    // Libellé du niveau + ce qui a été joué (« Pas loin. Ton estimation :
    // 820 000. », « Bien vu. Tu as répondu : 5/5 bien placés. »).
    const what = q.format === "estimation" ? "Ton estimation" : "Tu as répondu";
    message = `${LEVEL_LABEL[level]}. ${what} : ${userAnswerLabel}.`;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // Visuellement masqué (technique sr-only manuelle pour ne pas dépendre
      // d'une classe globale). 1×1px hors flow, clip pour les lecteurs
      // d'écran qui ignorent display:none.
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {message}
    </div>
  );
}
