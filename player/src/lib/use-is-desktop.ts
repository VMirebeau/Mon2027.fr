"use client";

import { useSyncExternalStore } from "react";

// Desktop layout kicks in at tablet portrait (768px). Below this the mobile
// shell renders. Tablet (768-1023px) gets a compressed-desktop variant via
// CSS @media adjustments inside the desktop styles block.
const QUERY = "(min-width: 768px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  // SSR default: assume mobile. Desktop kicks in after hydration.
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
