"use client";

/// Provider racine du système de gamification.
///
/// Monté une seule fois dans `app/layout.tsx`, il :
///   - rend `GamificationWatcher` qui surveille Progress + le catalogue
///     et affiche la file de toasts BadgeToast ;
///   - centralise la gestion de l'événement `BADGE_TOAST_NAVIGATE_EVENT`
///     émis quand l'utilisateur clique sur une toast de badge. Par défaut
///     il route vers `/?s=rewards` via le router Next — ce qui marche
///     depuis n'importe quelle page (`/q/[slug]`, `/d/[shortCode]`, etc).
///   - expose `useRegisterRewardsNav(handler)` pour qu'un consommateur
///     spécifique (en pratique : `AppShell`) reprenne la main avec un
///     fast-path local (`setScene("rewards")`) plutôt que de payer une
///     vraie navigation. Tant qu'un handler est enregistré, c'est lui qui
///     est appelé ; sinon on retombe sur le `router.push` global.
///
/// Pourquoi un handler-ref + provider plutôt que deux listeners parallèles :
/// avec deux listeners (un dans AppShell, un ici), il faudrait coordonner
/// l'ordre d'exécution et utiliser `e.preventDefault()` / `defaultPrevented`
/// — fragile car l'ordre dépend de l'ordre de mount. Ici la source de
/// vérité est unique : le provider décide d'appeler le handler enregistré
/// ou pas. AppShell pose son handler via un effet ; au démontage il le
/// retire et le fallback `router.push` redevient actif.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import type { MutableRefObject, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BADGE_TOAST_NAVIGATE_EVENT } from "./badge-toast";
import { GamificationWatcher } from "./gamification-watcher";
import type { CatalogIndex } from "@/lib/gamification";

type RewardsNavRef = MutableRefObject<(() => void) | null>;

const RewardsNavCtx = createContext<RewardsNavRef | null>(null);

export function GamificationProvider({
  catalog,
  children,
}: {
  catalog: CatalogIndex;
  children: ReactNode;
}) {
  const router = useRouter();
  // Handler optionnel posé par AppShell. Stocké en ref pour ne pas relancer
  // le listener d'événement à chaque changement — on lit toujours la
  // dernière valeur au moment où l'événement arrive.
  const handlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function onNavigate() {
      const local = handlerRef.current;
      if (local) {
        local();
        return;
      }
      // Fallback global : on est probablement sur une route standalone
      // (/q/[slug], /d/[shortCode], …). Une nav Next vers la home avec
      // `?s=rewards` réveille AppShell et atterrit sur la scène
      // récompenses.
      router.push("/?s=rewards");
    }
    window.addEventListener(BADGE_TOAST_NAVIGATE_EVENT, onNavigate);
    return () =>
      window.removeEventListener(BADGE_TOAST_NAVIGATE_EVENT, onNavigate);
  }, [router]);

  return (
    <RewardsNavCtx.Provider value={handlerRef}>
      {children}
      <GamificationWatcher catalog={catalog} />
    </RewardsNavCtx.Provider>
  );
}

/// Hook consommé par AppShell (et n'importe quel autre composant qui veut
/// court-circuiter la navigation par défaut vers la page Récompenses).
/// Le handler passé est enregistré pour la durée de vie du composant ; au
/// démontage, le fallback `router.push` reprend la main.
///
/// Le handler est stocké via `useEffect` plutôt qu'appelé directement — la
/// ref est volontairement non réactive (le listener lit `handlerRef.current`
/// au moment où l'événement arrive). Passer une nouvelle fonction à chaque
/// render ne re-déclenche donc rien d'autre que l'update de la ref.
export function useRegisterRewardsNav(handler: () => void) {
  const ref = useContext(RewardsNavCtx);
  // Mémorise le handler dans une ref locale pour qu'un parent puisse passer
  // une closure inline sans nous obliger à réinscrire l'effet à chaque
  // render. On lit `localRef.current` dans l'effet déclencheur.
  const localRef = useRef(handler);
  useEffect(() => {
    localRef.current = handler;
  });

  const stable = useCallback(() => {
    localRef.current();
  }, []);

  useEffect(() => {
    if (!ref) return;
    ref.current = stable;
    return () => {
      if (ref.current === stable) ref.current = null;
    };
  }, [ref, stable]);
}
