"use client";

/// Étape Share du flow Défier — POST + affichage short code + actions de partage.
/// Reçoit `gameResult` (questions + réponses jouées par le militant), POST
/// le défi côté serveur, puis affiche le short code et les CTAs de partage.

import { useState } from "react";
import {
  CtaBar,
  DefiPrimaryBtn,
  DefiSecondaryBtn,
  DI,
} from "../../defi-bits";
import { useProgress } from "@/lib/use-progress";
import { getOrCreateClientId } from "@/lib/defi-client-id";
import { copyToClipboard } from "@/lib/clipboard";
import { isCorrect } from "@/lib/correctness";
import { computeLevel, computeXp } from "@/lib/gamification";
import type { DefiAnswersMap } from "@/lib/defi";
import type { Answer, Question } from "@/lib/types";
import type { Source } from "./shared";

/// Payload reçu de l'AppShell quand le militant a fini de jouer ses questions.
export type DefiCreateGameResult = {
  source: Source;
  themeId: string | null;
  picked: Question[];
  answers: Answer[];
};

export function StepShareBody({
  gameResult,
  onSent,
  onHome,
  large,
}: {
  gameResult: DefiCreateGameResult;
  onSent: () => void;
  onHome: () => void;
  large?: boolean;
}) {
  const { progress, hydrated } = useProgress();
  // Pseudo : pattern "draft + fallback" pour pré-remplir avec progress
  // sans avoir besoin d'un useEffect. `pseudoDraft === null` ⇒ on affiche
  // la valeur de progress (ou vide tant que non hydraté). Une fois que
  // l'utilisateur tape (même pour vider), `pseudoDraft` capture sa saisie.
  const [pseudoDraft, setPseudoDraft] = useState<string | null>(null);
  const pseudo =
    pseudoDraft ?? (hydrated ? (progress.identity.pseudo ?? "") : "");
  /// Si on a déjà un pseudo connu (le militant l'a saisi dans son profil
  /// ou via un défi précédent), on replie l'input par défaut pour réduire
  /// la friction. Il peut le re-déplier via "modifier" pour personnaliser
  /// ce défi-ci. Si l'utilisateur n'a pas encore de pseudo, l'input reste
  /// déplié — il faut bien qu'il en choisisse un.
  const knownPseudo = hydrated ? (progress.identity.pseudo ?? "").trim() : "";
  const [pseudoExpanded, setPseudoExpanded] = useState(false);
  /// Titre libre du défi. Facultatif : laisser vide envoie null au serveur,
  /// et la carte/welcome n'affichent que le label thématique calculé. Le
  /// cap de 60 chars est aussi imposé côté serveur (cf. defi.ts MAX_TITLE).
  const [title, setTitle] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Score réel calculé depuis les réponses jouées.
  const correctCount = gameResult.picked.reduce(
    (acc, q, i) => acc + (isCorrect(q, gameResult.answers[i]) ? 1 : 0),
    0,
  );

  async function generateDefi() {
    if (submitting || shortCode) return;
    setSubmitting(true);
    setSubmitError(null);

    const clientId = getOrCreateClientId();
    if (!clientId) {
      setSubmitError("Impossible d'identifier ton navigateur localement.");
      setSubmitting(false);
      return;
    }

    // Snapshot des réponses du militant — réelles cette fois, pas un mock :
    // l'utilisateur les a effectivement jouées juste avant.
    const creatorAnswers: DefiAnswersMap = {};
    gameResult.picked.forEach((q, i) => {
      const a = gameResult.answers[i];
      creatorAnswers[q.id] = {
        value: (a ?? null) as DefiAnswersMap[string]["value"],
        correct: isCorrect(q, a),
      };
    });

    const trimmedPseudo = pseudo.trim() || "Anonyme";
    // Trim côté client en miroir du serveur — sinon une saisie "   " ferait
    // croire à l'utilisateur qu'il a donné un titre alors qu'il n'a rien.
    const trimmedTitle = title.trim();

    // Snapshot du niveau du militant au moment de la création. Stocké en DB
    // (Defi.creatorLevelRank), affiché à l'ami sur la page d'invitation —
    // donne du contexte sur qui défie ("Pierre · Sociologue amateur·rice").
    // Si la progress n'est pas hydratée (rare ici, le user vient de jouer),
    // on tombe sur rank 1 par défaut.
    const creatorLevelRank = hydrated
      ? computeLevel(computeXp(progress)).current.rank
      : null;

    try {
      const res = await fetch("/api/defis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorClientId: clientId,
          creatorPseudo: trimmedPseudo,
          questionIds: gameResult.picked.map((q) => q.id),
          source: gameResult.source,
          themeId: gameResult.themeId,
          title: trimmedTitle || null,
          creatorAnswers,
          creatorLevelRank,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(j.error ?? `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      const j = (await res.json()) as { shortCode: string; url: string };
      setShortCode(j.shortCode);
      setShareUrl(`${window.location.origin}${j.url}`);
      onSent();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "network_error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShare() {
    if (!shortCode) return;
    const nav: Navigator | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) {
      try {
        await nav.share({
          title: "Un défi Mon2027",
          text: `${pseudo.trim() || "Anonyme"} t'a préparé 5 questions sourcées sur la France :`,
          url: shareUrl,
        });
        return;
      } catch {
        /* user cancelled, fall through to copy */
      }
    }
    await copyLink();
  }

  async function copyLink() {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  // Sous-vue 1 : formulaire prénom + CTA "Créer & partager"
  if (!shortCode) {
    return (
      <>
        <div
          style={{
            padding: large ? "8px 0 0" : "4px 18px 0",
            display: "flex",
            flexDirection: large ? "row" : "column",
            gap: large ? 32 : 0,
            alignItems: large ? "flex-start" : "stretch",
          }}
        >
          {/* Desktop : 2 colonnes — score à gauche, formulaire prénom à droite. */}
          <div style={{ flex: large ? "0 0 320px" : undefined }}>
            <ScoreRecap
              correct={correctCount}
              total={gameResult.picked.length}
              large={large}
            />
          </div>

          <div style={{ flex: 1, marginTop: large ? 0 : 20 }}>
            {/* Récap pseudo replié quand on connaît déjà le prénom du
                militant (saisi via le profil ou un défi précédent). Le
                clic sur "modifier" déplie l'input. Pour un nouveau-venu
                sans pseudo connu, l'input est directement visible. */}
            {knownPseudo && !pseudoExpanded ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: large ? "14px 16px" : "12px 14px",
                  background: "var(--cream-warm)",
                  border: "1.5px solid var(--rule-soft)",
                  borderRadius: 12,
                  fontFamily: "var(--font-display)",
                  fontSize: large ? 16 : 14,
                  color: "var(--ink-soft)",
                }}
              >
                <span>
                  Tu envoies sous le nom de{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>
                    {knownPseudo}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setPseudoExpanded(true)}
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--coral)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  modifier
                </button>
              </div>
            ) : (
              <>
                <label
                  htmlFor="defi-pseudo"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-mute)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Ton prénom (affiché au destinataire)
                </label>
                <input
                  id="defi-pseudo"
                  value={pseudo}
                  onChange={(e) => setPseudoDraft(e.target.value)}
                  placeholder="Anonyme"
                  maxLength={40}
                  autoFocus={!knownPseudo}
                  style={{
                    width: "100%",
                    background: "var(--cream-warm)",
                    border: "1.5px solid var(--rule)",
                    borderRadius: 12,
                    padding: large ? "14px 16px" : "12px 14px",
                    fontFamily: "var(--font-display)",
                    fontSize: large ? 18 : 16,
                    fontWeight: 500,
                    color: "var(--ink)",
                    outline: "none",
                  }}
                />
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: "var(--font-serif)",
                    fontSize: large ? 14 : 12.5,
                    fontStyle: "italic",
                    color: "var(--ink-soft)",
                    lineHeight: 1.45,
                  }}
                >
                  Ton ami·e verra : « {pseudo.trim() || "Anonyme"} te défie
                  sur 5 questions ». Sans pression, sans chrono.
                </div>
              </>
            )}

            {/* Titre libre — facultatif. Aide le militant à classer ses défis
                dans "Tes défis" et donne plus de contexte au destinataire.
                Vide → on n'affiche rien, seul le label thématique parle. */}
            <label
              htmlFor="defi-title"
              style={{
                marginTop: large ? 22 : 18,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-mute)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: 6,
              }}
            >
              Titre du défi · facultatif
            </label>
            <input
              id="defi-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Pour ma sœur sceptique sur le climat"
              maxLength={60}
              style={{
                width: "100%",
                background: "var(--cream-warm)",
                border: "1.5px solid var(--rule)",
                borderRadius: 12,
                padding: large ? "14px 16px" : "12px 14px",
                fontFamily: "var(--font-display)",
                fontSize: large ? 16 : 14.5,
                fontWeight: 500,
                color: "var(--ink)",
                outline: "none",
              }}
            />
            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-serif)",
                fontSize: large ? 13 : 12,
                fontStyle: "italic",
                color: "var(--ink-soft)",
                lineHeight: 1.45,
              }}
            >
              Pour t&apos;y retrouver dans tes défis et donner du contexte à
              ton ami·e. Le thème des questions reste affiché dans tous les cas.
            </div>

            {submitError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  background: "rgba(199,93,93,0.10)",
                  border: "1px solid rgba(199,93,93,0.3)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "var(--signal-bad)",
                }}
              >
                Échec de création : {submitError}
              </div>
            ) : null}

            {large ? (
              <div style={{ marginTop: 28, maxWidth: 320 }}>
                <DefiPrimaryBtn
                  yellow
                  onClick={generateDefi}
                  disabled={submitting}
                >
                  {submitting ? "Génération…" : "Créer mon défi"}
                  {submitting ? null : <DI.Sparkle />}
                </DefiPrimaryBtn>
              </div>
            ) : null}
          </div>
        </div>
        {!large ? (
          <>
            <div style={{ flex: 1, minHeight: 24 }} />
            <CtaBar>
              <DefiPrimaryBtn
                yellow
                onClick={generateDefi}
                disabled={submitting}
              >
                {submitting ? "Génération…" : "Créer mon défi"}
                {submitting ? null : <DI.Sparkle />}
              </DefiPrimaryBtn>
            </CtaBar>
          </>
        ) : null}
      </>
    );
  }

  // Sous-vue 2 : short code + actions de partage
  return (
    <>
      <div
        style={{
          padding: large ? "8px 0 0" : "4px 18px 0",
          display: "flex",
          flexDirection: large ? "row" : "column",
          gap: large ? 32 : 0,
          alignItems: large ? "flex-start" : "stretch",
        }}
      >
        {/* COLONNE 1 — code de défi + score */}
        <div style={{ flex: large ? "1 1 0" : undefined, minWidth: 0 }}>
          <ScoreRecap
            correct={correctCount}
            total={gameResult.picked.length}
            dim
            large={large}
          />

          <div
            style={{
              marginTop: 16,
              background: "var(--yellow)",
              border: "1.5px solid var(--ink)",
              borderRadius: 22,
              padding: large ? "26px 30px 30px" : "20px 24px 24px",
              boxShadow: "3px 4px 0 var(--ink)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ink-soft)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Code de ton défi
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: large ? 48 : 38,
                lineHeight: 1,
                letterSpacing: "-0.035em",
                color: "var(--ink)",
                textWrap: "balance",
                wordBreak: "break-word",
              }}
            >
              {shortCode}
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-mono)",
                fontSize: large ? 13 : 11.5,
                color: "var(--ink-soft)",
                letterSpacing: "0.02em",
                wordBreak: "break-all",
              }}
            >
              {shareUrl}
            </div>
          </div>
        </div>

        {/* COLONNE 2 — actions de partage + notif promise */}
        <div
          style={{
            flex: large ? "1 1 0" : undefined,
            marginTop: large ? 0 : 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 0,
          }}
        >
          <DefiPrimaryBtn onClick={handleShare}>
            <DI.Share size={16} />
            Partager · WhatsApp, SMS…
          </DefiPrimaryBtn>
          <button
            type="button"
            onClick={copyLink}
            style={{
              background: copied
                ? "rgba(74,143,92,0.12)"
                : "var(--cream-warm)",
              color: copied ? "var(--signal-good)" : "var(--ink)",
              border: `1.5px solid ${
                copied ? "rgba(74,143,92,0.4)" : "var(--rule)"
              }`,
              borderRadius: 16,
              padding: "14px 18px",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.2s",
            }}
          >
            {copied ? <DI.Check /> : <DI.Copy size={14} />}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
          <a
            href={`/d/${shortCode}/resultats`}
            style={{
              background: "transparent",
              color: "var(--ink-soft)",
              border: "1.5px dashed var(--rule)",
              borderRadius: 14,
              padding: "10px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              textDecoration: "none",
            }}
          >
            <DI.Eye />
            Voir l&apos;état du défi
          </a>

          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              background: "var(--cream-warm)",
              border: "1.5px solid var(--rule-soft)",
              borderRadius: 12,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ marginTop: 1, color: "var(--ink-soft)" }}>
              <DI.Bell size={14} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "var(--ink)",
                }}
              >
                Tu seras notifié·e
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  lineHeight: 1.4,
                }}
              >
                Dès que ton ami·e aura joué, on t&apos;enverra les résultats.
                (Notifications push à venir : pour l&apos;instant, repasse sur
                cette page pour voir le statut.)
              </div>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <DefiSecondaryBtn onClick={onHome}>
              Retour à l&apos;accueil
            </DefiSecondaryBtn>
          </div>
        </div>
      </div>
      <div style={{ height: 24 }} />
    </>
  );
}

