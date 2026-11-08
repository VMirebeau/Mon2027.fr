"use client";

/// Page publique de réception d'un défi (côté ami).
/// State machine : welcome (B1) → game (B2) → submitting → transition (B3) →
/// redirect vers /d/[code]/resultats.
///
/// Friction zéro :
/// - Pas de header app (le composant rend son propre brand mark minimal).
/// - Pas de prompt d'installation, pas de cookie banner.
/// - Pas de compte requis : prénom optionnel, identification par UUID
///   localStorage (cf. lib/defi-client-id).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameSession } from "@/components/game-session";
import { BrandMark } from "@/components/brand-mark";
import {
  DefiBrandMark,
  DefiPrimaryBtn,
  DI,
} from "@/components/defi-bits";
import { getOrCreateClientId } from "@/lib/defi-client-id";
import { isCorrect } from "@/lib/correctness";
import { isMixedTheme } from "@/lib/defi-topic";
import { useProgress } from "@/lib/use-progress";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { DefiAnswersMap } from "@/lib/defi";
import type { Answer, Question } from "@/lib/types";

type Step = "welcome" | "game" | "submitting" | "transition" | "error";

export type DefiPlayClientProps = {
  shortCode: string;
  creatorPseudo: string;
  /// Rang de niveau (1..10) du militant au moment de la création, ou null
  /// pour les défis créés avant l'introduction du système. Affiché en
  /// sous-titre de la headline pour situer l'expéditeur ("Pierre · Sociologue
  /// amateur·rice te défie").
  creatorLevelRank: number | null;
  /// Score du créateur sur ses propres questions (snapshot). Capturé dans
  /// la liste "Défis reçus" de l'utilisateur pour comparer son score à
  /// celui de l'expéditeur sans re-fetch.
  creatorScore: number;
  questions: Question[];
  total: number;
  /// Label thématique calculé depuis les questions ("Économie" /
  /// "Questions diverses"). Affiché en eyebrow au-dessus de la headline.
  themeLabel: string;
  /// Slug HOME_THEMES.id quand le défi est mono-thème, null sinon.
  /// Capturé dans la liste "Défis reçus" pour la couleur de pastille.
  themeId: string | null;
  /// Titre libre éventuel saisi par le militant. Affiché EN PLUS du
  /// themeLabel, en italique sous la headline. null = on n'affiche rien.
  title: string | null;
  /// True si des questions ont été dépubliées après création — on rend un
  /// avertissement explicite côté ami plutôt que de laisser jouer un défi
  /// incohérent.
  stale: boolean;
  isExpired: boolean;
  /// displayPseudo de l'utilisateur courant si une session Mon2027 est
  /// active, sinon null. Sert à pré-remplir l'input prénom de B1 (UX :
  /// l'ami connecté n'a pas à retaper son nom). Le compte reste optionnel —
  /// un visiteur anonyme se comporte comme avant.
  currentUserPseudo: string | null;
};

