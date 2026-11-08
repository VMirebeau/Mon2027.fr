"use client";

/// Page C — Résultats partagés.
///
/// Même URL, même contenu pour militant et ami. La seule différence est
/// le set de CTAs en bas de page. La détection du rôle se fait côté client
/// via un tag salé `sha256(shortCode + ":" + clientId)` calculé localement
/// et comparé aux tags du payload (cf. defi-identity.ts) :
///   - tag === defi.creatorTag → vue militant
///   - une DefiResponse a un amiTag === tag → vue ami
///   - sinon → vue ami générique (anonyme curieux du lien)
///
/// Si aucune réponse n'existe encore, on rend la WaitingState (le militant
/// est en attente de l'ami, ou un visiteur tiers découvre un défi vide).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CtaBar,
  DefiAppBar,
  DefiBrandMark,
  DefiPrimaryBtn,
  DefiSecondaryBtn,
  DI,
  ScoreBadge,
} from "@/components/defi-bits";
import { formatUserAnswer } from "@/lib/correctness";
import type { DefiAnswerRecord, DefiAnswersMap } from "@/lib/defi";
import type { NavTarget, Question } from "@/lib/types";
import { getOrCreateClientId } from "@/lib/defi-client-id";
import { computeIdentityTagClient } from "@/lib/defi-identity";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { HomeHeader } from "@/components/home/header";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import {
  ActiveModeProvider,
  AppNav,
  NavPaperProvider,
} from "@/components/desktop/app-nav";

export type SerializableDefi = {
  shortCode: string;
  creatorPseudo: string;
  /// Tag d'identité du créateur (sha256 salé par shortCode). Le clientId raw
  /// n'est jamais transmis au navigateur — cf. defi-identity.ts pour la
  /// rationale (anti-corrélation cross-défi).
  creatorTag: string;
  /// displayPseudo de l'utilisateur connecté (session Mon2027), sinon null.
  /// Sert au CTA post-jeu "Crée un compte · Garde tes scores" qu'on ne montre
  /// qu'à l'ami non-connecté qui vient de jouer.
  currentUserPseudo: string | null;
  /// Label thématique calculé depuis les questions du défi
  /// ("Économie" / "Questions diverses"). Source : defi-loader.
  themeLabel: string;
  /// Titre libre éventuel saisi par le militant à la création. Affiché en
  /// citation sous le bandeau. null = on n'affiche rien.
  title: string | null;
  creatorScore: number;
  creatorAnswers: DefiAnswersMap;
  total: number;
  questions: Question[];
  isExpired: boolean;
  expiresAt: string;
  createdAt: string;
  responses: Array<{
    amiLabel: string;
    amiTag: string;
    answers: DefiAnswersMap;
    score: number;
    createdAt: string;
    /// Présent uniquement quand le visiteur est le créateur — sinon
    /// `undefined` (la page filtre pour éviter de leaker "qui a déjà été
    /// lu" à un ami). `null` quand le créateur n'a pas encore ouvert
    /// /resultats depuis que cette réponse a été soumise.
    seenByCreatorAt?: string | null;
  }>;
  /// Label "il y a 2 jours" calculé côté serveur au moment du SSR pour
  /// rester pur en render. Il sera ré-éval à chaque request (dynamic).
  sentAgoLabel: string;
  /// Rôle du visiteur d'après le cookie signé `defi_client` :
  ///   - "creator"   : c'est le créateur du défi (a tous les détails)
  ///   - "responder" : il a déjà répondu (voit ses réponses + créateur)
  ///   - "public"    : porteur du lien sans participation — vue allégée
  ///     (creatorAnswers et responses[i].answers sont vides {} dans ce cas).
  viewerRole: "creator" | "responder" | "public";
};

type Audience = "militant" | "ami" | "neutral";

export function DefiResultsClient({ defi }: { defi: SerializableDefi }) {
  const isDesktop = useIsDesktop();
  // `?from=app` est positionné par les liens internes (my-defis-list,
  // received-defis-list) pour signaler "ce visiteur arrive depuis l'app, garde
  // l'interface du site". Sans le flag, on suppose un porteur de lien externe
  // (partage WhatsApp/SMS) qui ne veut pas voir notre nav — la page reste
  // stand-alone. Côté inner pages, on injecte HomeHeader (mobile) au-dessus
  // du DefiAppBar et `with-bottom-bar` pour ne pas faire chevaucher la
  // BottomTabBar fixed.
  const searchParams = useSearchParams();
  const fromApp = searchParams?.get("from") === "app";
  const router = useRouter();
  const navTo = useCallback(
    (target: NavTarget) => {
      router.push(`/?s=${target}`);
    },
    [router],
  );
  /// Tag calculé localement depuis le clientId localStorage. Async
  /// (SubtleCrypto) donc on attend le résultat avant de pouvoir s'en servir
  /// pour le fallback cross-device.
  ///
  /// Tolère que SubtleCrypto soit indisponible : ça arrive en dev quand on
  /// teste depuis une IP LAN (http://192.168...), contexte non sécurisé où
  /// `crypto.subtle` est undefined. On garde myTag à null, et l'audience
  /// retombera sur viewerRole (cookie httpOnly côté serveur) qui suffit
  /// pour le cas same-device. Le fallback cross-device ne marche juste pas
  /// dans ce contexte — acceptable pour une preview LAN.
  const [myTag, setMyTag] = useState<string | null>(null);
  useEffect(() => {
    const id = getOrCreateClientId();
    if (!id) return;
    if (typeof crypto === "undefined" || !crypto.subtle) return;
    let cancelled = false;
    computeIdentityTagClient(defi.shortCode, id)
      .then((tag) => {
        if (!cancelled) setMyTag(tag);
      })
      .catch(() => {
        // SubtleCrypto présent mais échec ponctuel (rare) : on swallow, le
        // fallback viewerRole prend le relais sans crasher la page.
      });
    return () => {
      cancelled = true;
    };
  }, [defi.shortCode]);

  // On choisit la réponse à afficher : si l'utilisateur courant a une
  // réponse à lui, on la met en avant ; sinon on prend la première — qui
  // est maintenant la plus RÉCENTE depuis qu'on tri DESC en DB (cf.
  // defi-loader.ts). Côté UX : un ami qui vient juste de jouer apparaît
  // en tête par défaut, plutôt que de devoir scroller jusqu'au bout
  // chronologique.
  const myResponse = useMemo(() => {
    if (!myTag) return null;
    return defi.responses.find((r) => r.amiTag === myTag) ?? null;
  }, [myTag, defi.responses]);

  // Pour le créateur avec plusieurs amis ayant joué : on permet de switcher
  // entre les comparaisons via un sélecteur (voir ResponseSwitcher). Le
  // featuredResponse par défaut reste : ma propre réponse si je suis l'ami
  // visiteur, sinon la première chronologique. Le créateur peut basculer.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const featuredResponse = useMemo(() => {
    // L'index explicite (sélecteur du créateur) prime sur tout.
    if (selectedIdx !== null && defi.responses[selectedIdx]) {
      return defi.responses[selectedIdx];
    }
    return myResponse ?? defi.responses[0] ?? null;
  }, [selectedIdx, defi.responses, myResponse]);

  // Audience : on combine deux sources.
  //  - viewerRole vient du serveur, dérivé du cookie httpOnly signé
  //    `mon2027_defi_client`. Disponible dès le 1er render, robuste face
  //    aux SubtleCrypto qui mettent un tick à résoudre. C'est la source
  //    de vérité pour le rôle "creator" (jamais on ne montre "Jouer le
  //    défi" au créateur, même pendant le tick async).
  //  - myTag (sha256 localStorage côté client) reste utilisé pour
  //    le cas cross-device : un ami qui ouvre /resultats sur un autre
  //    appareil pourrait être "public" côté cookie mais reconnu si son
  //    localStorage clientId matche un amiTag. C'est un fallback.
  const audience: Audience = useMemo(() => {
    if (defi.viewerRole === "creator") return "militant";
    if (defi.viewerRole === "responder") return "ami";
    if (!myTag) return "neutral";
    if (myTag === defi.creatorTag) return "militant";
    if (myResponse) return "ami";
    return "neutral";
  }, [defi.viewerRole, myTag, defi.creatorTag, myResponse]);

  // Vue index : créateur avec au moins 2 amis ayant joué, aucun choix
  // explicite encore fait. On présente la liste, click → bascule sur la
  // comparaison. Pour 1 seul ami, on saute l'étape (un clic en moins) ;
  // pour la vue ami, la comparaison n'a qu'un sens — pas de liste.
  const showResponsesIndex =
    audience === "militant" &&
    defi.responses.length >= 2 &&
    selectedIdx === null;

  // État d'attente : aucune réponse soumise ET on est le militant (ou un
  // tiers qui regarde un défi vide).
  let body: React.ReactNode;
  if (!featuredResponse) {
    const sharedProps = {
      shortCode: defi.shortCode,
      creatorPseudo: defi.creatorPseudo,
      creatorScore: defi.creatorScore,
      total: defi.total,
      themeLabel: defi.themeLabel,
      title: defi.title,
      sentAgoLabel: defi.sentAgoLabel,
      amIMilitant: audience === "militant",
      questions: defi.questions,
      creatorAnswers: defi.creatorAnswers,
    };
    // `fromApp` ne s'applique qu'à la variante mobile : sur desktop, AppNav
    // est rendue en sibling à l'extérieur des inner pages, donc rien à
    // injecter dedans. Cf. ResultsPage(Desktop) pour la même asymétrie.
    body = isDesktop ? (
      <WaitingStateDesktop {...sharedProps} />
    ) : (
      <WaitingState {...sharedProps} fromApp={fromApp} />
    );
  } else if (showResponsesIndex) {
    body = (
      <ResponsesIndex
        defi={defi}
        fromApp={fromApp}
        onSelect={setSelectedIdx}
        isDesktop={isDesktop}
      />
    );
  } else {
    // Index courant pour matcher le sélecteur visuellement (highlight de la
    // pill active). Si rien n'est explicitement sélectionné on retombe sur
    // la position du featuredResponse calculé (myResponse ou [0]).
    const currentIdx =
      selectedIdx !== null
        ? selectedIdx
        : defi.responses.findIndex((r) => r === featuredResponse);

    const onShowList = () => setSelectedIdx(null);
    body = isDesktop ? (
      <ResultsPageDesktop
        defi={defi}
        response={featuredResponse}
        audience={audience}
        currentIdx={currentIdx}
        onSelectResponse={setSelectedIdx}
        onShowList={onShowList}
      />
    ) : (
      <ResultsPage
        defi={defi}
        response={featuredResponse}
        audience={audience}
        currentIdx={currentIdx}
        onSelectResponse={setSelectedIdx}
        onShowList={onShowList}
        fromApp={fromApp}
      />
    );
  }

  // Sans `?from=app`, on rend la page stand-alone telle quelle — c'est le
  // mode "lien partagé" externe où l'on ne veut pas imposer la nav du site.
  if (!fromApp) return body;

  // Mode app : on entoure la page de la chrome habituelle (AppNav desktop,
  // BottomTabBar mobile). `ActiveModeProvider value="challenge"` souligne
  // "Défier" dans la nav puisque c'est de là qu'on arrive. La BottomTabBar
  // est position:fixed (mobile only via CSS) ; le with-bottom-bar appliqué
  // dans les inner pages garde la brand mark visible.
  return (
    <ActiveModeProvider value="challenge">
      <NavPaperProvider>
        <AppNav onNavigate={navTo} />
        {body}
        <BottomTabBar active="challenge" onNavigate={navTo} />
      </NavPaperProvider>
    </ActiveModeProvider>
  );
}

