"use client";

import type { Question } from "@/lib/types";
import { ThemeBadge } from "../theme-badge";

/// En-tête compact de la question sur écran large. Remplace les rails
/// latéraux, retirés le 2026-11-07 : le rail droit ne portait plus qu'une
/// astuce générique, et le gauche répétait ce que la question montre déjà
/// (format, libellé « Difficile » sous les étoiles) avec une progression en
/// tirets illisible au-delà de quelques questions.
///
///   [Thème] ★★★★☆                                         01 / 50
///   ───────────────────────────────────────────────────── (progression)
export function QuestionBar({
  q,
  index,
  total,
  accent,
}: {
  q: Question;
  index: number;
  total: number;
  accent: string;
}) {
  const d = q.difficulte != null ? Math.max(1, Math.min(5, Math.round(q.difficulte))) : null;
  const pct = total > 0 ? ((index + 1) / total) * 100 : 100;
  return (
    <div className="dt-question-bar">
      <div className="dt-question-bar-row">
        <div className="dt-question-bar-left">
          {/* Variante « solid » : c'est le badge « foyer » de la question en
              cours (cf. components/theme-badge.tsx). */}
          <ThemeBadge label={q.theme} variant="solid" size="sm" />
          {d != null ? (
            <span
              className="dt-question-bar-diff"
              role="img"
              aria-label={`Difficulté ${d} sur 5`}
              title={`Difficulté ${d} sur 5`}
            >
              <span style={{ color: "var(--ink)" }}>{"★".repeat(d)}</span>
              <span style={{ color: "var(--ink)", opacity: 0.22 }}>{"★".repeat(5 - d)}</span>
            </span>
          ) : null}
        </div>
        {total > 1 ? (
          <span className="dt-question-bar-position tnum" aria-label={`Question ${index + 1} sur ${total}`}>
            <strong>{String(index + 1).padStart(2, "0")}</strong> / {String(total).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      {/* Une barre continue plutôt qu'un segment par question : lisible quel
          que soit le nombre de questions. Masquée pour une question isolée. */}
      {total > 1 ? (
        <div
          className="dt-question-bar-progress"
          role="progressbar"
          aria-label="Progression de la partie"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
        >
          <div style={{ width: `${pct}%`, background: accent || "var(--yellow)" }} />
        </div>
      ) : null}
    </div>
  );
}