export function DefiPlayClient({
  shortCode,
  creatorPseudo,
  creatorLevelRank,
  creatorScore,
  questions,
  total,
  themeLabel,
  themeId,
  title,
  stale,
  isExpired,
  currentUserPseudo,
}: DefiPlayClientProps) {
  const router = useRouter();
  const { recordReceivedDefiPlayed } = useProgress();
  const isDesktop = useIsDesktop();
  const [step, setStep] = useState<Step>("welcome");
  // Pré-remplit le prénom avec le pseudo du compte connecté quand on en a un.
  // L'utilisateur reste libre de le changer (input éditable + lien "Pas moi").
  const [amiName, setAmiName] = useState(() => currentUserPseudo ?? "");
  // Vrai si l'utilisateur a cliqué "Pas moi ?" depuis B1 alors qu'il était
  // connecté — auquel cas on doit dire au serveur de NE PAS rattacher la
  // réponse à son compte, même si la session est active. Une fois set, on
  // ne le revient pas en arrière dans cette session (pas de toggle UI :
  // c'est un opt-out one-way pour cette partie).
  const [playAsGuest, setPlayAsGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Au mount : si l'ami a déjà joué (réponse persistée en local avec ce
  // shortCode), on le redirige direct vers /resultats. Inutile de lui
  // refaire jouer + un POST qui renverrait 409.
  const checkedAlreadyPlayed = useRef(false);
  useEffect(() => {
    if (checkedAlreadyPlayed.current) return;
    checkedAlreadyPlayed.current = true;
    try {
      const flag = localStorage.getItem(playedFlagKey(shortCode));
      if (flag === "1") {
        router.replace(`/d/${shortCode}/resultats`);
      }
    } catch {
      // localStorage indisponible : on laisse jouer, ce sera juste un
      // 409 silencieux à la fin si l'utilisateur tente de rejouer.
    }
  }, [router, shortCode]);

  // `stale` (une question retirée depuis la création) n'empêche pas de jouer
  // les autres : l'écran d'accueil l'annonce d'ailleurs explicitement. Avant,
  // chaque question retirée cassait tous les liens de défi qui la contenaient.
  const cannotPlay = isExpired || questions.length === 0;

  /// Callback "Pas moi ?" — refactor unique pour Welcome + WelcomeDesktop :
  /// efface le prénom pré-rempli ET marque l'opt-out compte. Les deux effets
  /// sont indissociables (cf. issue dans la review : sans playAsGuest, le
  /// renommage seul ne désengage pas le compte côté DB).
  function switchToGuest() {
    setAmiName("");
    setPlayAsGuest(true);
  }

  async function submitAnswers(answers: Answer[]) {
    setStep("submitting");
    setError(null);

    const clientId = getOrCreateClientId();
    if (!clientId) {
      setError("Impossible d'identifier ton navigateur localement.");
      setStep("error");
      return;
    }

    const answersMap: DefiAnswersMap = {};
    let myScore = 0;
    questions.forEach((q, i) => {
      const a = answers[i];
      const correct = isCorrect(q, a);
      if (correct) myScore++;
      answersMap[q.id] = {
        value: serializeAnswer(a),
        correct,
      };
    });

    // Snapshot riche du défi reçu — stocké dans Progress.challenges.received
    // pour alimenter la liste "Défis reçus" du wizard de création de défi.
    // Le mutator dédup par shortCode (un refresh post-submit ne réinsère pas
    // ni ne décompte le compteur lifetime defisReceivedPlayed).
    const receivedEntry = {
      id: shortCode,
      from: creatorPseudo,
      // Exécuté à l'envoi des réponses (submitAnswers), pas pendant le rendu :
      // faux positif de la règle de pureté.
      // eslint-disable-next-line react-hooks/purity
      createdAt: Date.now(),
      questionIds: questions.map((q) => q.id),
      opponentScore: creatorScore,
      myScore,
      themeLabel,
      themeId,
      title,
      creatorLevelRank,
      total,
    };

    try {
      const res = await fetch(`/api/defis/${shortCode}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amiClientId: clientId,
          amiLabel: amiName.trim() || "Anonyme",
          answers: answersMap,
          // Opt-out explicite quand l'utilisateur a cliqué "Pas moi" sur B1.
          // Le serveur force amiUserId=null malgré la session active.
          playAsGuest,
        }),
      });

      if (res.status === 409) {
        // Déjà joué via ce browser. On marque le flag local et on continue
        // vers les résultats (pas une erreur du point de vue user). On
        // ré-enregistre la méta : si l'utilisateur revient sur le défi
        // après avoir effacé son cache, on garde la liste "Défis reçus" à
        // jour. Le mutator dédupe par id donc pas de double-compte.
        markPlayed(shortCode);
        recordReceivedDefiPlayed(receivedEntry);
        startTransition();
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        setStep("error");
        return;
      }
      markPlayed(shortCode);
      recordReceivedDefiPlayed(receivedEntry);
      startTransition();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
      setStep("error");
    }
  }

  function startTransition() {
    setStep("transition");
    // ~1s d'écran de transition (B3) puis bascule.
    setTimeout(() => {
      router.replace(`/d/${shortCode}/resultats`);
    }, 1100);
  }

  return (
    // `app-shell` quand !isDesktop : CSS masque ce wrapper sur desktop
    // (cf. globals.css `.app-shell { display: none }` sous ≥768px). Pendant
    // l'hydration sur grand écran, useIsDesktop revient `false` (default SSR)
    // donc on rend Welcome mobile centré à 480px — `.app-shell` le rend
    // invisible jusqu'à ce que useSyncExternalStore lise la vraie media query
    // et qu'on bascule sur WelcomeDesktop. Sinon : flash mobile pleine largeur.
    <div
      className={isDesktop ? undefined : "app-shell"}
      style={{
        minHeight: "100dvh",
        background: step === "transition" ? "var(--cream)" : "var(--cream)",
        color: "var(--ink)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-body)",
      }}
    >
      {step === "welcome" ? (
        isDesktop ? (
          <WelcomeDesktop
            shortCode={shortCode}
            creatorPseudo={creatorPseudo}
            total={total}
            themeLabel={themeLabel}
            title={title}
            amiName={amiName}
            setAmiName={setAmiName}
            cannotPlay={cannotPlay}
            isExpired={isExpired}
            stale={stale}
            currentUserPseudo={currentUserPseudo}
            onSwitchToGuest={switchToGuest}
            onStart={() => setStep("game")}
          />
        ) : (
          <Welcome
            shortCode={shortCode}
            creatorPseudo={creatorPseudo}
            total={total}
            themeLabel={themeLabel}
            title={title}
            amiName={amiName}
            setAmiName={setAmiName}
            cannotPlay={cannotPlay}
            isExpired={isExpired}
            stale={stale}
            currentUserPseudo={currentUserPseudo}
            onSwitchToGuest={switchToGuest}
            onStart={() => setStep("game")}
          />
        )
      ) : null}

      {step === "game" ? (
        <GameSession
          questions={questions}
          onDone={submitAnswers}
        />
      ) : null}

      {step === "submitting" ? <Submitting /> : null}
      {step === "transition" ? <Transition /> : null}
      {step === "error" ? (
        <ErrorBlock
          message={error ?? "Erreur inconnue"}
          onRetry={() => setStep("game")}
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// Sub-screens
// ============================================================================

type WelcomeProps = {
  shortCode: string;
  creatorPseudo: string;
  total: number;
  themeLabel: string;
  title: string | null;
  amiName: string;
  setAmiName: (v: string) => void;
  cannotPlay: boolean;
  isExpired: boolean;
  stale: boolean;
  currentUserPseudo: string | null;
  /// Callback "Pas moi ?" : l'utilisateur connecté désengage son compte
  /// pour cette partie. Doit (1) vider le prénom et (2) signaler côté state
  /// parent qu'on jouera en `playAsGuest` au POST. Vit au niveau du parent
  /// pour que la décision survive aux remontages internes de Welcome/
  /// WelcomeDesktop (cf. flip mobile↔desktop pendant resize).
  onSwitchToGuest: () => void;
  onStart: () => void;
};

/// Estimation honnête du temps de jeu : ~30 s par question (chiffre observé
/// sur les sessions Question du jour), arrondi à la minute supérieure pour
/// ne pas écrire "0 minute". Avant on affichait "3 minutes" en dur, ce qui
/// surestimait grossièrement un défi à 3 questions (30 s × 3 = 1m30 → 2 min)
/// et au passage donnait l'impression d'un effort dissuasif.
function estimatedMinutes(total: number): number {
  return Math.max(1, Math.ceil(total / 2));
}

/// Eyebrow de l'invitation : le thème quand le défi en a un. Un défi qui
/// mélange les thèmes n'affiche pas « Questions diverses », libellé de
/// catégorie qui ne dit rien à un nouveau venu.
function welcomeEyebrow(themeLabel: string): string {
  return isMixedTheme(themeLabel)
    ? "Tu as reçu un défi"
    : `Tu as reçu un défi · ${themeLabel}`;
}

/// Accroche : « Camille t'a lancé 5 questions — à toi. » Remplace l'ancien
/// « te défie sur 5 questions » suivi d'une puce « NIVEAU 2 · LECTEUR·RICE
/// ATTENTIF·VE », jargon de gamification opaque pour un nouveau venu.
function WelcomeHeadline({
  creatorPseudo,
  total,
}: {
  creatorPseudo: string;
  total: number;
}) {
  return (
    <>
      <span style={{ color: "var(--coral)" }}>{creatorPseudo}</span>{" "}
      t&apos;a lancé {total} question{total > 1 ? "s" : ""}. À toi.
    </>
  );
}

/// Deux chiffres-cartes, dans le style des cartes de l'accueil (fond plein,
/// bordure et ombre ink, légère inclinaison) : ce qui attend l'ami, et le
/// score du créateur, gardé secret jusqu'à la fin. Rien sur le contenu des
/// questions, pour ne rien dévoiler.
function WelcomeCards({
  creatorPseudo,
  total,
  large = false,
}: {
  creatorPseudo: string;
  total: number;
  large?: boolean;
}) {
  const minutes = estimatedMinutes(total);
  const cards = [
    {
      key: "format",
      bg: "var(--yellow)",
      rot: "-2deg",
      figure: `${total}`,
      text: `question${total > 1 ? "s" : ""} sourcées · environ ${minutes} min`,
    },
    {
      key: "score",
      bg: "var(--teal)",
      rot: "1.5deg",
      figure: `?/${total}`,
      text: `le score de ${creatorPseudo}, révélé à la fin`,
    },
  ];
  return (
    <ul
      style={{
        listStyle: "none",
        margin: large ? "28px 0 0" : "20px 0 0",
        padding: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: large ? 18 : 12,
        maxWidth: large ? 520 : undefined,
      }}
    >
      {cards.map((c) => (
        <li
          key={c.key}
          style={{
            background: c.bg,
            color: "var(--ink)",
            border: "1.5px solid var(--ink)",
            borderRadius: large ? 18 : 16,
            boxShadow: "4px 4px 0 var(--ink)",
            padding: large ? "16px 18px" : "12px 14px",
            transform: `rotate(${c.rot})`,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: large ? 34 : 26,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {c.figure}
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-body)",
              fontSize: large ? 14 : 12.5,
              lineHeight: 1.3,
              color: "var(--ink)",
              overflowWrap: "anywhere",
            }}
          >
            {c.text}
          </div>
        </li>
      ))}
    </ul>
  );
}

/// Petit hint discret affiché sous l'input prénom en B1.
///
/// - Si l'utilisateur est connecté ET que l'input matche encore son pseudo :
///   "Connecté en tant que <pseudo> · Pas moi ?". Le lien clear remet l'input
///   à vide pour qu'il joue sous une autre identité (ex. ordi familial).
/// - Si l'utilisateur est connecté MAIS a déjà édité l'input : on ne montre
///   rien — il a explicitement choisi une autre identité, pas la peine d'insister.
/// - Si non connecté : "J'ai un compte · Se connecter" qui pointe sur
///   /?s=account. Le retour vers le défi se fait via la nav du navigateur
///   (pas de paramètre `next` côté account pour l'instant).
function AccountHint({
  amiName,
  currentUserPseudo,
  onSwitchToGuest,
  shortCode,
}: {
  amiName: string;
  currentUserPseudo: string | null;
  /// "Pas moi ?" : vide le prénom et désengage le compte pour cette partie
  /// (cf. switchToGuest dans le parent). Sans le double effet, le serveur
  /// recevrait amiUserId=user.id même si l'utilisateur a explicitement dit
  /// "ce n'est pas mon score".
  onSwitchToGuest: () => void;
  /// Sert à construire le `next=` du lien "Se connecter" : après login,
  /// l'utilisateur revient sur /d/[shortCode] et joue le défi avec son
  /// pseudo de compte pré-rempli.
  shortCode: string;
}) {
  if (currentUserPseudo) {
    // Connecté + non édité → propose de basculer en saisie libre.
    if (amiName === currentUserPseudo) {
      return (
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>
            <DI.Check size={10} /> Connecté en tant que{" "}
            <strong style={{ color: "var(--ink)" }}>{currentUserPseudo}</strong>
          </span>
          <button
            type="button"
            onClick={onSwitchToGuest}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--ink-soft)",
              letterSpacing: "0.04em",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              cursor: "pointer",
            }}
          >
            Pas moi ?
          </button>
        </div>
      );
    }
    // Connecté mais a édité : pas de hint — il a fait son choix.
    return null;
  }

  // Pas connecté : option discrète de se logger pour que le score compte
  // dans les stats du compte.
  return (
    <div
      style={{
        marginTop: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        color: "var(--ink-mute)",
        letterSpacing: "0.04em",
        textAlign: "center",
      }}
    >
      <Link
        href={`/?s=account&next=${encodeURIComponent(`/d/${shortCode}`)}`}
        style={{
          color: "var(--ink-soft)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        J&apos;ai un compte · Se connecter
      </Link>
    </div>
  );
}

function Welcome({
  shortCode,
  creatorPseudo,
  total,
  themeLabel,
  title,
  amiName,
  setAmiName,
  cannotPlay,
  isExpired,
  stale,
  currentUserPseudo,
  onSwitchToGuest,
  onStart,
}: WelcomeProps) {
  return (
    <>
      <div
        style={{
          flex: 1,
          padding: "32px 24px 0",
          display: "flex",
          flexDirection: "column",
          maxWidth: 480,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <DefiBrandMark href="/" />

        <div style={{ flex: 0.6 }} />

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {welcomeEyebrow(themeLabel)}
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 36,
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            textWrap: "balance",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          <WelcomeHeadline creatorPseudo={creatorPseudo} total={total} />
        </h1>

        {/* Titre libre du militant — ne s'affiche que si renseigné.
            Style citation pour le démarquer de la headline générée. */}
        {title ? (
          <div
            style={{
              marginTop: 14,
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 18,
              lineHeight: 1.4,
              color: "var(--ink)",
              borderLeft: "3px solid var(--coral)",
              paddingLeft: 12,
              textWrap: "pretty",
            }}
          >
            « {title} »
          </div>
        ) : null}

        <div
          style={{
            marginTop: 18,
            fontFamily: "var(--font-serif)",
            fontSize: 16,
            lineHeight: 1.5,
            color: "var(--ink-soft)",
            textWrap: "pretty",
          }}
        >
          Un quiz citoyen sur la France, sourcé sur des données publiques. À
          la fin, vous comparez vos réponses.
        </div>

        <WelcomeCards creatorPseudo={creatorPseudo} total={total} />

        {isExpired ? (
          <Notice
            kind="warn"
            text="Ce défi a expiré. Demande à ton ami·e de le regénérer."
          />
        ) : null}
        {stale && !isExpired ? (
          <Notice
            kind="warn"
            text="Certaines questions de ce défi ne sont plus disponibles. Tu peux quand même jouer les autres."
          />
        ) : null}

        <div style={{ flex: 0.8 }} />

        <label
          htmlFor="ami-name"
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
          Ton prénom · facultatif
        </label>
        <input
          id="ami-name"
          value={amiName}
          onChange={(e) => setAmiName(e.target.value)}
          placeholder="Anonyme"
          maxLength={40}
          style={{
            width: "100%",
            background: "var(--cream-warm)",
            border: "1.5px solid var(--rule)",
            borderRadius: 14,
            padding: "14px 16px",
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 500,
            color: "var(--ink)",
            outline: "none",
          }}
        />
        <AccountHint
          amiName={amiName}
          currentUserPseudo={currentUserPseudo}
          onSwitchToGuest={onSwitchToGuest}
          shortCode={shortCode}
        />

        <div style={{ flex: 1 }} />
      </div>

      <div
        style={{
          padding: "12px 24px 24px",
          maxWidth: 480,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <DefiPrimaryBtn big yellow onClick={onStart} disabled={cannotPlay}>
          Commencer
          <DI.Arrow size={18} />
        </DefiPrimaryBtn>
        <div
          style={{
            marginTop: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Pas de compte, pas d&apos;inscription · sources cliquables à la fin
        </div>
      </div>
    </>
  );
}

/// Variante desktop (≥ 768px) du B1.
///
/// Pourquoi un layout dédié plutôt qu'un simple resize de la version mobile :
/// au-dessus de ~900px, la carte 480px centrée se lit comme une démo mobile
/// posée au milieu d'un écran vide — c'est l'effet "site sérieux ? vraiment ?"
/// qu'on veut éviter pour un défi reçu d'un proche.
///
/// On reprend la grille 2 colonnes "éditorial + action" (cf. dt-hero pour la
/// home, dt-doc pour /methode) : titrage généreux à gauche, carte d'action à
/// droite avec l'identité du design system (border ink + shadow décalée 6px).
/// La typographie suit clamp() comme dt-hero h1, donc se redescend correctement
/// sur les tablettes 768-1024px.
function WelcomeDesktop({
  shortCode,
  creatorPseudo,
  total,
  themeLabel,
  title,
  amiName,
  setAmiName,
  cannotPlay,
  isExpired,
  stale,
  currentUserPseudo,
  onSwitchToGuest,
  onStart,
}: WelcomeProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "clamp(20px, 3vh, 36px) clamp(24px, 4vw, 56px) clamp(28px, 4vh, 48px)",
      }}
    >
      {/* Brand mark centré, plus voyant qu'en mobile. Pas de nav app (chrome
          zéro côté ami) — mais cliquable pour ramener à la home, comme sur
          tout site classique. */}
      <div
        style={{
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
          paddingBottom: "clamp(28px, 5vh, 56px)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <BrandMark size="lg" href="/" />
      </div>

      {/* Grille éditorial (gauche) + carte d'action (droite). Le 1.15fr penche
          un peu vers la gauche pour laisser respirer le titre, la carte de
          droite n'a besoin que de ~440px confortables. */}
      <div
        style={{
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 1fr)",
          gap: "clamp(40px, 5vw, 96px)",
          alignItems: "center",
        }}
      >
        {/* ─────────── Colonne éditoriale ─────────── */}
        <div style={{ maxWidth: 640 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-mute)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 22,
            }}
          >
            {welcomeEyebrow(themeLabel)}
          </div>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(44px, 5vw, 72px)",
              lineHeight: 0.98,
              letterSpacing: "-0.035em",
              margin: 0,
              textWrap: "balance",
              color: "var(--ink)",
            }}
          >
            <WelcomeHeadline creatorPseudo={creatorPseudo} total={total} />
          </h1>

          {title ? (
            <div
              style={{
                marginTop: 26,
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "clamp(18px, 1.5vw, 22px)",
                lineHeight: 1.45,
                color: "var(--ink)",
                borderLeft: "3px solid var(--coral)",
                paddingLeft: 16,
                textWrap: "pretty",
              }}
            >
              « {title} »
            </div>
          ) : null}

          <div
            style={{
              marginTop: 24,
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(16px, 1.2vw, 19px)",
              lineHeight: 1.55,
              color: "var(--ink-soft)",
              textWrap: "pretty",
              maxWidth: 520,
            }}
          >
            Un quiz citoyen sur la France, sourcé sur des données publiques.
            À la fin, vous comparez vos réponses.
          </div>

          <WelcomeCards creatorPseudo={creatorPseudo} total={total} large />

          {isExpired ? (
            <Notice
              kind="warn"
              text="Ce défi a expiré. Demande à ton ami·e de le regénérer."
            />
          ) : null}
          {stale && !isExpired ? (
            <Notice
              kind="warn"
              text="Certaines questions de ce défi ne sont plus disponibles. Tu peux quand même jouer les autres."
            />
          ) : null}
        </div>

        {/* ─────────── Carte d'action ─────────── */}
        {/* Reprend le pattern "card hero" de l'app desktop : fond paper,
            bordure ink, shadow 6px déplacée. Donne du poids à la zone CTA
            face à la gauche éditoriale. */}
        <div
          style={{
            background: "var(--paper)",
            border: "1.5px solid var(--ink)",
            borderRadius: 22,
            padding: "clamp(24px, 2.5vw, 32px)",
            boxShadow: "6px 6px 0 var(--ink)",
            maxWidth: 460,
            width: "100%",
            justifySelf: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-mute)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Avant de te lancer
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              marginBottom: 22,
              color: "var(--ink)",
            }}
          >
            On note ton prénom ?
          </div>

          <label
            htmlFor="ami-name"
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
            Ton prénom · facultatif
          </label>
          <input
            id="ami-name"
            value={amiName}
            onChange={(e) => setAmiName(e.target.value)}
            placeholder="Anonyme"
            maxLength={40}
            style={{
              width: "100%",
              background: "var(--cream-warm)",
              border: "1.5px solid var(--rule)",
              borderRadius: 14,
              padding: "14px 16px",
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 500,
              color: "var(--ink)",
              outline: "none",
            }}
          />
          <div style={{ marginBottom: 18 }}>
            <AccountHint
              amiName={amiName}
              currentUserPseudo={currentUserPseudo}
              onSwitchToGuest={onSwitchToGuest}
              shortCode={shortCode}
            />
          </div>

          <DefiPrimaryBtn big yellow onClick={onStart} disabled={cannotPlay}>
            Commencer
            <DI.Arrow size={18} />
          </DefiPrimaryBtn>
          <div
            style={{
              marginTop: 14,
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--ink-mute)",
              letterSpacing: "0.04em",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Pas de compte, pas d&apos;inscription · sources à la fin
          </div>
        </div>
      </div>
    </div>
  );
}

function Submitting() {
  return (
    <CenterMessage
      title="Envoi de tes réponses…"
      sub="Une seconde, on enregistre ton score."
    />
  );
}

function Transition() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 99,
              background:
                i === 0
                  ? "var(--coral)"
                  : i === 1
                    ? "var(--ink)"
                    : "var(--yellow)",
              animation: `defi-pulse 1s ease-in-out infinite ${i * 0.15}s`,
            }}
          />
        ))}
      </div>

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 30,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          textWrap: "balance",
        }}
      >
        Voici comment vous vous comparez…
      </div>

      <div
        style={{
          marginTop: 14,
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          color: "var(--ink-soft)",
          lineHeight: 1.5,
          fontStyle: "italic",
          maxWidth: 300,
        }}
      >
        On agrège les réponses, on prépare votre récap.
      </div>

      <style jsx global>{`
        @keyframes defi-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        textAlign: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
        }}
      >
        L&apos;envoi a échoué.
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ink-soft)",
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        {message}
      </div>
      <DefiPrimaryBtn onClick={onRetry}>Réessayer</DefiPrimaryBtn>
    </div>
  );
}