function ScoreRecap({
  correct,
  total,
  dim,
  large,
}: {
  correct: number;
  total: number;
  large?: boolean;
  dim?: boolean;
}) {
  const numSize = large ? (dim ? 32 : 56) : dim ? 20 : 28;
  const denomSize = large ? (dim ? 18 : 28) : dim ? 14 : 18;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: large ? "18px 22px" : "12px 16px",
        background: dim ? "var(--cream-warm)" : "var(--paper)",
        border: `1.5px solid ${dim ? "var(--rule-soft)" : "var(--rule)"}`,
        borderRadius: large ? 18 : 14,
        gap: 14,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Ton score sur ce défi
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: numSize,
            lineHeight: 1,
            letterSpacing: "-0.025em",
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink)",
          }}
        >
          {correct}
          <span
            style={{
              color: "var(--ink-mute)",
              fontWeight: 500,
              fontSize: denomSize,
            }}
          >
            /{total}
          </span>
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: large ? 13.5 : 12.5,
          color: "var(--ink-soft)",
          textAlign: "right",
          maxWidth: large ? 220 : 180,
          lineHeight: 1.4,
        }}
      >
        {correct === total
          ? "Score de référence : à ton ami·e de faire aussi bien."
          : correct === 0
            ? "Score lock-in. Ton ami·e jouera les mêmes questions."
            : "C'est ce score que ton ami·e cherchera à battre."}
      </div>
    </div>
  );
}
