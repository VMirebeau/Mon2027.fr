"use client";

/// Encapsule la gestion de la "scène courante" de l'AppShell :
///   - state local `scene` (source de vérité pendant que AppShell est monté)
///   - état `activeMode` (qui détermine l'item nav surligné)
///   - sync URL `?s=…` via pushState (sans router.push pour ne pas démonter)
///   - sync back/forward via popstate
///   - sauvegarde/restauration de la position de scroll par entrée d'historique
///
/// Pourquoi un hook dédié : ces 4 responsabilités sont couplées entre elles
/// (popstate doit re-lire l'URL ET restaurer le scroll ET resync activeMode)
/// mais découplées du reste de l'AppShell (state du jeu, defi en cours…).
/// Extraire isole la partie la plus fragile — la restauration de scroll au
/// back-forward, qui dépend d'un rAF + d'un flag ref — et libère AppShell
/// de ~60 lignes de glue scrolling.

import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalModeForScene, isSceneId } from "./helpers";
import type { NavTarget, SceneId } from "@/lib/types";

/// Titre du document par scène (« Découvrir · Mon2027 »). L'AppShell change
/// de scène sans navigation Next : sans ça, l'onglet, l'historique et les
/// lecteurs d'écran affichaient « Mon2027 » partout. `null` = titre par
/// défaut de la page. La partie (game / q-*) est titrée question par
/// question par QuestionShell (« Question 2 sur 5 »).
const SCENE_TITLES: Record<SceneId, string | null> = {
  onboarding: null,
  home: "Accueil",
  game: "Partie",
  "q-estim": "Partie",
  "q-tf": "Partie",
  "q-ab": "Partie",
  "q-qcm": "Partie",
  "q-classement": "Partie",
  "q-vftf-multi": "Partie",
  "q-curseur-multi": "Partie",
  "q-cat": "Partie",
  "q-pondere": "Partie",
  recap: "Récap de la partie",
  challenge: "Défier un proche",
  themes: "Découvrir",
  review: "Réviser",
  favorites: "Favoris",
  account: "Compte",
  profile: "Portrait",
  stats: "Statistiques",
  rewards: "Récompenses",
  "defis-history": "Mes défis",
  methode: "Méthode",
  apropos: "À propos",
};

/// Scènes de jeu : le focus va à l'énoncé, posé par QuestionShell.
const PLAY_SCENES: ReadonlySet<SceneId> = new Set<SceneId>([
  "game",
  "q-estim",
  "q-tf",
  "q-ab",
  "q-qcm",
  "q-classement",
  "q-vftf-multi",
  "q-curseur-multi",
  "q-cat",
  "q-pondere",
]);

/// Après un changement de scène, place le focus sur le titre de la nouvelle
/// scène (premier h1, sinon premier h2) hors de la navigation persistante.
/// Sans ça, le focus restait sur le lien cliqué (démonté → <body>) et le
/// lecteur d'écran n'annonçait rien. Le titre reçoit tabIndex=-1 (focus
/// programmatique seulement, sans anneau — cf. globals.css).
function focusSceneHeading() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("h1, h2"),
  ).filter(
    (el) =>
      !el.closest("nav, .dt-nav, [role='dialog']") &&
      el.getClientRects().length > 0,
  );
  const target =
    candidates.find((el) => el.tagName === "H1") ?? candidates[0] ?? null;
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/// Surface scrollable courante :
/// - Desktop (≥768px) : c'est `body` qui scrolle (cf. globals.css media query).
/// - Mobile : c'est `.scroll` (absolute inset:0 dans `.page`) qui scrolle.
/// On regarde d'abord `.scroll` ; s'il n'existe pas (desktop ou scènes
/// immersives type game), on retombe sur `window`.
function getScrollTop(): number {
  if (typeof window === "undefined") return 0;
  const el = document.querySelector<HTMLElement>(".scroll");
  if (el) return el.scrollTop;
  return window.scrollY;
}

function setScrollTop(pos: number) {
  if (typeof window === "undefined") return;
  const el = document.querySelector<HTMLElement>(".scroll");
  if (el) {
    el.scrollTop = pos;
    return;
  }
  window.scrollTo({ top: pos, left: 0, behavior: "auto" });
}

export type SceneRouter = {
  scene: SceneId;
  activeMode: NavTarget;
  setActiveMode: (m: NavTarget) => void;
  /// Force la scène sans toucher à l'URL ni à l'historique — utile pour les
  /// transitions purement internes (ex. popstate, ou setScene piloté par un
  /// fast-path comme un toast de récompense qui veut son propre URL update).
  setSceneRaw: (s: SceneId) => void;
  /// Navigation "avant" classique : pousse une nouvelle entrée d'historique,
  /// met à jour l'URL `?s=<id>` (ou la nettoie si onboarding), et met
  /// `scroll: 0` dans l'entrée. La position de la scène quittée est gravée
  /// dans son entrée précédente via replaceState.
  pushScene: (s: SceneId) => void;
  /// Retour arrière « dans l'appli » : history.back() si l'entrée courante a
  /// été poussée par pushScene (on revient donc sur une scène de l'appli),
  /// sinon (arrivée directe sur `/?s=profile`, lien externe…) la scène de
  /// repli — jamais de sortie du site par un bouton « Retour ».
  goBack: (fallback: SceneId) => void;
};

