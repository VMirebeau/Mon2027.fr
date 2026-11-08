"use client";

import { useState } from "react";
/// Plus de AppHeader ici : sur mobile, le récap n'affiche pas son propre
/// titre "Fin de partie" — on laisse la BottomTabBar (rendue par AppShell)
/// guider la navigation. Cf. SCENES_WITHOUT_BAR dans app-shell/helpers.ts
/// où "recap" a été retiré pour révéler cette barre.
import type { Answer, NavTarget, Question } from "@/lib/types";
import {
  CLOSENESS_COLOR as COLOR,
  closenessOf,
  type Closeness,
} from "@/lib/closeness";
import {
  type AnsweredItem,
  getAnsweredItems,
  keyFact,
} from "@/lib/recap-helpers";
import { ExportPdfLink } from "../export-pdf-link";
import { ShareQuestionModal, ShareSessionModal } from "../share-modals";
import { ThemeBadge } from "../theme-badge";
import { ProfileImpactBlock } from "../profile-impact";

export function Recap({
  questions,
  answers,
  onRestart,
  onNavigate,
}: {
  questions: Question[];
  answers: Answer[];
  onRestart: () => void;
  /// `onHome` était utilisé par l'ancien AppHeader (back arrow → home).
  /// Le header a été retiré au profit de la BottomTabBar globale ; la
  /// nav vers les autres modes passe désormais par cette barre. Le prop
  /// reste accepté pour rester compat avec AppShell (qui passe
  /// `homeBack`) sans avoir à toucher au call site.
  onHome?: () => void;
  /// Conservé pour ne pas casser le call site AppShell qui passe toujours
  /// `onChallenge`. La logique a migré vers `ShareSessionModal` qui crée
  /// le défi côté client (POST /api/defis) — plus besoin de la nav.
  onChallenge?: (fav: number) => void;
  /// Nav vers les autres scènes (passé par AppShell), utilisé par
  /// ProfileImpactBlock pour amener vers Mon profil au clic.
  onNavigate?: (target: NavTarget) => void;
}) {
  // Stats de session : sessions partielles incluses (l'utilisateur peut
  // sortir via "Terminer" avant la fin). Pas de "score" en gros — fidèle au
  // ton "pas un score, une cartographie" — mais on adapte les copies pour
  // ne pas mentir.
  const total = questions.length;
  const answeredCount = answers.filter((a) => a != null).length;
  const isPartial = answeredCount < total;

  const answeredItems = getAnsweredItems(questions, answers);
  const closeness = answeredItems.map((x) => closenessOf(x.q, x.answer));
  const closeCount = closeness.filter((c) => c === "close").length;

  // Modals (cf. recap-dt.tsx pour la rationale identique : plus de
  // sélection "favorite", clic carte = partage question, Défier = partage
  // session via création de défi côté serveur).
  const [sessionShareOpen, setSessionShareOpen] = useState(false);
  const [cardModal, setCardModal] = useState<AnsweredItem | null>(null);

  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <div style={{ padding: "12px 24px 0" }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
          }}
        >
          {isPartial ? `Récap · partie écourtée` : `Récap · partie rapide`}
        </div>
        <div
          className="display"
          style={{
            marginTop: 8,
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            textWrap: "balance",
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
                  sur <span style={{ color: "var(--ink-soft)" }}>{total}</span>.
                </>
              ) : (
                "."
              )}
            </>
          )}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 15,
            color: "var(--ink-soft)",
            lineHeight: 1.4,
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
              }${
                answeredItems.length > 0
                  ? " Touche une carte pour la partager."
                  : ""
              }`}
        </div>
        {answeredCount > 0 ? (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 14,
              fontSize: 11,
              color: "var(--ink-mute)",
            }}
          >
            {(["close", "mid", "far"] as Closeness[]).map((k) => (
              <span
                key={k}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: COLOR[k].chip,
                  }}
                />
                {COLOR[k].lbl}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {answeredItems.length > 0 ? (
        <div style={{ padding: "20px 24px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {answeredItems.map((item, i) => {
              const { q } = item;
              const cl = COLOR[closeness[i]];
              return (
                <button
                  key={item.originalIndex}
                  onClick={() => setCardModal(item)}
                  className="tile"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    background: cl.bg,
                    borderColor: cl.border,
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    className="mono"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.06)",
                      color: cl.chip,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <ThemeBadge label={q.theme} size="xs" />
                    <div
                      className="display"
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        lineHeight: 1.15,
                        marginTop: 2,
                        color: "var(--ink)",
                      }}
                    >
                      {keyFact(q)}
                    </div>
                  </div>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 99,
                      background: cl.chip,
                      flexShrink: 0,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Profil impact : montre comment cette session a enrichi le portrait
          civique de l'utilisateur (indicateurs touchés) + CTA vers Mon
          profil. Affiché dès 1 question répondue dont au moins une touche
          un indicateur (sinon le bloc ne se rend pas — cf. ProfileImpactBlock). */}
      {answeredItems.length >= 1 ? (
        <div style={{ padding: "20px 24px 0" }}>
          <ProfileImpactBlock
            items={answeredItems}
            variant="mobile"
            onNavigate={onNavigate}
          />
        </div>
      ) : null}

      {/* Export PDF de la session : disponible dès 1 question répondue.
          Indépendant du bloc Défier ci-dessous (qui exige 3+ et passe par
          l'API serveur pour créer un Defi). */}
      {answeredItems.length >= 1 ? (
        <div style={{ padding: "20px 24px 0" }}>
          <ExportPdfLink
            ids={answeredItems.map((x) => x.q.id)}
            from="session"
            label={`Exporter cette session en PDF (${answeredItems.length})`}
          />
        </div>
      ) : null}

      {/* Bloc Défier : seulement si on a au moins 3 questions répondues
          (contrainte de validation côté backend POST /api/defis). */}
      {answeredItems.length >= 3 ? (
        <div style={{ padding: "26px 24px 0" }}>
          <div
            style={{
              background: "var(--cream-warm)",
              border: "1.5px solid var(--rule-soft)",
              borderRadius: 16,
              padding: "18px 18px 16px",
            }}
          >
            <div
              className="display"
              style={{ fontWeight: 600, fontSize: 17 }}
            >
              Fais rejouer cette session.
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "var(--ink-mute)",
                lineHeight: 1.5,
              }}
            >
              Un lien personnel qui contient exactement les {answeredCount}{" "}
              questions que tu viens de jouer. Tes réponses sont aussi
              partagées : tu pourras comparer une fois que ton proche aura joué.
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                className="btn-primary"
                onClick={() => setSessionShareOpen(true)}
              >
                Défier un proche
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          padding: "16px 24px 32px",
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
    </div>
  );
}
