"use client";

/// Polling + context pour les réponses non vues aux défis envoyés.
///
/// Une seule instance de provider est montée au niveau d'AppShell. Toutes
/// les surfaces qui doivent afficher une pastille de notif (BottomTabBar,
/// AppNav, MyDefisList) consomment ce contexte via `useUnseenDefis()`.
/// Centraliser le polling ici :
///   - évite N requêtes en parallèle si plusieurs composants veulent l'info,
///   - garantit que toutes les pastilles affichent la même valeur (pas de
///     décalage entre la bottom-tab et la carte concernée),
///   - permet de mettre en pause le polling proprement quand l'onglet n'est
///     pas visible (économie batterie + bande passante).
///
/// L'endpoint `/api/defis/mine/unseen` retourne un payload minuscule
/// (`{ total, byShortCode }`), donc poller toutes les 60 s reste très peu
/// cher même sur connexion 3G.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UnseenDefisResponse } from "@/app/api/defis/mine/unseen/route";

type UnseenDefisState = {
  /// Total cumulé de réponses non vues — pilote la pastille rouge globale
  /// sur l'onglet "Défier" (bottom-tab + AppNav).
  total: number;
  /// Par shortCode, nombre de réponses non vues. Permet à MyDefisList
  /// d'afficher un compteur sur les cartes concernées. Vide quand rien
  /// d'unseen.
  byShortCode: Record<string, number>;
  /// Force un refetch immédiat — appelé après les actions qui invalident
  /// l'état attendu (typiquement : retour focus depuis /resultats, où on
  /// vient de marquer-vu côté serveur, mais le polling n'a pas encore tiré).
  /// Pas utilisé directement dans le scope actuel ; exposé pour faciliter
  /// les besoins futurs (ex: après suppression d'un défi).
  refresh: () => void;
};

const UnseenDefisContext = createContext<UnseenDefisState>({
  total: 0,
  byShortCode: {},
  refresh: () => {},
});

/// Délai entre deux polls quand l'onglet est visible. 60 s : assez court
/// pour que le militant voie sa pastille apparaître en moins d'une minute
/// après qu'un ami a répondu, assez long pour ne pas pomper de batterie.
const POLL_INTERVAL_MS = 60_000;

export function UnseenDefisProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    total: number;
    byShortCode: Record<string, number>;
  }>({ total: 0, byShortCode: {} });

  // Garde le timer entre renders pour pouvoir clear/reset proprement.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AbortController du fetch en vol — annulé si un nouveau fetch est lancé
  // (focus pendant un poll en cours, ou unmount).
  const abortRef = useRef<AbortController | null>(null);

  const fetchUnseen = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch("/api/defis/mine/unseen", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!r.ok) return;
      const j = (await r.json()) as UnseenDefisResponse;
      // setState avec une stable reference pour byShortCode quand vide :
      // évite des re-renders inutiles dans les consommateurs qui useMemo
      // dessus.
      setState({ total: j.total, byShortCode: j.byShortCode });
    } catch {
      // AbortError ou erreur réseau : on swallow. Le prochain tick
      // retentera, et tant que le serveur ne répond pas on garde la
      // dernière valeur connue (preferred over flashing the badge to 0).
    }
  }, []);

  // Boucle de polling : setTimeout en chaîne (plutôt qu'un setInterval) pour
  // éviter les pile-up si une requête tarde — on relance après chaque
  // résolution. Premier passage immédiat au montage.
  useEffect(() => {
    let stopped = false;
    function schedule(delay: number) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        // Onglet caché : pas la peine de pomper, mais on ré-arme pour que le
        // refresh reprenne (la visibilité peut osciller, ex. appel entrant).
        if (document.visibilityState !== "hidden") await fetchUnseen();
        if (!stopped) schedule(POLL_INTERVAL_MS);
      }, delay);
    }
    schedule(0);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Refetch immédiat au retour focus : couvre le cas typique du
        // créateur qui vient de fermer la page résultats (mark-seen
        // serveur effectué) et revient sur l'app — on veut que la
        // pastille disparaisse sans attendre 60 s. Repart d'un cycle complet.
        schedule(0);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchUnseen]);

  const value = useMemo<UnseenDefisState>(
    () => ({
      total: state.total,
      byShortCode: state.byShortCode,
      refresh: fetchUnseen,
    }),
    [state.total, state.byShortCode, fetchUnseen],
  );

  return (
    <UnseenDefisContext.Provider value={value}>
      {children}
    </UnseenDefisContext.Provider>
  );
}

/// Hook de lecture du context. Retourne `{ total, byShortCode, refresh }`.
/// No-op safe si appelé hors d'un provider — retourne l'état par défaut
/// (utile pour les pages /q et /d standalone qui n'ont pas AppShell).
export function useUnseenDefis(): UnseenDefisState {
  return useContext(UnseenDefisContext);
}