// ============================================================================
// Sélecteur de réponse — visible côté militant quand plusieurs amis ont joué.
// ============================================================================

/// Barre de pills horizontale (scroll-x sur mobile). Chaque pill = un ami
/// avec son score. Click bascule la comparaison sur cet ami.
///
/// Ne s'affiche QUE pour le créateur (rendu conditionnel côté parent). Côté
/// ami, exposer la liste des autres répondeurs serait une fuite de privacy
/// (il ne saurait pas qu'X a joué le même défi).
///
/// Pas de "Voir tout" / dropdown : on assume max ~20 amis par défi en
/// pratique. Au-delà, la barre scroll naturellement.
function ResponseSwitcher({
  responses,
  currentIdx,
  onSelect,
  total,
}: {
  responses: SerializableDefi["responses"];
  currentIdx: number;
  onSelect: (idx: number) => void;
  /// Nombre total de questions du défi — pour afficher score/total dans
  /// chaque pill ("4/5" plutôt que "4" tout sec).
  total: number;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--ink-mute)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {responses.length} ami·e·s ont joué · choisis la comparaison
      </div>
      <div
        role="tablist"
        aria-label="Réponses des ami·e·s"
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          // Smooth scroll-snap : sur mobile, chaque pill s'aligne en fin
          // de geste. -webkit pour la cohérence iOS.
          scrollSnapType: "x proximity",
          // Padding bottom pour ne pas tronquer l'underline du focus ring.
          paddingBottom: 2,
        }}
      >
        {responses.map((r, idx) => {
          const isActive = idx === currentIdx;
          // Pastille "nouveau" sur les pills dont la réponse n'a pas encore
          // été vue par le créateur. seenByCreatorAt est exposé UNIQUEMENT
          // au créateur côté payload (cf. page.tsx) — `undefined` ailleurs,
          // donc strict null check ici. Le serveur déclenche aussi un
          // updateMany fire-and-forget à chaque visite du créateur, donc
          // au prochain refresh tous les `null` deviennent timestamps et
          // la pastille disparaît — comportement attendu.
          const isUnseen = r.seenByCreatorAt === null;
          return (
            <button
              key={`${r.amiTag}-${idx}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(idx)}
              style={{
                position: "relative",
                flexShrink: 0,
                scrollSnapAlign: "start",
                padding: "8px 14px",
                borderRadius: 999,
                border: isActive
                  ? "1.5px solid var(--ink)"
                  : "1.5px solid var(--rule-soft)",
                background: isActive ? "var(--ink)" : "var(--cream-warm)",
                color: isActive ? "var(--cream-warm)" : "var(--ink)",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "-0.01em",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                transition: "background 0.15s, border-color 0.15s, color 0.15s",
              }}
            >
              {isUnseen ? (
                // Point coral en absolute, coin haut-gauche — discret mais
                // visible même quand la pill est active (couleur de marque,
                // contraste sur ink ET sur cream-warm). aria-label pour les
                // lecteurs d'écran : sinon la pastille seule est silencieuse.
                <span
                  aria-label="Réponse non encore vue"
                  style={{
                    position: "absolute",
                    top: -3,
                    left: -3,
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: "var(--coral)",
                    border: "1.5px solid var(--cream)",
                  }}
                />
              ) : null}
              <span
                style={{
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.amiLabel}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  opacity: isActive ? 0.9 : 0.65,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {r.score}/{total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Index des réponses — vue d'entrée pour le créateur quand plusieurs
// amis ont joué. Avant cet écran, on entrait direct dans la comparaison
// avec la première réponse et le sélecteur (pills) en haut était la seule
// indication qu'on pouvait switcher : peu discoverable. Maintenant on
// présente d'abord la liste, l'utilisateur·rice choisit, puis on bascule
// sur la comparaison (qui garde le sélecteur pour passer d'un ami à l'autre).
//
// Cohérence : on n'affiche cette vue QUE pour `audience === "militant"` ET
// `responses.length >= 2`. Un seul ami → on saute la liste (un clic en
// moins pour le cas courant) ; vue ami → un seul interlocuteur pertinent
// (la comparaison militant/lui), pas de liste à montrer.
// ============================================================================

function ResponsesIndex({
  defi,
  fromApp,
  onSelect,
  isDesktop,
}: {
  defi: SerializableDefi;
  fromApp: boolean;
  onSelect: (idx: number) => void;
  isDesktop: boolean;
}) {
  const router = useRouter();

  const eyebrow = (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        color: "var(--ink-mute)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {defi.responses.length} ami·e·s ont joué · choisis une comparaison
    </div>
  );

  const cards = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {defi.responses.map((r, idx) => (
        <ResponsesIndexCard
          key={`${r.amiTag}-${idx}`}
          r={r}
          total={defi.total}
          creatorScore={defi.creatorScore}
          onClick={() => onSelect(idx)}
        />
      ))}
    </div>
  );

  const titleCitation = defi.title ? (
    <div
      style={{
        fontFamily: "var(--font-serif)",
        fontStyle: "italic",
        fontSize: isDesktop ? "clamp(18px, 1.5vw, 22px)" : 15,
        lineHeight: 1.4,
        color: "var(--ink)",
        borderLeft: "3px solid var(--coral)",
        paddingLeft: isDesktop ? 16 : 12,
        textWrap: "pretty",
        marginBottom: isDesktop ? 28 : 14,
      }}
    >
      « {defi.title} »
    </div>
  ) : null;

  if (isDesktop) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--cream)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
        }}
      >
        <div
          style={{
            maxWidth: 1320,
            width: "100%",
            margin: "0 auto",
            padding: "16px 32px 0",
          }}
        >
          <DefiAppBar
            title="Résultats partagés"
            sub={defi.themeLabel}
          />
        </div>
        <div
          style={{
            maxWidth: 920,
            width: "100%",
            margin: "0 auto",
            padding: "16px 32px 48px",
          }}
        >
          {titleCitation}
          {eyebrow}
          {cards}
          <div style={{ marginTop: 48, textAlign: "center" }}>
            <PageBrandMark />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={"app-shell" + (fromApp ? " with-bottom-bar" : "")}
      style={{
        minHeight: "100dvh",
        background: "var(--cream)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {fromApp ? (
        <HomeHeader onNavigate={(t) => router.push(`/?s=${t}`)} />
      ) : null}
      <DefiAppBar
        title="Résultats partagés"
        sub={defi.themeLabel}
      />
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          margin: "0 auto",
          padding: "4px 16px 16px",
          flex: 1,
        }}
      >
        {titleCitation}
        {eyebrow}
        {cards}
      </div>
      <div style={{ padding: "20px 16px 24px", textAlign: "center" }}>
        <PageBrandMark />
      </div>
    </div>
  );
}

function ResponsesIndexCard({
  r,
  total,
  creatorScore,
  onClick,
}: {
  r: SerializableDefi["responses"][number];
  total: number;
  creatorScore: number;
  onClick: () => void;
}) {
  // Pastille "nouveau" : seenByCreatorAt === null (réponse pas encore ouverte
  // par le créateur). Le serveur déclenche un mark-seen fire-and-forget à
  // chaque visite, mais sur la liste elle-même on n'a pas encore ouvert la
  // comparaison — c'est seulement après click sur une carte que le drill-in
  // déclenche le marqueur. Tant que l'utilisateur·rice reste sur la liste,
  // les pastilles persistent. (Note : la visite de /resultats marque déjà
  // l'ensemble côté serveur, donc en pratique tout passe à `seenByCreatorAt`
  // au prochain reload — c'est cohérent avec le ResponseSwitcher.)
  const isUnseen = r.seenByCreatorAt === null;
  const date = new Date(r.createdAt);
  const dateLabel = (() => {
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(date);
    } catch {
      return "";
    }
  })();
  // Petit verdict relatif : "Mieux", "Comme toi", "Moins bien". Léger nudge
  // narratif sans surcharger la carte avec 5 chiffres — le score précis
  // reste affiché à côté pour qui veut.
  const verdict =
    r.score > creatorScore
      ? { label: "Mieux que toi", color: "var(--coral)" }
      : r.score === creatorScore
        ? { label: "Comme toi", color: "var(--ink-soft)" }
        : { label: "Moins que toi", color: "var(--ink-mute)" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="defi-response-card"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "14px 16px",
        background: "var(--paper)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 14,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-body)",
        color: "var(--ink)",
        transition:
          "border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s",
      }}
    >
      {isUnseen ? (
        <span
          aria-label="Réponse non encore vue"
          style={{
            position: "absolute",
            top: -4,
            left: -4,
            width: 11,
            height: 11,
            borderRadius: 999,
            background: "var(--coral)",
            border: "2px solid var(--cream)",
          }}
        />
      ) : null}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {r.amiLabel}
        </div>
        <div
          style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.04em",
            color: "var(--ink-mute)",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: verdict.color, fontWeight: 600 }}>
            {verdict.label}
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{dateLabel}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span
          className="mono"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink)",
          }}
        >
          {r.score}
          <span style={{ color: "var(--ink-mute)" }}>/{total}</span>
        </span>
        <DI.Arrow size={14} />
      </div>
    </button>
  );
}

/// Wrapper de DefiBrandMark qui se masque automatiquement quand la page est
/// rendue dans la chrome app (`?from=app`). Sans ça, l'utilisateur·rice voit
/// le logo deux fois : une dans le HomeHeader (mobile) ou l'AppNav (desktop)
/// en haut, et une au pied de la page. Avant on faisait redescendre fromApp
/// par prop dans chaque inner page (mobile + desktop), bruyant pour un signal
/// pur lecture — useSearchParams le récupère directement.
function PageBrandMark() {
  const searchParams = useSearchParams();
  if (searchParams?.get("from") === "app") return null;
  return <DefiBrandMark href={"/"} />;
}

/// Petit lien "← Toutes les réponses" qui ramène le créateur à la vue
/// index. Discret (mono, ink-soft) pour ne pas concurrencer le sélecteur
/// pill juste en-dessous, mais reconnaissable.
function BackToListLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 0",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        color: "var(--ink-soft)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
        textTransform: "uppercase",
      }}
    >
      ← Toutes les réponses
    </button>
  );
}

// ============================================================================
// Page C — vue résultats partagés
// ============================================================================

function ResultsPage({
  defi,
  response,
  audience,
  currentIdx,
  onSelectResponse,
  onShowList,
  fromApp,
}: {
  defi: SerializableDefi;
  response: SerializableDefi["responses"][number];
  audience: Audience;
  /// Position de `response` dans `defi.responses` — sert au highlight du
  /// pill actif dans le ResponseSwitcher.
  currentIdx: number;
  /// Sélectionne explicitement la réponse à afficher dans la comparaison.
  /// Utilisé par le créateur quand il a plusieurs amis ayant joué.
  onSelectResponse: (idx: number) => void;
  /// Retour à la vue index (liste des amis). Visible uniquement pour le
  /// créateur quand `responses.length >= 2` — sinon il n'y a pas de liste.
  onShowList: () => void;
  /// Visiteur arrivé depuis l'app (vs lien partagé externe). On injecte alors
  /// HomeHeader en haut et on ajoute la padding bottom requise par la
  /// BottomTabBar rendue à l'extérieur.
  fromApp: boolean;
}) {
  const router = useRouter();
  const mine = {
    name: defi.creatorPseudo,
    score: defi.creatorScore,
    total: defi.total,
  };
  const other = {
    name: response.amiLabel,
    score: response.score,
    total: defi.total,
  };

  // Calcule les divergences : questions où militant et ami n'ont pas
  // le même verdict correct/incorrect, ou ont sélectionné un choix
  // différent (utile pour les A/B / QCM). Pour l'estimation numérique,
  // une "divergence" = pas la même closeness binaire (correct/incorrect).
  const divergences = defi.questions.filter((q) => {
    const m = defi.creatorAnswers[q.id];
    const o = response.answers[q.id];
    if (!m && !o) return false;
    if ((m?.correct ?? false) !== (o?.correct ?? false)) return true;
    // Mêmes verdicts → on regarde si la valeur exacte diffère (cas QCM/AB).
    return JSON.stringify(m?.value) !== JSON.stringify(o?.value);
  });

  return (
    // `app-shell` : CSS masque ce wrapper sur desktop (cf. globals.css), donc
    // sur grand écran le SSR mobile reste invisible jusqu'à ce que React
    // bascule sur ResultsPageDesktop après hydration. Sans ça, flash mobile.
    // `with-bottom-bar` : ajoute la padding-bottom qui compense la
    // BottomTabBar fixed quand on est en mode app (cf. globals.css).
    <div
      className={"app-shell" + (fromApp ? " with-bottom-bar" : "")}
      style={{
        minHeight: "100dvh",
        background: "var(--cream)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {fromApp ? (
        <HomeHeader onNavigate={(t) => router.push(`/?s=${t}`)} />
      ) : null}
      <DefiAppBar
        title="Résultats partagés"
        sub={defi.themeLabel}
      />

      <div
        style={{
          maxWidth: 480,
          width: "100%",
          margin: "0 auto",
          // Réserve la hauteur de la barre d'action fixe (cf. CTAFooter)
          // pour qu'elle ne recouvre pas le bas de page.
          padding: "0 0 96px",
          flex: 1,
        }}
      >
        {/* Titre libre éventuel : citation sous l'AppBar, avant le score.
            On le place ici plutôt que dans le sub de l'AppBar parce que
            les titres peuvent atteindre 60 chars, ce qui déborderait
            sur la barre étroite. */}
        {defi.title ? (
          <div
            style={{
              padding: "0 16px 14px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 15,
                lineHeight: 1.4,
                color: "var(--ink)",
                borderLeft: "3px solid var(--coral)",
                paddingLeft: 12,
                textWrap: "pretty",
              }}
            >
              « {defi.title} »
            </div>
          </div>
        ) : null}

        {/* Sélecteur de réponse — visible uniquement pour le créateur quand
            plusieurs amis ont joué. Permet de basculer entre les comparaisons
            sans avoir à naviguer ailleurs. Pour l'ami (audience === "ami"),
            on cache : on ne lui expose pas les autres répondeurs (privacy). */}
        {audience === "militant" && defi.responses.length > 1 ? (
          <>
            <div style={{ padding: "0 16px 6px" }}>
              <BackToListLink onClick={onShowList} />
            </div>
            <div style={{ padding: "0 16px 12px" }}>
              <ResponseSwitcher
                responses={defi.responses}
                currentIdx={currentIdx}
                onSelect={onSelectResponse}
                total={defi.total}
              />
            </div>
          </>
        ) : null}

        <div style={{ padding: "0 16px 14px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--ink-mute)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
              textAlign: "center",
            }}
          >
            Vous avez tous deux répondu
          </div>
          <ScoreBadge mine={mine} opponent={other} />
        </div>

        {divergences.length > 0 ? (
          <DivergenceBlock
            count={divergences.length}
            total={defi.total}
            items={divergences.map((q, i) => ({
              id: q.id,
              num:
                defi.questions.findIndex((x) => x.id === q.id) + 1 || i + 1,
              text: q.question,
            }))}
          />
        ) : (
          <NoDivergenceBlock total={defi.total} />
        )}

        <div
          style={{
            padding: "0 16px",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.01em",
            marginBottom: 8,
          }}
        >
          Question par question
        </div>

        <div
          style={{
            padding: "0 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {defi.questions.map((q, idx) => (
            <QuestionRow
              key={q.id}
              q={q}
              idx={idx + 1}
              mineRec={defi.creatorAnswers[q.id] ?? null}
              otherRec={response.answers[q.id] ?? null}
              mineName={defi.creatorPseudo}
              otherName={response.amiLabel}
            />
          ))}
        </div>

        <CTAFooter
          fromApp={fromApp}
          audience={audience}
          shortCode={defi.shortCode}
          creatorPseudo={defi.creatorPseudo}
          currentUserPseudo={defi.currentUserPseudo}
        />

        <div
          style={{
            padding: "20px 16px 24px",
            textAlign: "center",
          }}
        >
          <PageBrandMark />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function DivergenceBlock({
  count,
  total,
  items,
}: {
  count: number;
  total: number;
  items: Array<{ id: string; num: number; text: string }>;
}) {
  return (
    <div
      style={{
        margin: "0 16px 16px",
        padding: "14px 16px",
        background: "var(--ink)",
        color: "var(--cream-warm)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.65,
        }}
      >
        Vous divergez sur
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          marginTop: 6,
          textWrap: "balance",
        }}
      >
        {count} question{count > 1 ? "s" : ""} sur {total}.
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: "var(--font-serif)",
          fontSize: 13,
          lineHeight: 1.4,
          opacity: 0.8,
          fontStyle: "italic",
        }}
      >
        Là où ça se discute : au resto, au boulot, en commentaires.
      </div>
      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {items.map((it) => (
          <a
            key={it.id}
            href={`#q-${it.id}`}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "var(--cream-warm)",
              border: 0,
              borderRadius: 10,
              padding: "8px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Q{it.num} · {it.text}
            </span>
            <DI.ChevDown size={11} />
          </a>
        ))}
      </div>
    </div>
  );
}