export function useSceneRouter(initialScene: SceneId): SceneRouter {
  const [scene, setScene] = useState<SceneId>(initialScene);
  const [activeMode, setActiveMode] = useState<NavTarget>(() =>
    canonicalModeForScene(initialScene),
  );

  // `isPopstateNavRef` distingue "navigation avant" (pushScene → scroll=0)
  // de "back/forward" (popstate → restaurer la position sauvegardée). Le
  // flag est levé par le handler popstate juste avant setScene, et lu/
  // reset par l'effet de scroll plus bas qui réagit au changement de scène.
  const isPopstateNavRef = useRef(false);

  // Sync back/forward du navigateur : popstate met à jour la scène ET
  // l'activeMode depuis l'URL courante. Sans le sync activeMode, revenir
  // sur la home via le bouton back laisserait l'underline sur l'item
  // précédent (Découvrir, Réviser…) au lieu de glisser vers le logo.
  useEffect(() => {
    function onPop() {
      isPopstateNavRef.current = true;
      const s = new URLSearchParams(window.location.search).get("s");
      const nextScene = isSceneId(s) ? s : "onboarding";
      setScene(nextScene);
      setActiveMode(canonicalModeForScene(nextScene));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Gestion du scroll à chaque changement de scène :
  //  - Navigation avant (pushScene) : scroll en haut. Couvre l'entrée sur
  //    le recap (où on arrivait au milieu de la page après le jeu) et
  //    toutes les autres bascules.
  //  - Back/forward (popstate) : restaure la position sauvegardée dans
  //    l'entrée d'historique (cf. pushScene + replaceState). On attend un
  //    rAF pour laisser React commit + le navigateur layout la nouvelle
  //    scène avant d'appliquer scrollTop, sinon le contenu n'a pas encore
  //    sa hauteur et le scroll est clampé à 0.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPopstateNavRef.current) {
      isPopstateNavRef.current = false;
      const target =
        (window.history.state as { scroll?: number } | null)?.scroll ?? 0;
      requestAnimationFrame(() => setScrollTop(target));
      return;
    }
    setScrollTop(0);
  }, [scene]);

  // Titre du document à chaque scène (y compris la première), focus sur le
  // titre de scène à chaque CHANGEMENT (pas au chargement initial : le
  // navigateur part déjà du haut de la page). rAF : laisser la scène
  // peindre ses titres (certaines les rendent après hydratation).
  const isFirstSceneRef = useRef(true);
  /// Titre posé par la page au chargement (metadata Next), rendu aux scènes
  /// sans titre propre (onboarding).
  const initialTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialTitleRef.current === null) initialTitleRef.current = document.title;
    const label = SCENE_TITLES[scene];
    // En partie, QuestionShell (enfant → son effet passe AVANT celui-ci) a
    // déjà titré « Question 2 sur 5 » : on ne l'écrase pas.
    const shellTitled =
      PLAY_SCENES.has(scene) && document.title.startsWith("Question ");
    if (!shellTitled) {
      document.title = label ? `${label} · Mon2027` : initialTitleRef.current;
    }
    if (isFirstSceneRef.current) {
      isFirstSceneRef.current = false;
      return;
    }
    if (PLAY_SCENES.has(scene)) return;
    const raf = requestAnimationFrame(focusSceneHeading);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  const pushScene = useCallback((s: SceneId) => {
    if (typeof window !== "undefined") {
      // Avant de quitter la scène courante, on grave sa position de
      // scroll dans son entrée d'historique. Au back/forward, le popstate
      // pourra la relire via event.state (cf. effet ci-dessus). On
      // préserve les autres clés éventuelles posées par Next.
      const currentScroll = getScrollTop();
      const prevState =
        (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.replaceState(
        { ...prevState, scroll: currentScroll },
        "",
        window.location.href,
      );
    }
    setScene(s);
    if (typeof window === "undefined") return;
    // On utilise window.history.pushState directement (pas router.push) pour
    // éviter une vraie navigation Next.js — AppShell reste monté, son state
    // (activeQuestions, defiInProgress, etc.) survit. La scène est gérée
    // par React state, l'URL n'en est qu'un reflet pour le bouton back.
    //
    // On repart toujours sur le chemin canonique "/" : si on était sur un
    // /q/[slug] cosmétique (game session précédente), on remet le path à
    // la racine pour que les liens partagés restent valides.
    const sp = new URLSearchParams(window.location.search);
    if (s === "onboarding") sp.delete("s");
    else sp.set("s", s);
    const qs = sp.toString();
    const url = qs ? `/?${qs}` : "/";
    // Nouvelle entrée : scroll: 0 (la scène cible commence en haut). Si
    // l'utilisateur scrolle dedans puis pushScene à nouveau, ce 0 sera
    // écrasé par le replaceState ci-dessus au moment du départ. `inApp`
    // marque l'entrée comme poussée par l'appli (cf. goBack).
    window.history.pushState({ scroll: 0, inApp: true }, "", url);
  }, []);

  const goBack = useCallback(
    (fallback: SceneId) => {
      const state = window.history.state as { inApp?: boolean } | null;
      if (state?.inApp) {
        window.history.back();
        return;
      }
      pushScene(fallback);
    },
    [pushScene],
  );

  return {
    scene,
    activeMode,
    setActiveMode,
    setSceneRaw: setScene,
    pushScene,
    goBack,
  };
}
