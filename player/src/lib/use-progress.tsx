"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  addReceivedChallenge,
  addSentChallenge,
  DEFAULT_PROGRESS,
  loadProgress,
  markBadgesSeen as markBadgesSeenImpl,
  mergeProgress,
  recordReceivedDefiPlayed as recordReceivedDefiPlayedImpl,
  removeReceivedDefi as removeReceivedDefiImpl,
  PROGRESS_KEY,
  PROGRESS_VERSION,
  recordAnswer as recordAnswerImpl,
  saveProgress,
  setDefisPlayedByOthers as setDefisPlayedByOthersImpl,
  setFavoriteMode as setFavoriteModeImpl,
  setFavoriteTheme as setFavoriteThemeImpl,
  setPseudo as setPseudoImpl,
  toggleFavorite as toggleFavoriteImpl,
  unlockBadges as unlockBadgesImpl,
  type AnswerValue,
  type Prefs,
  type Progress,
  type ReceivedChallenge,
  type SentChallenge,
} from "./progress";
import { useAuth } from "./use-auth";

// ============================ External store ============================
// Source de vérité = localStorage. Tout le reste lit/écrit via ce module,
// jamais directement, pour que `useSyncExternalStore` puisse notifier les
// abonnés à chaque changement (y compris depuis un autre onglet).

type Listener = () => void;
const listeners = new Set<Listener>();
// Snapshot mis en cache : useSyncExternalStore exige qu'à valeur identique,
// la même référence soit retournée (sinon il pense que rien n'a changé
// mais re-render à chaque check, ou pire détecte une mutation infinie).
let cachedSnapshot: Progress | null = null;

function notify() {
  cachedSnapshot = null; // force un re-read au prochain getSnapshot
  for (const fn of listeners) fn();
}

function subscribe(cb: Listener) {
  listeners.add(cb);
  // Sync inter-onglets : un autre onglet modifie le storage → on
  // recharge cet onglet.
  function onStorage(e: StorageEvent) {
    if (e.key === PROGRESS_KEY) notify();
  }
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getClientSnapshot(): Progress {
  if (cachedSnapshot) return cachedSnapshot;
  cachedSnapshot = loadProgress();
  return cachedSnapshot;
}

function getServerSnapshot(): Progress {
  // SSR : on n'a pas accès à localStorage. On renvoie la même référence
  // à chaque appel pour que React ne soupçonne pas une mutation pendant
  // le rendu serveur.
  return DEFAULT_PROGRESS;
}

function updateAndNotify(updater: (p: Progress) => Progress) {
  const current = getClientSnapshot();
  const next = updater(current);
  if (next === current) return;
  saveProgress(next);
  notify();
}

/// Écrase localement avec un objet complet (utilisé après un merge
/// au login). Notifie + sauvegarde, comme updateAndNotify.
function replaceProgress(next: Progress) {
  saveProgress(next);
  notify();
}

/// Compte auquel appartient la progression locale (posé après chaque fusion
/// réussie). Clé séparée de la progression pour ne pas changer son format.
const OWNER_KEY = "mon2027:progress-owner";

function readProgressOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeProgressOwner(userId: string): void {
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* stockage indisponible : on retombe sur le comportement sans propriétaire */
  }
}

// ============================ Context ============================
// On garde un Context pour exposer un hook ergonomique, mais l'état
// lui-même est dans le module-level store ci-dessus. Le Provider sert
// surtout à donner accès aux mutators stables.

