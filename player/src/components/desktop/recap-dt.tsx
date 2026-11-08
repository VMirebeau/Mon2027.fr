"use client";

import { useState } from "react";
import type { Answer, NavTarget, Question } from "@/lib/types";
import {
  CLOSENESS_COLOR as COLOR,
  closenessOf,
  type Closeness,
} from "@/lib/closeness";
import {
  type AnsweredItem,
  factFigure,
  factText,
  getAnsweredItems,
} from "@/lib/recap-helpers";
import { ExportPdfLink } from "../export-pdf-link";
import { ProfileImpactBlock } from "../profile-impact";
import { ShareQuestionModal, ShareSessionModal } from "../share-modals";
import { ThemeBadge } from "../theme-badge";

export function RecapDT({
  questions,
  answers,
  onRestart,
  onNavigate,
}: {
  questions: Question[];
  answers: Answer[];
  onRestart: () => void;
  /// Conservé dans la signature pour ne pas casser le call site côté
  /// AppShell qui passait toujours `onChallenge`. La logique a migré vers
  /// `ShareSessionModal` qui crée le défi côté client (POST /api/defis),
  /// donc on n'a plus besoin du callback de navigation vers la scène
  /// defi-create. Le caller peut continuer à le passer — on l'ignore.
  onChallenge?: (fav: number) => void;
  /// Nav vers les autres scènes (passé par AppShell), utilisé par
  /// ProfileImpactBlock pour amener vers Mon profil au clic.
  onNavigate?: (target: NavTarget) => void;
}) {
  // Stats globales (sur la session entière, pour le hero).
  const total = questions.length;
  const answeredCount = answers.filter((a) => a != null).length;
  const isPartial = answeredCount < total;

  // Cartes affichées : uniquement les questions auxquelles l'utilisateur a
  // effectivement répondu (cf. `getAnsweredItems`). Sur une "partie
  // écourtée", on évite la grille à 43 cellules dont 35 sont vides.
  const answeredItems = getAnsweredItems(questions, answers);
  const closeness = answeredItems.map((x) => closenessOf(x.q, x.answer));
  const closeCount = closeness.filter((c) => c === "close").length;

  // Modals : la session-share (Défier) et la card-share (clic carte).
  // Avant on avait un système de "favorite" qui sélectionnait une carte +
  // un bouton "Partager ce chiffre" global — supprimé parce que les
  // implications (qu'est-ce qu'on partage si je clique sans avoir
  // sélectionné ?) étaient trop floues côté UX. Maintenant la sémantique
  // est claire : clic carte = partage de cette question, clic Défier =
  // partage de la session entière en replay.
  const [sessionShareOpen, setSessionShareOpen] = useState(false);
  const [cardModal, setCardModal] = useState<AnsweredItem | null>(null);

  return (
    <>
      <div className="dt-page">
        <div className="dt-content">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "end",
              gap: 32,
            }}
          >
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-mute)",
                  marginBottom: 14,
                }}
              >
                {isPartial ? "Récap · Partie écourtée" : "Récap · Partie rapide"}
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 64,
                  lineHeight: 1.0,
                  letterSpacing: "-0.03em",
                  margin: 0,
                  textWrap: "balance",
                  maxWidth: 800,
                }}
              >
                {answeredCount === 0 ? (
                  <>Tu n&apos;as pas répondu pour l&apos;instant.</>
                ) : (
                  <>
                    Tu as découvert{" "}
                    <span style={{ color: "var(--coral)" }}>
                      {answeredCount} chiffre{answeredCount > 1 ? "s" : ""}-clé
                      {answeredCount > 1 ? "s" : ""}
                    </span>
                    {isPartial ? (
                      <>
                        {" "}
                        sur{" "}
                        <span style={{ color: "var(--ink-soft)" }}>{total}</span>.
                      </>
                    ) : (
                      "."
                    )}
                  </>
                )}
              </h1>
              <p
                style={{
                  marginTop: 16,
                  fontSize: 16,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                  maxWidth: 640,
                }}
              >
                {answeredCount === 0
                  ? "Rejoue quand tu veux : l'idée n'est pas la performance, mais d'ancrer les chiffres."
                  : `Pas un score. Une cartographie de ce que tu pensais, face à ce que disent les données.${
                      closeCount > 0
                        ? ` Tu as vu juste sur ${closeCount} question${
                            closeCount > 1 ? "s" : ""
                          }.`
                        : ""
                    } Clique sur une carte pour la partager, ou défie un proche sur l'ensemble.`}
              </p>
            </div>
            <div
              style={{
                display: "flex",
                gap: 18,
                fontSize: 12,
                color: "var(--ink-mute)",
              }}
            >
              {(["close", "mid", "far"] as Closeness[]).map((k) => (
                <span
                  key={k}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 99,
                      background: COLOR[k].chip,
                    }}
                  />
                  {COLOR[k].lbl}
                </span>
              ))}
            </div>
          </div>

          <div className="dt-recap-grid">
            {answeredItems.map((item, i) => {
              const { q } = item;
              const cl = COLOR[closeness[i]];
              return (
                <button
                  key={item.originalIndex}
                  className="dt-recap-cell"
                  onClick={() => setCardModal(item)}
                  style={{
                    background: cl.bg,
                    borderColor: cl.border,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div className="num" style={{ color: cl.chip }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 99,
                        background: cl.chip,
                      }}
                    />
                  </div>
                  {/* Pas de chiffre dans la question (catégorisation, vrai/faux
                      multiple…) : l'énoncé seul, plutôt qu'un faux chiffre-clé. */}
                  {(() => {
                    const fig = factFigure(q);
                    return fig ? <div className="fig">{fig}</div> : null;
                  })()}
                  <div className="lbl" style={{ color: "var(--ink-soft)" }}>
                    {factText(q)}
                  </div>
                  {/* Badge thème coloré au pied de la carte recap : remplace
                      l'ancien libellé en mono caps. La couleur permet de
                      mémoriser visuellement les thèmes traversés dans la
                      session, et matche le code couleur utilisé partout
                      ailleurs (cartes Découvrir, dossier, etc.). */}
                  <div style={{ marginTop: 12 }}>
                    <ThemeBadge label={q.theme} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bloc "Défier un proche" : seul bouton d'action global. Le
              "Partager ce chiffre" a disparu — le partage à la carte se
              fait au clic sur une cellule (cf. ShareQuestionModal). */}
          {answeredItems.length >= 3 ? (
            <div
              style={{
                marginTop: 32,
                padding: 28,
                background: "var(--cream-warm)",
                border: "1.5px solid var(--rule-soft)",
                borderRadius: 18,
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 28,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: 18,
                  }}
                >
                  Fais rejouer cette session à un proche.
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink-mute)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  Un lien personnel qui contient exactement les {answeredCount}{" "}
                  questions que tu viens de jouer. Tes réponses sont aussi
                  partagées : tu pourras comparer une fois qu&apos;il aura
                  joué.
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "nowrap" }}>
                <button
                  className="dt-btn-primary"
                  onClick={() => setSessionShareOpen(true)}
                >
                  Défier
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1v9m0-9L5 4m3-3 3 3M2 9v5h12V9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ) : null}

          {/* Profil impact : montre comment cette session a enrichi le
              portrait civique + CTA vers Mon profil. Au-dessus du PDF car
              c'est l'action engageante principale. */}
          {answeredItems.length >= 1 ? (
            <div style={{ marginTop: 24 }}>
              <ProfileImpactBlock
                items={answeredItems}
                variant="desktop"
                onNavigate={onNavigate}
              />
            </div>
          ) : null}

          {answeredItems.length >= 1 ? (
            <div style={{ marginTop: 18 }}>
              <ExportPdfLink
                ids={answeredItems.map((x) => x.q.id)}
                from="session"
                label={`Exporter cette session en PDF (${answeredItems.length})`}
              />
            </div>
          ) : null}

          <div
            style={{
              marginTop: 18,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              onClick={onRestart}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--ink-soft)",
                fontFamily: "var(--font-display)",
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 10,
                textDecoration: "underline",
                textDecorationColor: "var(--rule-soft)",
                textUnderlineOffset: 4,
              }}
            >
              {isPartial
                ? "Nouvelle partie : 5 questions →"
                : "Rejouer · 5 nouvelles questions →"}
            </button>
          </div>
        </div>
      </div>

      <ShareSessionModal
        open={sessionShareOpen}
        onClose={() => setSessionShareOpen(false)}
        items={answeredItems}
      />
      <ShareQuestionModal
        open={cardModal !== null}
        onClose={() => setCardModal(null)}
        item={cardModal}
      />
    </>
  );
}

