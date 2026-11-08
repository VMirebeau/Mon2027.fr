"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Onboarding } from "./screens/onboarding";
import { Home, type HomePick } from "./screens/home";
import { Recap } from "./screens/recap";
import { DefiCreate } from "./screens/defi-create";
import { Methode } from "./screens/methode";
import { APropos } from "./screens/apropos";
import { Themes } from "./screens/themes";
import { Favorites } from "./screens/favorites";
import { Review } from "./screens/review";
import { Account } from "./screens/account";
import { Stats } from "./screens/stats";
import { Profile } from "./screens/profile";
import { Rewards } from "./screens/rewards";
import { DefisHistory } from "./screens/defis-history";
import { GameSession } from "./game-session";
import { DefiIntroModal } from "./defi-intro-modal";
import { SceneNav } from "./scene-nav";
import { BottomTabBar } from "./bottom-tab-bar";
import { useRegisterRewardsNav } from "./gamification-provider";
import { HomeHeader } from "./home/header";

import { OnboardingDT } from "./desktop/onboarding-dt";
import { HomeDT } from "./desktop/home-dt";
import { RecapDT } from "./desktop/recap-dt";
import { DefiCreateDT } from "./desktop/defi-create-dt";
import { MethodeDT } from "./desktop/methode-dt";
import { AProposDT } from "./desktop/apropos-dt";
import { ThemesDT } from "./desktop/themes-dt";
import { FavoritesDT } from "./desktop/favorites-dt";
import { ReviewDT } from "./desktop/review-dt";
import { AccountDT } from "./desktop/account-dt";
import { StatsDT } from "./desktop/stats-dt";
import { ProfileDT } from "./desktop/profile-dt";
import { RewardsDT } from "./desktop/rewards-dt";
import { DefisHistoryDT } from "./desktop/defis-history-dt";
import {
  ActiveModeProvider,
  AppNav,
  CurrentQuestionProvider,
  NavPaperProvider,
} from "./desktop/app-nav";

import { useIsDesktop } from "@/lib/use-is-desktop";
import { useProgress } from "@/lib/use-progress";
import { UnseenDefisProvider } from "@/lib/use-unseen-defis";
import { pickRandomByLevel } from "@/lib/pick-random";
import { computeLevel, computeXp } from "@/lib/gamification";
// answeredCount / daysToVote ne sont plus consommés ici : la nouvelle Home
// lit useProgress() directement (cf. home-bits + screens/home / desktop/home-dt).
import type {
  Answer,
  NavTarget,
  Question,
  SceneId,
  Theme,
} from "@/lib/types";
// Helpers + constantes "pures" extraits dans app-shell/helpers.ts pour
// alléger ce fichier. Toute logique qui ne dépend pas du state React vit
// là-bas (VALID_SCENES, isSceneId, canonicalModeForScene, sceneToSoloQuestion,
// synthAnswers, SCENES_WITHOUT_BAR).
import { findQuestionBySlug, slugForQuestion } from "@/lib/question-slug";
import {
  clearActiveSession,
  loadActiveSession,
  resolveActiveSession,
  saveActiveSession,
} from "@/lib/active-session";
import {
  SCENES_WITHOUT_BAR,
  SCENES_WITH_HOME_HEADER,
  initialSceneFor,
  sceneToSoloQuestion,
  synthAnswers,
} from "./app-shell/helpers";
import { useSceneRouter } from "./app-shell/use-scene-router";
import { useDevDemos } from "./app-shell/use-dev-demos";

export type AppShellContent = {
  questions: Question[];
  themes: Theme[];
  totalQuestions: number;
  totalOrgs: number;
  /// Sources citées par les questions publiées (calcul serveur, cf.
  /// HomeContent.totalSources) : chiffre unique affiché par Méthode et
  /// Découvrir.
  totalSources: number;
  dailyQuestion: Question | null;
  /** Samples Q-TST-* (brouillons) chargés pour le mode dev `?dev=1`.
   *  Non utilisés en mode jeu standard. */
  devSamples?: Question[];
};


