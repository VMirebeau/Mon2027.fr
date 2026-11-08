import { useSyncExternalStore } from "react";

/// Valeurs qui n'existent que dans le navigateur, lues sans `setState` dans
/// un effet (motif « monté ? → setMounted(true) » que les règles React
/// signalent car il provoque un rendu en cascade). useSyncExternalStore rend
/// la valeur serveur à l'hydratation puis la valeur client, sans mismatch.

const noSubscribe = () => () => {};

/// true une fois hydraté côté navigateur, false au rendu serveur. Pour les
/// portails vers document.body et tout ce qui touche au DOM.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/// Le navigateur propose-t-il le partage natif (navigator.share) ?
export function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );
}