function NoDivergenceBlock({ total }: { total: number }) {
  return (
    <div
      style={{
        margin: "0 16px 16px",
        padding: "14px 16px",
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 18,
          lineHeight: 1.2,
          letterSpacing: "-0.015em",
        }}
      >
        Vous êtes d&apos;accord sur les {total} questions.
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 13,
          color: "var(--ink-soft)",
          lineHeight: 1.4,
        }}
      >
        Rare. Parcourez les explications ensemble, c&apos;est où vous allez
        affiner votre regard.
      </div>
    </div>
  );
}

function QuestionRow({
  q,
  idx,
  mineRec,
  otherRec,
  mineName,
  otherName,
}: {
  q: Question;
  idx: number;
  mineRec: DefiAnswerRecord | null;
  otherRec: DefiAnswerRecord | null;
  mineName: string;
  otherName: string;
}) {
  // Replié par défaut, même en cas de divergence : cinq explications
  // dépliées d'office repoussaient tout le reste (dont « À mon tour de
  // défier ») tout en bas. Les liens « Vous divergez sur » (#q-…) déplient
  // la question visée en y menant.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const anchor = `#q-${q.id}`;
    const onHash = () => {
      if (window.location.hash === anchor) setOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [q.id]);

  const explanation = "explain" in q ? q.explain : "";

  return (
    <div
      id={`q-${q.id}`}
      style={{
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 14,
        overflow: "hidden",
        scrollMarginTop: 80,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "transparent",
          border: 0,
          padding: "12px 14px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--ink-mute)",
            letterSpacing: "0.05em",
            paddingTop: 3,
            minWidth: 16,
          }}
        >
          {String(idx).padStart(2, "0")}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 13.5,
              color: "var(--ink)",
              lineHeight: 1.3,
              marginBottom: 6,
            }}
          >
            {q.question}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PickPill name={mineName} rec={mineRec} q={q} />
            <PickPill name={otherName} rec={otherRec} q={q} />
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            color: "var(--ink-mute)",
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.2s",
            marginTop: 3,
          }}
        >
          <DI.ChevDown />
        </span>
      </button>

      {open ? (
        <div
          style={{
            padding: "12px 14px 14px",
            borderTop: "1px solid var(--rule-soft)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-mute)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Bonne réponse
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--ink)",
              marginBottom: 8,
            }}
          >
            {formatCorrectAnswer(q)}
          </div>
          {explanation ? (
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
              }}
            >
              {explanation}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PickPill({
  name,
  rec,
  q,
}: {
  name: string;
  rec: DefiAnswerRecord | null;
  q: Question;
}) {
  const skipped = !rec || rec.value === null || rec.value === undefined;
  const right = !skipped && rec.correct;

  const palette = skipped
    ? {
        bg: "var(--cream-deep)",
        color: "var(--ink-mute)",
        border: "var(--rule)",
      }
    : right
      ? {
          bg: "rgba(74,143,92,0.10)",
          color: "var(--signal-good)",
          border: "rgba(74,143,92,0.25)",
        }
      : {
          bg: "rgba(199,93,93,0.08)",
          color: "var(--signal-bad)",
          border: "rgba(199,93,93,0.22)",
        };

  const label = skipped
    ? "Pas répondu"
    : formatUserAnswer(q, rec.value as Parameters<typeof formatUserAnswer>[1]);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.04em",
        padding: "3px 8px",
        borderRadius: 99,
        background: palette.bg,
        color: palette.color,
        fontWeight: 600,
        border: `1px solid ${palette.border}`,
      }}
    >
      <span style={{ color: "var(--ink-soft)" }}>{name}</span>
      <span style={{ opacity: 0.55 }}>·</span>
      <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {skipped ? null : right ? <DI.Check size={10} /> : <DI.X size={9} />}
    </span>
  );
}