export function AppShell({ content }: { content: AppShellContent }) {
  const {
    questions,
    themes,
    totalQuestions,
    totalOrgs,
    totalSources,
    dailyQuestion,
  } = content;
  // Memoize sur `content.devSamples` plutôt que recréer un `[]` à chaque render :
  // sinon la nouvelle référence invalide tous les useMemo dépendant de devSamples,
  // donc tous les `*Demo` recalculent à chaque render (effet de bord caché par
  // les eslint-disable react-hooks/exhaustive-deps).
  const devSamples = useMemo(
    () => content.devSamples ?? [],
    [content.devSamples],
  );

  const searchParams = useSearchParams();
  // La scène est tirée du `?s=` au mount UNIQUEMENT (initial state). Ensuite
  // on la pilote en pur React state via pushScene/popstate, sans repasser par
  // useSearchParams. Pourquoi : pendant le jeu, on veut pouvoir refléter la
  // question courante dans la barre d'URL via history.replaceState ; si la
  // scène était dérivée de useSearchParams, chaque changement de query
  // déclencherait un re-render et nous ferait perdre le contexte du jeu.
  const initialSceneParam = searchParams.get("s");
  /// `?qs=slug1,slug2,...` : permet à un lien partagé (depuis le récap) de
  /// faire rejouer une session entière. Au mount, on résout les slugs en
  /// `Question[]` et on bascule directement dans la scène "game". Si aucun
  /// slug ne match (catalogue mis à jour côté admin entre-temps), on
  /// retombe sur le flux normal (initialScene). Cf. SessionShareModal.
  const initialQsParam = searchParams.get("qs");
  const initialReplaySession = (() => {
    if (!initialQsParam) return null;
    const slugs = initialQsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (slugs.length === 0) return null;
    const resolved: Question[] = [];
    for (const s of slugs) {
      const q = findQuestionBySlug(questions, s);
      if (q) resolved.push(q);
    }
    return resolved.length > 0 ? resolved : null;
  })();

  /// Reprise de session après reload (cf. lib/active-session). On ne tente la
  /// restauration que si :
  ///   - on n'est pas déjà en replay `?qs=` (lien partagé → il gagne)
  ///   - on atterrit sur `?s=game` : soit l'URL cosmétique du jeu après un
  ///     reload (la route `/q/[slug]` redirige vers `/?s=game` quand son slug
  ///     est la question en cours), soit un back-forward vers le jeu.
  /// Si un slug ne résout plus (catalogue changé côté admin), on abandonne :
  /// la session est purgée et on atterrit sur l'accueil (cf. effet plus bas
  /// et resolveActiveSession). Jamais de partie sur tout le catalogue.
  const restoredSession = (() => {
    if (initialReplaySession) return null;
    if (initialSceneParam !== "game") return null;
    const saved = loadActiveSession();
    if (!saved) return null;
    const resolved = resolveActiveSession(saved, questions);
    return resolved ? { saved, ...resolved } : null;
  })();

  const initialScene: SceneId = initialSceneFor(
    initialSceneParam,
    Boolean(initialReplaySession || restoredSession),
  );

  // Hook qui possède : scene, activeMode, popstate sync, scroll restoration,
  // pushScene (history.pushState + URL update). Cf. ./app-shell/use-scene-router.
  const {
    scene,
    activeMode,
    setActiveMode,
    setSceneRaw: setScene,
    pushScene,
    goBack,
  } = useSceneRouter(initialScene);

  // Si on entre en mode "replay session" (?qs=…), on nettoie l'URL au mount
  // pour ne plus garder `qs=` (sinon un refresh ou un back-forward
  // re-déclencherait la session). On bascule sur `?s=game` cosmétique, comme
  // pour les autres entrées dans la scène game.
  useEffect(() => {
    if (!initialReplaySession) return;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    sp.delete("qs");
    sp.set("s", "game");
    window.history.replaceState(null, "", `/?${sp.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reprise de session : la scène game n'a pas de mode de nav canonique
  // (canonicalModeForScene → "daily"). On restaure donc l'item nav surligné
  // (Découvrir pour une série/thème, Défier pour un défi) depuis la session
  // sauvegardée, une seule fois au montage.
  useEffect(() => {
    if (restoredSession) setActiveMode(restoredSession.saved.activeMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `?s=game` sans partie reprenable (session absente, illisible ou dont une
  // question a disparu du catalogue) : initialSceneFor a déjà basculé sur
  // l'accueil. On purge la session orpheline — sinon /q/[slug] continuerait
  // de rediriger vers une reprise impossible — et on aligne l'URL pour qu'un
  // reload ou un retour arrière ne retombe pas sur `?s=game`.
  useEffect(() => {
    if (initialSceneParam !== "game") return;
    if (initialReplaySession || restoredSession) return;
    clearActiveSession();
    const sp = new URLSearchParams(window.location.search);
    sp.set("s", "home");
    window.history.replaceState(window.history.state, "", `/?${sp.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast-path local pour le clic sur une toast de badge : tant qu'AppShell
  // est monté (utilisateur sur la route `/`), on bascule la scène en pur
  // state plutôt que de passer par `router.push("/?s=rewards")` (qui
  // démonterait AppShell et lui ferait perdre son state — activeQuestions,
  // defiInProgress, etc.). Sur les routes standalone (/q, /d), ce hook
  // n'est pas monté et `GamificationProvider` retombe sur le router.push.
  useRegisterRewardsNav(() => {
    setActiveMode("rewards");
    setScene("rewards");
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      sp.set("s", "rewards");
      window.history.pushState({ scroll: 0 }, "", `/?${sp.toString()}`);
    }
  });

  const [activeQuestions, setActiveQuestions] = useState<Question[]>(
    restoredSession?.questions ?? initialReplaySession ?? questions,
  );
  const [gameAnswers, setGameAnswers] = useState<Answer[] | null>(null);
  /// Vrai juste après la question du jour : la page Découvrir sur laquelle on
  /// atterrit met alors en avant « enchaîne avec 5 questions » au lieu de
  /// présenter un menu neutre. Remis à false à toute navigation ou partie.
  const [continueAfterDaily, setContinueAfterDaily] = useState(false);

  /// Graine de reprise consommée par le GameSession de la scène game (initialIdx
  /// + initialAnswers). Non-null uniquement au montage quand on restaure une
  /// session ; remis à null dès qu'une NOUVELLE partie démarre (startGame /
  /// startDefiGame) ou que la session restaurée se termine, pour ne pas
  /// re-semer les parties suivantes. GameSession remonte à chaque entrée dans
  /// la scène game, donc il relit cette graine (null = départ normal à 0).
  const [pendingResume, setPendingResume] = useState<{
    idx: number;
    answers: Answer[];
  } | null>(
    restoredSession
      ? { idx: restoredSession.idx, answers: restoredSession.saved.answers }
      : null,
  );
  // Dérivé directement de l'URL — pas besoin de useState : useSearchParams
  // déclenche un re-render au changement de query, donc `devOpen` reflète
  // toujours la valeur courante sans qu'on synchronise via useEffect.
  const devOpen = searchParams.get("dev") === "1";

  // Création de défi en cours : conservée hors de DefiCreate (qui démonte
  // pendant le jeu). Quand non-null, l'utilisateur est dans le flow Défier ;
  // le scene game's onDone branche vers Challenge (au lieu de Recap), et
  // DefiCreate, en se remontant, voit `answers` et passe direct au partage.
  type DefiInProgress = {
    source: "theme" | "favoris";
    themeId: string | null;
    picked: Question[];
    answers: Answer[] | null;
  };
  const [defiInProgress, setDefiInProgress] = useState<DefiInProgress | null>(
    // Reprise d'un défi en cours : on reconstruit le contexte depuis la session
    // sauvegardée (picked = questions résolues, answers null car on re-joue
    // depuis l'index courant ; les réponses déjà données vivent dans le state
    // du jeu via pendingResume).
    restoredSession?.saved.defi
      ? {
          source: restoredSession.saved.defi.source,
          themeId: restoredSession.saved.defi.themeId,
          picked: restoredSession.questions,
          answers: null,
        }
      : null,
  );

  // Modal d'accueil du défi « Sur un thème » : true tant que le militant n'a
  // pas validé l'explication des règles. On retient le montage de GameSession
  // tant qu'elle est pending — sinon le chrono 30s (ancré au montage de la
  // partie) tournerait pendant la lecture. Voir DefiIntroModal.
  const [defiIntroPending, setDefiIntroPending] = useState(false);

  /// Persiste l'état du jeu en cours dans localStorage pour permettre la
  /// reprise après reload (cf. lib/active-session). Branché sur
  /// GameSession.onProgress → appelé au montage puis à chaque changement
  /// d'index / de réponses. On NE persiste QUE les sessions multi-questions
  /// (série / thème / défi) : la question du jour (1 question) n'a pas de
  /// reprise utile. Stable via useCallback pour ne pas re-déclencher l'effet
  /// onProgress à chaque render.
  const persistActiveSession = useCallback(
    (idx: number, answers: Answer[]) => {
      if (activeQuestions.length <= 1) return;
      saveActiveSession({
        mode: defiInProgress ? "challenge" : "series",
        slugs: activeQuestions.map((q) => slugForQuestion(q)),
        idx,
        answers,
        activeMode,
        defi: defiInProgress
          ? {
              source: defiInProgress.source,
              themeId: defiInProgress.themeId,
            }
          : undefined,
      });
    },
    [activeQuestions, defiInProgress, activeMode],
  );

  // Quand le user entre dans le flow Défier depuis un raccourci spécifique
  // (ex: "Défier sur mes favoris" depuis la page Favoris), on saute A1 et
  // on atterrit directement sur l'étape adéquate du wizard. null = entrée
  // classique, A1.
  const [defiStartAt, setDefiStartAt] = useState<"a1" | "a2" | "a2bis" | null>(
    null,
  );
  const isDesktop = useIsDesktop();
  const { progress: userProgress, hydrated: progressHydrated } = useProgress();

  /// Rang de niveau (1..10) pour pondérer la difficulté des tirages.
  /// Avant hydratation : 5 (centré, comportement neutre) pour éviter
  /// un mismatch SSR/CSR sur la première render.
  const levelRank = useMemo(
    () =>
      progressHydrated
        ? computeLevel(computeXp(userProgress)).current.rank
        : 5,
    [userProgress, progressHydrated],
  );

  // Enrichissement client-side : on calcule pour chaque thème combien de
  // questions ont déjà été répondues localement, en croisant la liste
  // des questions publiées (qui porte `q.theme === Theme.label`) avec
  // `userProgress.answers` (clés = question.id). Avant hydratation, on
  // expose 0 partout pour matcher le SSR. Les composants présentent la
  // mini-barre à partir de `Theme.answered` ; la valeur reste agrégée
  // ici, pas de useProgress dans chaque carte.
  const themesWithProgress = useMemo<Theme[]>(() => {
    const byThemeLabel: Record<string, number> = {};
    if (progressHydrated) {
      for (const q of questions) {
        if (userProgress.answers[q.id]) {
          byThemeLabel[q.theme] = (byThemeLabel[q.theme] ?? 0) + 1;
        }
      }
    }
    return themes.map((t) => ({
      ...t,
      answered: Math.min(byThemeLabel[t.label] ?? 0, t.count),
    }));
  }, [themes, questions, userProgress.answers, progressHydrated]);

  const demos = useDevDemos(questions, devSamples);

  function goScene(s: SceneId) {
    if (s === "recap" || s === "challenge") {
      if (!gameAnswers) setGameAnswers(synthAnswers(activeQuestions));
    }
    pushScene(s);
  }

  function startGame(picked: Question[]) {
    if (picked.length === 0) return;
    setContinueAfterDaily(false);
    // Nouvelle partie : on abandonne toute session précédemment sauvegardée et
    // on annule une éventuelle graine de reprise (sinon la nouvelle partie
    // hériterait de l'index/réponses restaurés). Le 1er onProgress re-persiste
    // si la session est multi-questions.
    clearActiveSession();
    setPendingResume(null);
    setActiveQuestions(picked);
    setGameAnswers(null);
    pushScene("game");
  }

  function onPick(mode: HomePick) {
    if (mode === "daily" || mode === "daily-review") {
      // `daily-review` distingue intentionnellement le clic depuis le hero
      // variant "review" : aujourd'hui les deux relancent la question, mais
      // quand l'écran "Voir l'explication" sera prêt, il s'embranche ici
      // sans changer l'API de la home.
      setActiveMode("daily");
      if (dailyQuestion) startGame([dailyQuestion]);
      return;
    }
    if (mode === "discover") {
      // Architecture cible : Découvrir = "5 mélangées | par thème". La page
      // dédiée arrivera dans un autre lot ; pour l'instant on route vers la
      // page Thèmes qui contient déjà la sélection par thème.
      setActiveMode("themes");
      pushScene("themes");
      return;
    }
    if (mode === "review") {
      setActiveMode("review");
      pushScene("review");
      return;
    }
    if (mode === "challenge-pending") {
      // Nouveau flow : A1 (source) → A2 (thème) → JEU réel (5 questions
      // avec reveals) → Partage. Le militant joue vraiment ses
      // questions avant d'avoir le short code — son score lock-in
      // correspond à ce qu'il a effectivement répondu (anti-bluff).
      // On reset toujours le defiInProgress en arrivant depuis la home
      // pour démarrer le wizard à neuf.
      setActiveMode("challenge");
      setDefiInProgress(null);
      setDefiStartAt(null);
      pushScene("challenge");
      return;
    }
  }

  /// Entrée raccourcie dans le flow Défier depuis la page Favoris :
  /// saute A1 (source) et atterrit direct sur A2bis (multi-select favoris).
  function startDefiFromFavorites() {
    setActiveMode("challenge");
    setDefiInProgress(null);
    setDefiStartAt("a2bis");
    pushScene("challenge");
  }

  /** Appelée par DefiCreate quand A2 valide la sélection des 5 questions.
   *  Active le contexte defi, met activeQuestions sur le tirage, et bascule
   *  sur la scène game. La scène game's onDone branche vers Challenge dans
   *  ce contexte (cf. la modif du onDone plus bas). */
  function startDefiGame(
    source: "theme" | "favoris",
    themeId: string | null,
    picked: Question[],
  ) {
    if (picked.length === 0) return;
    // Nouvelle partie défi : on repart d'une session propre (cf. startGame).
    clearActiveSession();
    setPendingResume(null);
    setActiveMode("challenge");
    setDefiInProgress({ source, themeId, picked, answers: null });
    setActiveQuestions(picked);
    setGameAnswers(null);
    // Défi par thème : on affiche d'abord la modal d'explication. En favoris,
    // le militant a choisi ses questions lui-même → pas besoin d'expliquer.
    setDefiIntroPending(source === "theme");
    pushScene("game");
  }

  /// Set des questionIds déjà répondues — base du "prioriser les non-vues".
  /// Recalculé seulement quand la map answers change, pas à chaque render.
  const answeredQuestionIds = useMemo(
    () => new Set(Object.keys(userProgress.answers)),
    [userProgress.answers],
  );

  function pickTheme(themeId: string) {
    setActiveMode("themes");
    const theme = themes.find((t) => t.id === themeId);
    if (!theme || theme.count === 0) return;
    const subset = questions.filter((q) => q.theme === theme.label);
    // Non-répondues d'abord, pondération par difficulté selon le niveau.
    const ordered = pickRandomByLevel(
      subset,
      subset.length,
      (q) => answeredQuestionIds.has(q.id),
      (q) => q.difficulte ?? 3,
      levelRank,
    );
    startGame(ordered);
  }

  /// Partie rapide : tire 5 questions au hasard, en priorisant celles
  /// auxquelles l'utilisateur n'a pas encore répondu. On ne retombe sur des
  /// questions déjà vues que si le pool de neuves est épuisé. Pondération
  /// par difficulté en fonction du niveau gamification — l'algo sert
  /// progressivement des questions plus dures à mesure que le joueur monte
  /// de niveau (cf. pickRandomByLevel).
  function playRandomFive() {
    if (questions.length === 0) return;
    setActiveMode("themes");
    startGame(
      pickRandomByLevel(
        questions,
        5,
        (q) => answeredQuestionIds.has(q.id),
        (q) => q.difficulte ?? 3,
        levelRank,
      ),
    );
  }

  /// « Commencer » de l'onboarding : la promesse affichée est « 5 questions,
  /// 3 minutes », on lance donc directement une partie de 5 questions
  /// mélangées au lieu d'un menu intermédiaire. Catalogue vide (base de dev
  /// fraîche) : on retombe sur l'accueil.
  function startFromOnboarding() {
    if (questions.length === 0) {
      pushScene("home");
      return;
    }
    playRandomFive();
  }

  function navTo(target: NavTarget) {
    setContinueAfterDaily(false);
    if (target === "home") {
      // Logo "Mon2027" devient l'item actif sur la home — l'underline magic
      // indicator glisse depuis l'item précédent vers le logo.
      setActiveMode("home");
      pushScene("home");
      return;
    }
    if (target === "daily") {
      setActiveMode("daily");
      if (dailyQuestion) startGame([dailyQuestion]);
      else pushScene("home");
      return;
    }
    if (target === "review") {
      setActiveMode("review");
      pushScene("review");
      return;
    }
    if (target === "challenge") {
      // Reset le contexte defi-en-cours pour démarrer un wizard frais
      // depuis n'importe quelle page.
      setActiveMode("challenge");
      setDefiInProgress(null);
      pushScene("challenge");
      return;
    }
    if (target === "themes") {
      setActiveMode("themes");
      pushScene("themes");
      return;
    }
    if (target === "favorites") {
      // Favoris n'est pas un mode primaire (pas dans les 4 verbes), donc
      // aucun item du nav ne sera souligné sur cette page. L'icône ★ du
      // cluster droit sert d'indicateur visuel.
      setActiveMode("favorites");
      pushScene("favorites");
      return;
    }
    if (target === "rewards") {
      // Récompenses : accessible via UserMenu et toast d'unlock. Pas dans
      // le top-nav primaire, donc aucun item ne sera souligné.
      setActiveMode("rewards");
      pushScene("rewards");
      return;
    }
    if (target === "defis-history") {
      // Historique défis : on garde l'underline sur "Défier" — la page
      // est dans la même section que la création (accès via "Voir plus →").
      setActiveMode("challenge");
      pushScene("defis-history");
      return;
    }
    // methode / apropos : retirent l'underline du nav principal (ces cibles
    // n'apparaissent pas dans les items, donc aucun item ne match).
    setActiveMode(target);
    pushScene(target);
  }

  const homeProps = {
    onPick,
    onNavigate: navTo,
    themes: themesWithProgress,
    totalQuestions,
    totalOrgs,
    dailyQuestion,
    questions,
  };

  // ============================ GAME / SOLO =============================
  // Hôte stable, hors du branchement desktop/mobile : flipper le breakpoint
  // pendant une partie ne casse plus l'état (idx, answers, phase, timers).
  // GameSession choisit en interne le runner DT ou mobile via useIsDesktop.
  //
  // Le `body` du jeu est résolu plus bas (par scène) puis posé dans le
  // shell unifié en fin de fonction, qui rend une AppNav persistante au-
  // dessus. GameSession ne rend volontairement plus d'AppNav lui-même
  // (séparation des responsabilités : il owne l'état, pas le chrome).

  // Scenes individuelles d'un format (q-estim, q-tf, q-ab, q-classement,
  // q-vftf-multi, q-curseur-multi, q-cat, q-pondere) : on instancie le
  // vrai runner avec une seule question, pour montrer le vrai cycle
  // ask → reveal in-place (DossierPanel).
  const soloQ = sceneToSoloQuestion(scene, demos);

  // ============================ SCÈNES (mobile + desktop) =============================
  //
  // Table unique : pour chaque scène, on construit en parallèle la vue
  // mobile et la vue desktop. La sélection finale dépend de `isDesktop`
  // mais TOUTES les paires sont visibles au même endroit, ce qui facilite
  // la maintenance (ajouter une scène = une seule modification, et le
  // diff mobile vs desktop saute aux yeux).
  //
  // Les callbacks (onHome / onNavigate / pushScene) ne sont pas memoïsés :
  // chaque render recrée les arrows, mais les composants enfants sont
  // déjà mémoïsés là où ça compte (cf. Home, Themes, Review).
  const homeBack = () => pushScene("home");
  /// Variantes contextuelles : la nav doit refléter d'où vient le jeu.
  /// Sans ça, depuis Réviser ou Favoris, le runner highlight "Question du
  /// jour" par défaut, ce qui désoriente.
  const playFromReview = (q: Question) => {
    setActiveMode("review");
    startGame([q]);
  };
  const playFromFavorites = (q: Question) => {
    setActiveMode("favorites");
    startGame([q]);
  };
  const onDefiHome = () => {
    setDefiInProgress(null);
    setDefiStartAt(null);
    pushScene("home");
  };
  const onDefiSent = () => {
    setDefiInProgress(null);
    setDefiStartAt(null);
  };
  const defiGameResult = defiInProgress?.answers
    ? {
        source: defiInProgress.source,
        themeId: defiInProgress.themeId,
        picked: defiInProgress.picked,
        answers: defiInProgress.answers,
      }
    : null;
  const recapAnswers =
    gameAnswers ?? (devOpen ? synthAnswers(activeQuestions) : []);

  const sceneMap: Record<SceneId, { mobile: React.ReactNode; desktop: React.ReactNode }> = {
    onboarding: {
      mobile: (
        <Onboarding
          onStart={startFromOnboarding}
          onShowMethode={() => pushScene("methode")}
          onLogin={() => {
            // Pré-injecte ?tab=login dans l'URL : pushScene préserve les autres
            // search params, donc AccountBody démarrera sur l'onglet Connexion
            // plutôt que Créer un compte (cf. account.tsx). Évite à l'utilisateur
            // déjà inscrit de devoir trouver puis cliquer l'onglet.
            if (typeof window !== "undefined") {
              const sp = new URLSearchParams(window.location.search);
              sp.set("tab", "login");
              window.history.replaceState(
                window.history.state,
                "",
                `/?${sp.toString()}`,
              );
            }
            navTo("account");
          }}
        />
      ),
      desktop: (
        <OnboardingDT onStart={startFromOnboarding} onNavigate={navTo} />
      ),
    },
    home: {
      mobile: <Home {...homeProps} />,
      desktop: <HomeDT {...homeProps} onNavigate={navTo} />,
    },
    themes: {
      mobile: (
        <Themes
          themes={themesWithProgress}
          totalQuestions={totalQuestions}
          totalSources={totalSources}
          afterDaily={continueAfterDaily}
          onPickTheme={pickTheme}
          onShuffle={playRandomFive}
          onNavigate={navTo}
          questions={questions}
          onPickQuestion={(q) => startGame([q])}
        />
      ),
      desktop: (
        <ThemesDT
          themes={themesWithProgress}
          totalQuestions={totalQuestions}
          totalSources={totalSources}
          afterDaily={continueAfterDaily}
          onPickTheme={pickTheme}
          onShuffle={playRandomFive}
          onNavigate={navTo}
          questions={questions}
          onPickQuestion={(q) => startGame([q])}
        />
      ),
    },
    favorites: {
      mobile: (
        <Favorites
          questions={questions}
          onPlay={playFromFavorites}
          onDefiFromFavorites={startDefiFromFavorites}
          onHome={homeBack}
          onNavigate={navTo}
        />
      ),
      desktop: (
        <FavoritesDT
          questions={questions}
          onPlay={playFromFavorites}
          onDefiFromFavorites={startDefiFromFavorites}
          onNavigate={navTo}
        />
      ),
    },
    account: {
      mobile: <Account onHome={homeBack} onNavigate={navTo} />,
      desktop: <AccountDT onNavigate={navTo} />,
    },
    stats: {
      mobile: (
        <Stats
          questions={questions}
          themes={themesWithProgress}
          onHome={homeBack}
          onNavigate={navTo}
        />
      ),
      desktop: (
        <StatsDT
          questions={questions}
          themes={themesWithProgress}
          onNavigate={navTo}
        />
      ),
    },
    profile: {
      mobile: (
        <Profile
          questions={questions}
          themes={themesWithProgress}
          onBack={() => goBack("home")}
          onNavigate={navTo}
        />
      ),
      desktop: (
        <ProfileDT
          questions={questions}
          themes={themesWithProgress}
          onNavigate={navTo}
        />
      ),
    },
    rewards: {
      mobile: (
        <Rewards
          questions={questions}
          themes={themesWithProgress}
          onHome={homeBack}
          onNavigate={navTo}
        />
      ),
      desktop: (
        <RewardsDT
          questions={questions}
          themes={themesWithProgress}
          onNavigate={navTo}
        />
      ),
    },
    "defis-history": {
      mobile: (
        <DefisHistory
          themes={themesWithProgress}
          onHome={() => navTo("challenge")}
          onNavigate={navTo}
        />
      ),
      desktop: (
        <DefisHistoryDT themes={themesWithProgress} onNavigate={navTo} />
      ),
    },
    review: {
      mobile: <Review questions={questions} onPlay={playFromReview} onNavigate={navTo} />,
      desktop: <ReviewDT questions={questions} onPlay={playFromReview} onNavigate={navTo} />,
    },
    methode: {
      mobile: <Methode onHome={homeBack} totalSources={totalSources} />,
      desktop: <MethodeDT onNavigate={navTo} totalSources={totalSources} />,
    },
    apropos: {
      mobile: <APropos onHome={homeBack} />,
      desktop: <AProposDT onNavigate={navTo} />,
    },
    recap: {
      mobile: (
        <Recap
          questions={activeQuestions}
          answers={recapAnswers}
          onRestart={() => pushScene("game")}
          onChallenge={() => pushScene("challenge")}
          onHome={homeBack}
          onNavigate={navTo}
        />
      ),
      desktop: (
        <RecapDT
          questions={activeQuestions}
          answers={recapAnswers}
          onRestart={() => pushScene("game")}
          onChallenge={() => pushScene("challenge")}
          onNavigate={navTo}
        />
      ),
    },
    challenge: {
      mobile: (
        <DefiCreate
          questions={questions}
          themes={themesWithProgress}
          onHome={onDefiHome}
          onStartGame={startDefiGame}
          gameResult={defiGameResult}
          onSent={onDefiSent}
          startAt={defiStartAt ?? undefined}
          onNavigate={navTo}
          levelRank={levelRank}
        />
      ),
      desktop: (
        <DefiCreateDT
          questions={questions}
          themes={themesWithProgress}
          onHome={onDefiHome}
          onStartGame={startDefiGame}
          onNavigate={navTo}
          gameResult={defiGameResult}
          onSent={onDefiSent}
          startAt={defiStartAt ?? undefined}
          levelRank={levelRank}
        />
      ),
    },
    // Les scenes pilotées plus haut (game + solo formats) ne passent pas par
    // sceneMap — on les neutralise ici pour satisfaire le Record exhaustif.
    game: { mobile: null, desktop: null },
    "q-estim": { mobile: null, desktop: null },
    "q-tf": { mobile: null, desktop: null },
    "q-ab": { mobile: null, desktop: null },
    "q-qcm": { mobile: null, desktop: null },
    "q-classement": { mobile: null, desktop: null },
    "q-vftf-multi": { mobile: null, desktop: null },
    "q-curseur-multi": { mobile: null, desktop: null },
    "q-cat": { mobile: null, desktop: null },
    "q-pondere": { mobile: null, desktop: null },
  };

  // ============================ BODY SELECTION =============================
  // Sélection du body de la scène en cours. Les scènes game + solo
  // produisent leur propre body (GameSession) ; les autres scènes passent
  // par sceneMap. Le body est ensuite posé dans le shell unifié plus bas,
  // qui rend une seule AppNav persistante en desktop (correctif underline :
  // sans persistance, l'AppNav démontait à chaque navigation et le
  // motion.layoutId perdait ses repères).
  const isImmersive = scene === "game" || soloQ !== null;
  let body: React.ReactNode;
  if (scene === "game" && defiIntroPending) {
    // Intro du défi par thème : on remplace GameSession par la modal le temps
    // que le militant valide les règles. GameSession (et donc le chrono) ne se
    // monte qu'au clic sur « C'est parti ».
    const introThemeLabel =
      themes.find((t) => t.id === defiInProgress?.themeId)?.label ?? null;
    body = (
      // Pas de className `app-shell` ici : cette classe est `display:none`
      // au-dessus de 768px (coquille mobile only), ce qui masquerait la modal
      // sur desktop. Un simple div plein écran suffit — le backdrop de la modal
      // est `position:fixed`, donc ce conteneur ne sert que de fond.
      <div style={{ minHeight: "100dvh", background: "var(--cream)" }}>
        <DefiIntroModal
          themeLabel={introThemeLabel}
          onStart={() => setDefiIntroPending(false)}
          onCancel={() => {
            // Abandon : on défait le contexte défi et on revient au choix du
            // thème (scène challenge → wizard DefiCreate forcé sur l'étape a2).
            setDefiIntroPending(false);
            setDefiInProgress(null);
            setDefiStartAt("a2");
            pushScene("challenge");
          }}
        />
      </div>
    );
  } else if (scene === "game") {
    body = (
      <GameSession
        // Contexte défi : la barre d'action du reveal masque le « Partager »
        // par-question et nomme le bouton final « Partager le défi » (il mène à
        // l'écran de création/partage, pas à un récap).
        defi={defiInProgress !== null}
        questions={activeQuestions}
        // Reprise après reload : graine d'index/réponses (null = départ à 0) et
        // persistance continue via onProgress. Cf. lib/active-session.
        initialIdx={pendingResume?.idx}
        initialAnswers={pendingResume?.answers}
        onProgress={persistActiveSession}
        onDone={(answers) => {
          // La session est finie (ou abandonnée via Terminer) : plus rien à
          // reprendre. On purge la session sauvegardée et la graine de reprise.
          clearActiveSession();
          setPendingResume(null);
          // En contexte création de défi, on n'ouvre pas le recap classique :
          // on bascule l'utilisateur sur l'écran de partage, qui consomme
          // les réponses qu'il vient de jouer pour les serrer dans le défi.
          if (defiInProgress) {
            setDefiInProgress({ ...defiInProgress, answers });
            setGameAnswers(answers);
            pushScene("challenge");
            return;
          }
          setGameAnswers(answers);
          // Aucune réponse de la session : l'utilisateur a juste fermé
          // sans jouer. On le renvoie à la home sans passer par le
          // récap (qui n'aurait rien à afficher). Couple avec
          // QuestionShell qui skip la modal de confirmation dans ce
          // cas (cf. `hasAnyAnswer`) — la × du chrome ferme direct.
          if (answers.every((a) => a === null)) {
            pushScene("home");
            return;
          }
          // Session à 1 seule question (typiquement "Question du jour" lancée
          // depuis la home) : un récap d'1 réponse n'apporte rien — la
          // question vient juste d'être révélée en détail, l'utilisateur a
          // tout vu. On l'envoie sur Découvrir pour qu'il enchaîne
          // naturellement. Le récap reste utile pour les sessions multi-
          // questions (défis, séries thématiques).
          //
          // `setActiveMode` doit suivre : pushScene seul ne touche pas
          // l'underline du nav (decoupling intentionnel ailleurs — ex. on
          // garde "Question du jour" surligné pendant qu'on joue). Sans ce
          // sync, l'utilisateur arriverait sur la page Découvrir avec le
          // soulignement encore sur "Question du jour".
          if (answers.length <= 1) {
            // Après la question du jour, Découvrir s'ouvre sur l'invitation
            // à enchaîner (5 questions mélangées) plutôt que sur un menu.
            setContinueAfterDaily(activeMode === "daily");
            setActiveMode("themes");
            pushScene("themes");
            return;
          }
          pushScene("recap");
        }}
      />
    );
  } else if (soloQ) {
    body = (
      <GameSession
        key={`solo-${scene}-${soloQ.id}`}
        questions={[soloQ]}
        onDone={() => pushScene("home")}
      />
    );
  } else {
    const entry = sceneMap[scene];
    body = isDesktop ? entry.desktop : entry.mobile;
  }

  // Mobile : on affiche la bottom tab bar sur les écrans exploratoires.
  // Hide-list : scènes "immersives" (jeu, recap, onboarding linéaire) où la
  // barre serait du bruit. Les pages standalone /q et /d ne passent jamais
  // par AppShell donc rien à faire pour elles.
  const showBar = !SCENES_WITHOUT_BAR.has(scene);

  // HomeHeader (logo + UserMenu) rendu une seule fois ici pour les scènes
  // "tab principal" — il survit aux changements de scène, donc le dropdown
  // UserMenu ne perd pas son état si l'utilisateur navigue pendant qu'il
  // est ouvert, et plus de re-mount visuel à chaque page. Les autres scènes
  // (wizard défi, onboarding, méthode, etc.) gardent leur propre header
  // contextuel. Cf. SCENES_WITH_HOME_HEADER dans app-shell/helpers.ts.
  const showHomeHeader = !isImmersive && SCENES_WITH_HOME_HEADER.has(scene);

  return (
    <ActiveModeProvider value={activeMode}>
      <NavPaperProvider>
        <CurrentQuestionProvider>
        <UnseenDefisProvider>
        {/* AppNav persistante : monte une seule fois et survit aux
            changements de scène. Hidden via CSS sur mobile (cf. globals.css
            `@media (max-width: 767.9px) .dt-nav { display: none }`). C'est
            cette persistance qui permet à l'underline magic indicator
            (motion.span + layoutId) de glisser entre items au lieu de
            réjouer une animation d'apparition à chaque navigation.
            CurrentQuestionProvider englobe AppNav ET le body : GameSession
            pousse l'id de la question courante via useSetCurrentQuestion,
            et l'AppNav le lit pour afficher l'étoile favori dans son header. */}
        <AppNav onNavigate={navTo} />

        {isDesktop || isImmersive ? (
          body
        ) : (
          <div className={"app-shell" + (showBar ? " with-bottom-bar" : "")}>
            {showHomeHeader ? <HomeHeader onNavigate={navTo} /> : null}
            <div className="page">{body}</div>
          </div>
        )}

        {!isDesktop && showBar && !isImmersive ? (
          <BottomTabBar active={activeMode} onNavigate={navTo} />
        ) : null}

        {devOpen && <SceneNav scene={scene} onScene={goScene} />}
        </UnseenDefisProvider>
        </CurrentQuestionProvider>
      </NavPaperProvider>
    </ActiveModeProvider>
  );
}