function CenterMessage({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 14,
          color: "var(--ink-soft)",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function Notice({ kind, text }: { kind: "warn" | "info"; text: string }) {
  const palette = kind === "warn"
    ? { bg: "rgba(216,154,62,0.10)", border: "rgba(216,154,62,0.3)", color: "var(--signal-mid)" }
    : { bg: "rgba(78,205,196,0.10)", border: "rgba(78,205,196,0.3)", color: "var(--teal-deep)" };
  return (
    <div
      style={{
        marginTop: 14,
        padding: "10px 12px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        fontSize: 12.5,
        color: palette.color,
        lineHeight: 1.4,
      }}
    >
      {text}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function playedFlagKey(shortCode: string): string {
  return `mon2027:defi:played:${shortCode}`;
}

function markPlayed(shortCode: string) {
  try {
    localStorage.setItem(playedFlagKey(shortCode), "1");
  } catch {
    /* ignore */
  }
}

/// Convertit une Answer du runner en valeur sérialisable JSON. Les Answer
/// peuvent être number, boolean, string[], ou un Record<string, ...>. Tous
/// JSON-natifs, on retourne tel quel avec un narrowing de type pour
/// satisfaire DefiAnswerRecord["value"].
function serializeAnswer(a: Answer): DefiAnswersMap[string]["value"] {
  if (a === null || a === undefined) return null;
  if (typeof a === "number" || typeof a === "boolean") return a;
  if (Array.isArray(a)) return a as string[];
  if (typeof a === "object") return a as Record<string, unknown>;
  return null;
}