/// Action principale (« À mon tour de défier », ou « Partager le défi » pour
/// le créateur) fixée en bas de l'écran mobile : en bas de page, elle
/// n'apparaissait qu'après les cinq questions. `position: fixed` et non
/// `sticky` : le conteneur `.app-shell` est en `overflow: hidden`, ce qui
/// neutralise sticky. Au-dessus de la barre d'onglets quand on vient de
/// l'appli. Le wrapper `.app-shell` est masqué sur desktop, la barre aussi.
function FixedPrimaryAction({
  fromApp,
  children,
}: {
  fromApp: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: fromApp
          ? "calc(var(--bottom-tab-bar-height) + env(safe-area-inset-bottom, 0px))"
          : 0,
        zIndex: 40,
        padding: fromApp
          ? "14px 16px 10px"
          : "14px 16px calc(14px + env(safe-area-inset-bottom, 0px))",
        background:
          "linear-gradient(to bottom, rgba(245, 241, 232, 0) 0%, var(--cream) 32%)",
        pointerEvents: "none",
      }}
    >
      <div style={{ maxWidth: 448, margin: "0 auto", pointerEvents: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function CTAFooter({
  fromApp,
  audience,
  shortCode,
  creatorPseudo,
  currentUserPseudo,
}: {
  fromApp: boolean;
  audience: Audience;
  shortCode: string;
  creatorPseudo: string;
  currentUserPseudo: string | null;
}) {
  // router.push reste client-side (pas de full reload) — meilleure perf
  // perçue que window.location.href = "/?s=..." qui forçait un SSR complet.
  const router = useRouter();
  async function shareDefi() {
    // Partage l'URL de jeu (/d/[shortCode]) et non /resultats : l'objectif
    // est d'inviter de nouveaux participants à répondre, pas de leur
    // montrer une comparaison qui ne les concerne pas.
    const url = `${window.location.origin}/d/${shortCode}`;
    const nav: Navigator | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) {
      try {
        await nav.share({
          title: "Un défi Mon2027",
          text: `${creatorPseudo} te défie. À toi de jouer →`,
          url,
        });
        return;
      } catch {
        /* user cancelled — fallback ci-dessous */
      }
    }
    try {
      await nav?.clipboard?.writeText(url);
    } catch {
      /* perms blocked */
    }
  }

  if (audience === "militant") {
    return (
      <>
      <FixedPrimaryAction fromApp={fromApp}>
        <DefiPrimaryBtn onClick={shareDefi}>
          <DI.Share size={15} />
          Partager le défi
        </DefiPrimaryBtn>
      </FixedPrimaryAction>
      <CtaBar>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <DefiSecondaryBtn onClick={() => router.push("/?s=challenge")}>
            <DI.Send size={14} />
            Créer un nouveau défi
          </DefiSecondaryBtn>
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-serif)",
              fontSize: 12,
              color: "var(--ink-soft)",
              fontStyle: "italic",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            Envoie le lien à quelqu&apos;un d&apos;autre pour qu&apos;iel
            réponde à son tour.
          </div>
        </div>
      </CtaBar>
      </>
    );
  }

  // Ami ou visiteur tiers : CTA pour rebondir vers la création. Si l'ami
  // n'a pas de compte, on lui propose d'en créer un pour conserver ses
  // scores (link discret, pas un bandeau intrusif).
  return (
    <>
    <FixedPrimaryAction fromApp={fromApp}>
      <DefiPrimaryBtn onClick={() => router.push("/?s=challenge")}>
        <DI.Send size={15} />
        À mon tour de défier
      </DefiPrimaryBtn>
    </FixedPrimaryAction>
    <CtaBar>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <DefiSecondaryBtn onClick={() => router.push("/")}>
          <DI.Sun size={14} />
          Explorer la question du jour
        </DefiSecondaryBtn>
        {currentUserPseudo === null ? (
          <Link
            // `next=` ramène l'utilisateur ici après signup, ce qui déclenche
            // l'auto-claim côté serveur (cf. resultats/page.tsx) pour rattacher
            // sa DefiResponse à son nouveau compte.
            href={`/?s=account&next=${encodeURIComponent(`/d/${shortCode}/resultats`)}`}
            style={{
              marginTop: 4,
              padding: "8px 4px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-soft)",
              letterSpacing: "0.04em",
              textAlign: "center",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Crée un compte · Garde tes scores
          </Link>
        ) : null}
      </div>
    </CtaBar>
    </>
  );
}

// ============================================================================
// Waiting state — vue militant pendant que l'ami n'a pas joué.
// ============================================================================

function WaitingState({
  shortCode,
  creatorPseudo,
  creatorScore,
  total,
  themeLabel,
  title,
  sentAgoLabel,
  amIMilitant,
  questions,
  creatorAnswers,
  fromApp,
}: {
  shortCode: string;
  creatorPseudo: string;
  creatorScore: number;
  total: number;
  themeLabel: string;
  title: string | null;
  sentAgoLabel: string;
  amIMilitant: boolean;
  /// Questions du défi (incluses pour rendre la vue militant complète).
  /// Pour la vue non-militant on n'en a pas besoin (CTA "Jouer le défi"
  /// renvoie vers /d/[code] qui les charge à part).
  questions: Question[];
  /// Réponses du créateur (vide {} pour un visiteur public — le serveur
  /// les masque). Seul le militant a la map complète.
  creatorAnswers: DefiAnswersMap;
  /// Cf. ResultsPage : entoure de HomeHeader + with-bottom-bar quand
  /// l'utilisateur arrive depuis l'app (vs lien externe).
  fromApp: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function reshare() {
    const url = `${window.location.origin}/d/${shortCode}`;
    const nav: Navigator | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) {
      try {
        await nav.share({
          title: "Un défi Mon2027",
          text: `${creatorPseudo} te défie sur ${total} questions.`,
          url,
        });
        return;
      } catch {
        /* cancelled — fallback */
      }
    }
    try {
      await nav?.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* perms */
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/d/${shortCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* perms */
    }
  }

  // Vue militant : page complète avec stats, questions et actions de
  // partage. Le militant ne va pas rejouer son défi (cf. discussion produit
  // mai 2026) — on lui donne plutôt tout le contexte pour suivre l'attente
  // et re-partager. La branche non-militant garde le bouton "Jouer le défi"
  // qui mène vers /d/[code] (le vrai point d'entrée pour jouer).
  if (amIMilitant) {
    return (
      <div
        className={"app-shell" + (fromApp ? " with-bottom-bar" : "")}
        style={{
          minHeight: "100dvh",
          background: "var(--cream)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {fromApp ? (
          <HomeHeader onNavigate={(t) => router.push(`/?s=${t}`)} />
        ) : null}
        <DefiAppBar title="Résultats" sub={themeLabel} />

        <div
          style={{
            flex: 1,
            maxWidth: 480,
            width: "100%",
            margin: "0 auto",
            padding: "0 0 24px",
          }}
        >
          {/* Bandeau "En attente" compact — message + relancer en ligne. */}
          <div
            style={{
              margin: "0 16px 18px",
              padding: "14px 16px",
              background: "var(--cream-warm)",
              border: "1.5px dashed var(--rule)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: "var(--yellow)",
                borderRadius: 99,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              <DI.Clock />
              En attente
            </span>
            <div
              style={{
                flex: 1,
                minWidth: 180,
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 14,
                lineHeight: 1.35,
                color: "var(--ink)",
              }}
            >
              Personne n&apos;a encore joué : tu seras notifié·e dès
              qu&apos;iel termine.
            </div>
          </div>

          {/* Titre libre si fourni — citation pleine largeur sous le bandeau. */}
          {title ? (
            <div style={{ padding: "0 16px 16px" }}>
              <div
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 16,
                  lineHeight: 1.4,
                  color: "var(--ink)",
                  borderLeft: "3px solid var(--coral)",
                  paddingLeft: 12,
                  textWrap: "pretty",
                }}
              >
                « {title} »
              </div>
            </div>
          ) : null}

          {/* Stats grid 2×2 : thème, ton score, attente, envoyé il y a. */}
          <div
            style={{
              margin: "0 16px 18px",
              padding: "14px 16px",
              background: "var(--paper)",
              border: "1.5px solid var(--rule-soft)",
              borderRadius: 14,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <Stat label="Thème" value={themeLabel} />
            <Stat label="Questions" value={`${total}`} />
            <Stat label="Ton score" value={`${creatorScore}/${total}`} />
            <Stat label="Envoyé il y a" value={sentAgoLabel} />
          </div>

          {/* Liste des questions du défi avec la réponse du créateur. On
              réutilise QuestionRow en passant otherRec=null : la pastille
              "ami" reste vide ("Pas répondu"), claire vis-à-vis du fait
              qu'aucun ami n'a encore joué. */}
          <div
            style={{
              padding: "0 16px",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.01em",
              marginBottom: 8,
            }}
          >
            Tes réponses
          </div>
          <div
            style={{
              padding: "0 16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                q={q}
                idx={i + 1}
                mineRec={creatorAnswers[q.id] ?? null}
                otherRec={null}
                mineName={creatorPseudo}
                otherName="Ami·e"
              />
            ))}
          </div>

          {/* Actions de partage : relancer (share natif/clipboard) +
              copier le lien explicite (fallback visible quand share n'est
              pas dispo, ex. desktop sans Web Share). */}
          <div
            style={{
              padding: "0 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <DefiPrimaryBtn onClick={reshare}>
              <DI.Share size={16} />
              Relancer · partager à nouveau
            </DefiPrimaryBtn>
            <DefiSecondaryBtn onClick={copyLink}>
              {copied ? <DI.Check size={14} /> : <DI.Copy size={14} />}
              {copied ? "Lien copié" : "Copier le lien"}
            </DefiSecondaryBtn>
          </div>
        </div>

        <div style={{ padding: "20px 16px 24px", textAlign: "center" }}>
          <PageBrandMark />
        </div>
      </div>
    );
  }

  // Vue non-militant : visiteur tombé sur /resultats sans avoir joué. On
  // le redirige doucement vers /d/[code] via un CTA explicite. Layout
  // historique conservé — simple, focus sur l'action.
  return (
    <div
      className={"app-shell" + (fromApp ? " with-bottom-bar" : "")}
      style={{
        minHeight: "100dvh",
        background: "var(--cream)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {fromApp ? (
        <HomeHeader onNavigate={(t) => router.push(`/?s=${t}`)} />
      ) : null}
      <DefiAppBar title="Résultats" sub={themeLabel} />

      <div
        style={{
          flex: 1,
          padding: "24px 28px 0",
          display: "flex",
          flexDirection: "column",
          maxWidth: 480,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "var(--cream-warm)",
            border: "1.5px dashed var(--rule)",
            borderRadius: 18,
            padding: "26px 22px",
            textAlign: "center",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: "var(--yellow)",
              borderRadius: 99,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <DI.Clock />
            En attente
          </span>

          <div
            style={{
              marginTop: 16,
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 24,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
          >
            <span style={{ color: "var(--coral)" }}>{creatorPseudo}</span>{" "}
            attend qu&apos;on joue son défi.
          </div>
          {title ? (
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 15,
                lineHeight: 1.4,
                color: "var(--ink)",
                textWrap: "pretty",
              }}
            >
              « {title} »
            </div>
          ) : null}
          <div
            style={{
              marginTop: 8,
              fontFamily: "var(--font-serif)",
              fontSize: 13.5,
              lineHeight: 1.5,
              color: "var(--ink-soft)",
            }}
          >
            Tape sur Commencer pour jouer les {total} questions.
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <DefiPrimaryBtn
            onClick={() => router.push(`/d/${shortCode}`)}
            yellow
          >
            Jouer le défi
            <DI.Arrow size={16} />
          </DefiPrimaryBtn>
        </div>
      </div>

      <div style={{ padding: "20px 16px 24px", textAlign: "center" }}>
        <PageBrandMark />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          color: "var(--ink-mute)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 3,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/// Reproduit la mise en forme "humaine" de la bonne réponse selon le format.
/// Réutilise formatUserAnswer pour les valeurs ; pour les formats non
/// triviaux (composite), on retombe sur "Voir explication".
function formatCorrectAnswer(q: Question): string {
  if (q.format === "estimation") {
    return formatUserAnswer(q, q.answer);
  }
  if (q.format === "ab") {
    return q.choices[q.correctIndex].label;
  }
  if (q.format === "vraifaux") {
    return q.correctAnswer ? "Vrai" : "Faux";
  }
  if (q.format === "qcm") {
    return q.choices[q.correctIndex] ?? "–";
  }
  // Formats composites : la "bonne réponse" est multi-valeurs, lire
  // l'explication est plus utile qu'une chaîne synthétique.
  return "Voir explication ci-dessous";
}

// ============================================================================
// Desktop variants — rendues quand useIsDesktop() (≥ 768px).
//
// On reprend le scaffolding des autres pages desktop (max-w container 1320,
// grille éditorial + aside sticky avec bordure ink + shadow 6px déplacée)
// pour ne pas avoir une carte 480px perdue au centre d'un écran cream vide.
// La logique métier (audience, divergences, CTA targets) est strictement
// dupliquée des composants mobiles — c'est volontaire : pas d'abstraction
// prématurée tant qu'il n'y a que deux variantes.
// ============================================================================

function ResultsPageDesktop({
  defi,
  response,
  audience,
  currentIdx,
  onSelectResponse,
  onShowList,
}: {
  defi: SerializableDefi;
  response: SerializableDefi["responses"][number];
  audience: Audience;
  currentIdx: number;
  onSelectResponse: (idx: number) => void;
  /// Retour à la vue index. Cf. ResultsPage pour la rationale.
  onShowList: () => void;
}) {
  const mine = {
    name: defi.creatorPseudo,
    score: defi.creatorScore,
    total: defi.total,
  };
  const other = {
    name: response.amiLabel,
    score: response.score,
    total: defi.total,
  };

  const divergences = defi.questions.filter((q) => {
    const m = defi.creatorAnswers[q.id];
    const o = response.answers[q.id];
    if (!m && !o) return false;
    if ((m?.correct ?? false) !== (o?.correct ?? false)) return true;
    return JSON.stringify(m?.value) !== JSON.stringify(o?.value);
  });

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--cream)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* AppBar centré dans le container desktop pour qu'il s'aligne sur la
          grille en-dessous (sinon il colle à gauche sur grand écran). */}
      <div
        style={{
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
          padding: "16px 32px 0",
        }}
      >
        <DefiAppBar
          title="Résultats partagés"
          sub={defi.themeLabel}
        />
      </div>

      <div
        style={{
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
          padding: "8px 32px 48px",
        }}
      >
        {/* Citation pleine largeur, lisible sur grand écran. */}
        {defi.title ? (
          <div style={{ padding: "8px 0 28px", maxWidth: 920 }}>
            <div
              style={{
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
              « {defi.title} »
            </div>
          </div>
        ) : null}

        {/* Sélecteur de réponse — visible uniquement pour le créateur quand
            plusieurs amis ont joué. Cf. version mobile pour la rationale. */}
        {audience === "militant" && defi.responses.length > 1 ? (
          <>
            <div style={{ marginBottom: 10, maxWidth: 920 }}>
              <BackToListLink onClick={onShowList} />
            </div>
            <div style={{ marginBottom: 28, maxWidth: 920 }}>
              <ResponseSwitcher
                responses={defi.responses}
                currentIdx={currentIdx}
                onSelect={onSelectResponse}
                total={defi.total}
              />
            </div>
          </>
        ) : null}

        {/* Hero score — centré, ScoreBadge "lg" pour donner du poids. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "8px 0 40px",
            borderBottom: "1px solid var(--rule-soft)",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-mute)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Vous avez tous deux répondu
          </div>
          <div style={{ maxWidth: 720, width: "100%" }}>
            <ScoreBadge mine={mine} opponent={other} size="lg" />
          </div>
        </div>

        {/* Grille 2 colonnes : analyse à gauche, aside sticky à droite. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)",
            gap: "clamp(32px, 4vw, 64px)",
            alignItems: "start",
          }}
        >
          {/* Colonne principale */}
          <div>
            {divergences.length > 0 ? (
              <DivergenceBlockDesktop
                count={divergences.length}
                total={defi.total}
                items={divergences.map((q, i) => ({
                  id: q.id,
                  num:
                    defi.questions.findIndex((x) => x.id === q.id) + 1 || i + 1,
                  text: q.question,
                }))}
              />
            ) : (
              <NoDivergenceBlockDesktop total={defi.total} />
            )}

            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: "-0.02em",
                margin: "32px 0 16px",
              }}
            >
              Question par question
            </h2>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {defi.questions.map((q, idx) => (
                <QuestionRow
                  key={q.id}
                  q={q}
                  idx={idx + 1}
                  mineRec={defi.creatorAnswers[q.id] ?? null}
                  otherRec={response.answers[q.id] ?? null}
                  mineName={defi.creatorPseudo}
                  otherName={response.amiLabel}
                />
              ))}
            </div>
          </div>

          {/* Aside sticky avec les CTAs. Pas de nav au-dessus → top: 16 suffit
              (vs top: 88 pour dt-doc-aside qui prévoit la nav 64px). */}
          <CTAAsideDesktop
            audience={audience}
            shortCode={defi.shortCode}
            creatorPseudo={defi.creatorPseudo}
            themeLabel={defi.themeLabel}
            total={defi.total}
            sentAgoLabel={defi.sentAgoLabel}
            currentUserPseudo={defi.currentUserPseudo}
          />
        </div>

        <div style={{ marginTop: 48, textAlign: "center" }}>
          <PageBrandMark />
        </div>
      </div>
    </div>
  );
}

function CTAAsideDesktop({
  audience,
  shortCode,
  creatorPseudo,
  themeLabel,
  total,
  sentAgoLabel,
  currentUserPseudo,
}: {
  audience: Audience;
  shortCode: string;
  creatorPseudo: string;
  themeLabel: string;
  total: number;
  sentAgoLabel: string;
  currentUserPseudo: string | null;
}) {
  const router = useRouter();
  async function shareDefi() {
    // Cf. variante mobile : on partage l'URL de jeu, pas /resultats.
    const url = `${window.location.origin}/d/${shortCode}`;
    const nav: Navigator | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) {
      try {
        await nav.share({
          title: "Un défi Mon2027",
          text: `${creatorPseudo} te défie. À toi de jouer →`,
          url,
        });
        return;
      } catch {
        /* user cancelled — fallback */
      }
    }
    try {
      await nav?.clipboard?.writeText(url);
    } catch {
      /* perms */
    }
  }

  return (
    <aside
      style={{
        position: "sticky",
        top: 24,
        background: "var(--paper)",
        border: "1.5px solid var(--ink)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "4px 4px 0 var(--ink)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--ink-mute)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {audience === "militant" ? "Et après ?" : "À toi"}
      </div>

      {/* Mini-méta : situe le défi dans le temps + thème, plus discret qu'un
          stats grid (la vraie data, c'est le score qui est déjà en hero). */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "0 0 18px",
          borderBottom: "1px solid var(--rule-soft)",
          marginBottom: 18,
        }}
      >
        <AsideMeta label="Thème" value={themeLabel} />
        <AsideMeta label="Questions" value={`${total}`} />
        <AsideMeta label="Envoyé il y a" value={sentAgoLabel} />
      </div>

      {audience === "militant" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <DefiPrimaryBtn onClick={shareDefi}>
            <DI.Share size={15} />
            Partager le défi
          </DefiPrimaryBtn>
          <DefiSecondaryBtn
            onClick={() => router.push("/?s=challenge")}
          >
            <DI.Send size={14} />
            Créer un nouveau défi
          </DefiSecondaryBtn>
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-serif)",
              fontSize: 12,
              color: "var(--ink-soft)",
              fontStyle: "italic",
              lineHeight: 1.45,
            }}
          >
            Envoie le lien à quelqu&apos;un d&apos;autre pour qu&apos;iel
            réponde à son tour.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <DefiPrimaryBtn
            onClick={() => router.push("/?s=challenge")}
          >
            <DI.Send size={15} />
            À mon tour de défier
          </DefiPrimaryBtn>
          <DefiSecondaryBtn onClick={() => router.push("/")}>
            <DI.Sun size={14} />
            Explorer la question du jour
          </DefiSecondaryBtn>
          {/* Soft prompt création de compte — uniquement à l'ami non connecté.
              Connecté : on ne le relance pas, ses scores sont déjà rattachés.
              `next=` ramène ici après signup → déclenche l'auto-claim côté
              serveur pour rattacher la DefiResponse au nouveau compte. */}
          {currentUserPseudo === null ? (
            <Link
              href={`/?s=account&next=${encodeURIComponent(`/d/${shortCode}/resultats`)}`}
              style={{
                marginTop: 4,
                padding: "10px 4px 4px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-soft)",
                letterSpacing: "0.04em",
                textAlign: "center",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Crée un compte · Garde tes scores
            </Link>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function AsideMeta({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ink-mute)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 14,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
          textAlign: "right",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/// DivergenceBlock variante desktop — plus aéré, items horizontaux plutôt
/// que verticaux (l'écran respire, autant en profiter).
function DivergenceBlockDesktop({
  count,
  total,
  items,
}: {
  count: number;
  total: number;
  items: Array<{ id: string; num: number; text: string }>;
}) {
  return (
    <div
      style={{
        padding: "20px 24px",
        background: "var(--ink)",
        color: "var(--cream-warm)",
        borderRadius: 20,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          opacity: 0.65,
        }}
      >
        Vous divergez sur
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 28,
          lineHeight: 1.1,
          letterSpacing: "-0.025em",
          marginTop: 8,
          textWrap: "balance",
        }}
      >
        {count} question{count > 1 ? "s" : ""} sur {total}.
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: "var(--font-serif)",
          fontSize: 15,
          lineHeight: 1.45,
          opacity: 0.78,
          fontStyle: "italic",
          maxWidth: 540,
        }}
      >
        Là où ça se discute : au resto, au boulot, en commentaires.
      </div>
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {items.map((it) => (
          <a
            key={it.id}
            href={`#q-${it.id}`}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "var(--cream-warm)",
              border: 0,
              borderRadius: 10,
              padding: "10px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Q{it.num} · {it.text}
            </span>
            <DI.ChevDown size={11} />
          </a>
        ))}
      </div>
    </div>
  );
}

function NoDivergenceBlockDesktop({ total }: { total: number }) {
  return (
    <div
      style={{
        padding: "20px 24px",
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 20,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
        }}
      >
        Vous êtes d&apos;accord sur les {total} questions.
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 15,
          color: "var(--ink-soft)",
          lineHeight: 1.45,
          maxWidth: 540,
        }}
      >
        Rare. Parcourez les explications ensemble, c&apos;est où vous allez
        affiner votre regard.
      </div>
    </div>
  );
}

// ============================================================================
// WaitingState desktop — variante 2-colonnes pour les deux branches
// (militant qui attend / visiteur tiers qui découvre).
// ============================================================================

function WaitingStateDesktop({
  shortCode,
  creatorPseudo,
  creatorScore,
  total,
  themeLabel,
  title,
  sentAgoLabel,
  amIMilitant,
  questions,
  creatorAnswers,
}: {
  shortCode: string;
  creatorPseudo: string;
  creatorScore: number;
  total: number;
  themeLabel: string;
  title: string | null;
  sentAgoLabel: string;
  amIMilitant: boolean;
  questions: Question[];
  creatorAnswers: DefiAnswersMap;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function reshare() {
    const url = `${window.location.origin}/d/${shortCode}`;
    const nav: Navigator | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) {
      try {
        await nav.share({
          title: "Un défi Mon2027",
          text: `${creatorPseudo} te défie sur ${total} questions.`,
          url,
        });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await nav?.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* perms */
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/d/${shortCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* perms */
    }
  }

  // Vue militant : on lui sert un dashboard complet (en attente + ses
  // réponses + relancer). Vue visiteur tiers : carte centrée plus large
  // qu'en mobile, focalisée sur l'action "Jouer le défi".
  if (!amIMilitant) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--cream)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            maxWidth: 1320,
            width: "100%",
            margin: "0 auto",
            padding: "16px 32px 0",
          }}
        >
          <DefiAppBar title="Résultats" sub={themeLabel} />
        </div>

        <div
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            padding: "24px 32px 48px",
          }}
        >
          <div
            style={{
              maxWidth: 640,
              width: "100%",
              background: "var(--cream-warm)",
              border: "1.5px dashed var(--rule)",
              borderRadius: 24,
              padding: "40px 36px",
              textAlign: "center",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                background: "var(--yellow)",
                borderRadius: 99,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <DI.Clock />
              En attente
            </span>

            <div
              style={{
                marginTop: 22,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(28px, 3.2vw, 40px)",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                textWrap: "balance",
              }}
            >
              <span style={{ color: "var(--coral)" }}>{creatorPseudo}</span>{" "}
              attend qu&apos;on joue son défi.
            </div>
            {title ? (
              <div
                style={{
                  marginTop: 18,
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 17,
                  lineHeight: 1.45,
                  color: "var(--ink)",
                  textWrap: "pretty",
                }}
              >
                « {title} »
              </div>
            ) : null}
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-serif)",
                fontSize: 15,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
              }}
            >
              Clique sur Commencer pour jouer les {total} questions.
            </div>

            <div style={{ marginTop: 28, maxWidth: 320, margin: "28px auto 0" }}>
              <DefiPrimaryBtn
                onClick={() => router.push(`/d/${shortCode}`)}
                yellow
                big
              >
                Jouer le défi
                <DI.Arrow size={16} />
              </DefiPrimaryBtn>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 16px 24px", textAlign: "center" }}>
          <PageBrandMark />
        </div>
      </div>
    );
  }

  // Vue militant — dashboard 2-col : à gauche bandeau en attente + liste
  // "Tes réponses", à droite aside sticky avec stats + boutons de relance.
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--cream)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
          padding: "16px 32px 0",
        }}
      >
        <DefiAppBar title="Résultats" sub={themeLabel} />
      </div>

      <div
        style={{
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
          padding: "8px 32px 48px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)",
          gap: "clamp(32px, 4vw, 64px)",
          alignItems: "start",
        }}
      >
        {/* Colonne principale */}
        <div>
          {/* Bandeau "en attente" + citation, plus aéré qu'en mobile. */}
          <div
            style={{
              padding: "22px 24px",
              background: "var(--cream-warm)",
              border: "1.5px dashed var(--rule)",
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              marginBottom: 24,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                background: "var(--yellow)",
                borderRadius: 99,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              <DI.Clock />
              En attente
            </span>
            <div
              style={{
                flex: 1,
                minWidth: 240,
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 17,
                lineHeight: 1.35,
                color: "var(--ink)",
              }}
            >
              Personne n&apos;a encore joué : tu seras notifié·e dès
              qu&apos;iel termine.
            </div>
          </div>

          {title ? (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 18,
                  lineHeight: 1.45,
                  color: "var(--ink)",
                  borderLeft: "3px solid var(--coral)",
                  paddingLeft: 16,
                  textWrap: "pretty",
                }}
              >
                « {title} »
              </div>
            </div>
          ) : null}

          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "-0.02em",
              margin: "0 0 16px",
            }}
          >
            Tes réponses
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                q={q}
                idx={i + 1}
                mineRec={creatorAnswers[q.id] ?? null}
                otherRec={null}
                mineName={creatorPseudo}
                otherName="Ami·e"
              />
            ))}
          </div>

          <div style={{ marginTop: 36, textAlign: "center" }}>
            <PageBrandMark />
          </div>
        </div>

        {/* Aside sticky : stats + boutons de relance */}
        <aside
          style={{
            position: "sticky",
            top: 24,
            background: "var(--paper)",
            border: "1.5px solid var(--ink)",
            borderRadius: 20,
            padding: 24,
            boxShadow: "4px 4px 0 var(--ink)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--ink-mute)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Ton défi
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "0 0 18px",
              borderBottom: "1px solid var(--rule-soft)",
              marginBottom: 18,
            }}
          >
            <AsideMeta label="Thème" value={themeLabel} />
            <AsideMeta label="Questions" value={`${total}`} />
            <AsideMeta label="Ton score" value={`${creatorScore}/${total}`} />
            <AsideMeta label="Envoyé il y a" value={sentAgoLabel} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DefiPrimaryBtn onClick={reshare}>
              <DI.Share size={15} />
              Relancer · partager
            </DefiPrimaryBtn>
            <DefiSecondaryBtn onClick={copyLink}>
              {copied ? <DI.Check size={14} /> : <DI.Copy size={14} />}
              {copied ? "Lien copié" : "Copier le lien"}
            </DefiSecondaryBtn>
          </div>
        </aside>
      </div>
    </div>
  );
}