type ProgressContextValue = {
  /// État courant (DEFAULT_PROGRESS pendant le SSR et la première
  /// hydratation client, valeur réelle ensuite).
  progress: Progress;
  /// `true` côté client une fois que la lecture localStorage a eu lieu.
  /// Utile pour gater l'affichage de valeurs sensibles (Home greeting).
  hydrated: boolean;
  recordAnswer: (
    questionId: string,
    value: AnswerValue,
    correct: boolean
  ) => void;
  setFavoriteTheme: (themeId: string | null) => void;
  setFavoriteMode: (mode: Prefs["favoriteMode"]) => void;
  setPseudo: (pseudo: string | null) => void;
  addSentChallenge: (challenge: SentChallenge) => void;
  addReceivedChallenge: (challenge: ReceivedChallenge) => void;
  /// Toggle d'un favori — idempotent côté UI : on ne distingue pas add/remove
  /// au point d'appel, le composant FavoriteToggle s'en occupe via isFavorite
  /// pour calculer son visuel.
  toggleFavorite: (questionId: string) => void;
  /// Marque comme débloqués les badges donnés (idempotent — les déjà
  /// présents ne sont pas touchés). Source d'appel : GamificationWatcher.
  unlockBadges: (ids: string[]) => void;
  /// Marque comme "vus" (toast dismissed) les badges donnés.
  markBadgesSeen: (ids: string[]) => void;
  /// Met à jour le compteur des défis joués par des destinataires. Appelé
  /// par GamificationWatcher après fetch /api/me/defis-impact. Monotone
  /// côté implementor (cf. setDefisPlayedByOthersImpl).
  setDefisPlayedByOthers: (count: number) => void;
  /// Enregistre qu'un défi reçu a été joué avec sa méta complète. Appelé
  /// par DefiPlayClient après submit réussi. Idempotent par shortCode.
  recordReceivedDefiPlayed: (entry: ReceivedChallenge) => void;
  /// Retire un défi reçu de l'historique local (soft-delete). Ne touche
  /// pas aux badges déjà obtenus (lifetime counter inchangé).
  removeReceivedDefi: (id: string) => void;
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  // useSyncExternalStore tout seul ne suffit pas à éviter le hydration
  // mismatch : sur le client, getClientSnapshot tourne *dès la première
  // render* d'hydratation et lit localStorage, ce qui contredit le HTML
  // SSR (rendu avec DEFAULT_PROGRESS). On ajoute donc un drapeau
  // `hydrated` qui ne passe à true qu'après le premier commit client,
  // et on retourne DEFAULT_PROGRESS tant qu'il est false. Le résultat :
  // SSR=DEFAULT, hydratation=DEFAULT (match), puis re-render avec la
  // vraie valeur post-effect.
  const liveSnapshot = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );
  const [hydrated, setHydrated] = useState(false);
  // Détection post-hydration identique au pattern useSyncExternalStore :
  // on flip une fois après le premier commit pour activer la lecture
  // localStorage.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  const progress = hydrated ? liveSnapshot : DEFAULT_PROGRESS;

  // ===================== Cloud sync =====================
  // Quand l'utilisateur est connecté, on synchronise la progression
  // avec son snapshot serveur. Deux phases :
  //
  // 1. À l'arrivée d'un user (login ou rebranchement post-refresh),
  //    on tire le snapshot serveur, on le merge avec le local, on
  //    écrit le résultat localement *et* on le pousse au serveur.
  //
  // 2. Une fois mergé, chaque mutation locale déclenche un PUT
  //    debouncé pour pousser le nouvel état au serveur.
  //
  // Si l'utilisateur se déconnecte, on garde les données locales
  // intactes (c'est le mode anonyme par défaut).

  const { user } = useAuth();
  /// Fusion initiale lancée (ou faite) pour ce compte : évite un double
  /// déclenchement. Distinct de `mergedUserRef`, qui n'est posé qu'APRÈS une
  /// fusion réussie et seul autorise les envois (phase 2) — sinon l'état local
  /// non fusionné partait au serveur pendant le GET, voire écrasait le compte
  /// si le GET échouait.
  const lastSyncedUserRef = useRef<string | null>(null);
  const mergedUserRef = useRef<string | null>(null);
  /// Version du snapshot serveur sur laquelle l'état local est basé, renvoyée
  /// à chaque PUT : le serveur refuse (409) si un autre appareil a écrit
  /// entre-temps, au lieu que le dernier écrivain efface l'autre.
  const serverBaseRef = useRef<string | null>(null);

  // Phase 1 : merge à la connexion.
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      lastSyncedUserRef.current = null;
      mergedUserRef.current = null;
      serverBaseRef.current = null;
      return;
    }
    if (lastSyncedUserRef.current === user.id) return;
    // Marque tout de suite pour éviter un re-fire en cas de double
    // render. Si le fetch échoue plus bas, on retentera au prochain
    // changement de user (typiquement un nouveau login).
    lastSyncedUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      try {
        // Parallélise les deux fetchs : snapshot (Progress JSON blob) et
        // defis-played (canal relationnel pour la réconciliation). Avant
        // c'était séquentiel — économise un round-trip de latence.
        const [snapRes, playedRes] = await Promise.all([
          fetch("/api/me/snapshot", { cache: "no-store" }),
          fetch("/api/me/defis-played", { cache: "no-store" }),
        ]);
        if (!snapRes.ok) {
          // 401 (session expirée, useAuth s'en occupe) ou erreur serveur : on
          // n'active PAS l'envoi — mieux vaut ne rien synchroniser que pousser
          // un état local non fusionné. Nouvel essai au prochain chargement.
          lastSyncedUserRef.current = null;
          return;
        }
        const j: { snapshot: { blob: string; updatedAt: string } | null } =
          await snapRes.json();

        // Progression locale produite par un AUTRE compte (ordinateur
        // partagé : A s'est déconnecté, B se connecte) : on ne la fusionne
        // pas dans le compte de B, on repart de la copie serveur de B.
        const owner = readProgressOwner();
        const local =
          owner !== null && owner !== user.id ? DEFAULT_PROGRESS : getClientSnapshot();
        let merged: Progress;
        if (j.snapshot) {
          try {
            const remote = JSON.parse(j.snapshot.blob) as Progress;
            if (remote.version !== PROGRESS_VERSION) {
              // Version distante incompatible : on push notre version
              // locale autoritaire pour rattraper.
              merged = local;
            } else {
              merged = mergeProgress(local, remote);
            }
          } catch {
            // Snapshot corrompu : on l'écrase avec le local.
            merged = local;
          }
        } else {
          merged = local;
        }

        // Le pseudo loggué prend la priorité absolue sur celui du local.
        merged = {
          ...merged,
          identity: { ...merged.identity, pseudo: user.displayPseudo },
        };

        // Réconciliation snapshot ↔ DB : /api/me/defis-played retourne la
        // liste relationnelle (basée sur DefiResponse.amiUserId) ; on insère
        // les défis joués que le snapshot local n'a pas. Couvre le cas
        // "j'ai joué sur un autre device, le snapshot n'a pas (encore) été
        // synchronisé depuis là — le canal relationnel a la donnée, on la
        // ramène dans Progress.challenges.received pour l'UI."
        try {
          if (playedRes.ok && !cancelled) {
            const j: {
              defis: Array<{
                shortCode: string;
                creatorPseudo: string;
                themeLabel: string;
                themeId: string | null;
                title: string | null;
                questionsCount: number;
                myScore: number;
                creatorScore: number;
                playedAt: string;
              }>;
            } = await playedRes.json();
            const existingIds = new Set(
              merged.challenges.received.map((r) => r.id)
            );
            // Sans les défis que le joueur a masqués (sinon ils revenaient
            // à chaque rechargement, cf. Progress.tombstones).
            const hidden = merged.tombstones?.received ?? {};
            const missing: ReceivedChallenge[] = j.defis
              .filter((d) => !existingIds.has(d.shortCode) && hidden[d.shortCode] === undefined)
              .map((d) => ({
                id: d.shortCode,
                from: d.creatorPseudo,
                createdAt: new Date(d.playedAt).getTime(),
                // questionIds inconnus côté endpoint (économise payload) :
                // les consumers (ReceivedDefisList) lisent `total` en
                // priorité, le fallback `questionIds.length` n'est touché
                // que sur les anciens snapshots sans `total`.
                questionIds: [],
                opponentScore: d.creatorScore,
                myScore: d.myScore,
                themeLabel: d.themeLabel,
                themeId: d.themeId,
                title: d.title,
                total: d.questionsCount,
              }));
            if (missing.length > 0) {
              merged = {
                ...merged,
                challenges: {
                  ...merged.challenges,
                  received: [...missing, ...merged.challenges.received].sort(
                    (a, b) => b.createdAt - a.createdAt
                  ),
                },
              };
            }
          }
        } catch {
          // Endpoint indispo / parse fail : on continue avec le snapshot
          // pur. La prochaine connexion retentera.
        }

        if (cancelled) return;
        // Ordre important : on autorise la phase 2 AVANT replaceProgress, qui
        // déclenche son effet ; c'est elle qui renvoie l'état fusionné au
        // serveur, avec la bonne version de base.
        serverBaseRef.current = j.snapshot?.updatedAt ?? null;
        mergedUserRef.current = user.id;
        writeProgressOwner(user.id);
        replaceProgress(merged);
      } catch {
        // Réseau / parse : on retentera à un futur événement de login.
        if (!cancelled) lastSyncedUserRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user]);

  // Phase 2 : envoi debouncé à chaque mutation locale, une fois fusionné.
  const lastPushedRef = useRef<Progress | null>(null);
  useEffect(() => {
    if (!hydrated || !user) return;
    if (mergedUserRef.current !== user.id) return; // pas encore fusionné
    if (lastPushedRef.current === liveSnapshot) return;
    const userId = user.id;
    const snapshot = liveSnapshot;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/me/snapshot", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blob: JSON.stringify(snapshot),
            baseUpdatedAt: serverBaseRef.current,
          }),
        });
        if (mergedUserRef.current !== userId) return; // déconnecté entre-temps
        if (res.ok) {
          const j = (await res.json()) as { updatedAt: string | null };
          serverBaseRef.current = j.updatedAt;
          // Marqué « envoyé » seulement une fois accepté : un échec (413, 5xx,
          // 429, réseau) sera retenté à la prochaine mutation.
          lastPushedRef.current = snapshot;
          return;
        }
        if (res.status === 409) {
          // Un autre appareil a écrit depuis notre base : on fusionne sa
          // version dans la nôtre, puis l'effet renvoie le résultat.
          const j = (await res.json()) as { snapshot: { blob: string; updatedAt: string } | null };
          serverBaseRef.current = j.snapshot?.updatedAt ?? null;
          let next = getClientSnapshot();
          try {
            const remote = j.snapshot ? (JSON.parse(j.snapshot.blob) as Progress) : null;
            if (remote && remote.version === PROGRESS_VERSION) next = mergeProgress(next, remote);
          } catch {
            /* version distante illisible : la nôtre fait foi */
          }
          replaceProgress({ ...next });
        }
      } catch {
        /* réseau : nouvel essai à la prochaine mutation */
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [hydrated, user, liveSnapshot]);

  const recordAnswer = useCallback(
    (questionId: string, value: AnswerValue, correct: boolean) => {
      updateAndNotify((p) => recordAnswerImpl(p, questionId, value, correct));
    },
    []
  );
  const setFavoriteTheme = useCallback((themeId: string | null) => {
    updateAndNotify((p) => setFavoriteThemeImpl(p, themeId));
  }, []);
  const setFavoriteMode = useCallback((mode: Prefs["favoriteMode"]) => {
    updateAndNotify((p) => setFavoriteModeImpl(p, mode));
  }, []);
  const setPseudo = useCallback((pseudo: string | null) => {
    updateAndNotify((p) => setPseudoImpl(p, pseudo));
  }, []);
  const addSent = useCallback((c: SentChallenge) => {
    updateAndNotify((p) => addSentChallenge(p, c));
  }, []);
  const addReceived = useCallback((c: ReceivedChallenge) => {
    updateAndNotify((p) => addReceivedChallenge(p, c));
  }, []);
  const toggleFavorite = useCallback((questionId: string) => {
    updateAndNotify((p) => toggleFavoriteImpl(p, questionId));
  }, []);
  const unlockBadges = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    updateAndNotify((p) => unlockBadgesImpl(p, ids));
  }, []);
  const markBadgesSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    updateAndNotify((p) => markBadgesSeenImpl(p, ids));
  }, []);
  const setDefisPlayedByOthers = useCallback((count: number) => {
    updateAndNotify((p) => setDefisPlayedByOthersImpl(p, count));
  }, []);
  const recordReceivedDefiPlayed = useCallback(
    (entry: ReceivedChallenge) => {
      updateAndNotify((p) => recordReceivedDefiPlayedImpl(p, entry));
    },
    []
  );
  const removeReceivedDefi = useCallback((id: string) => {
    updateAndNotify((p) => removeReceivedDefiImpl(p, id));
  }, []);

  const value = useMemo<ProgressContextValue>(
    () => ({
      progress,
      hydrated,
      recordAnswer,
      setFavoriteTheme,
      setFavoriteMode,
      setPseudo,
      addSentChallenge: addSent,
      addReceivedChallenge: addReceived,
      toggleFavorite,
      unlockBadges,
      markBadgesSeen,
      setDefisPlayedByOthers,
      recordReceivedDefiPlayed,
      removeReceivedDefi,
    }),
    [
      progress,
      hydrated,
      recordAnswer,
      setFavoriteTheme,
      setFavoriteMode,
      setPseudo,
      addSent,
      addReceived,
      toggleFavorite,
      unlockBadges,
      markBadgesSeen,
      setDefisPlayedByOthers,
      recordReceivedDefiPlayed,
      removeReceivedDefi,
    ]
  );

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error("useProgress must be used inside <ProgressProvider>");
  }
  return ctx;
}
