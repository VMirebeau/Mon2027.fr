"use client";

import { useEffect } from "react";

/// Enregistre le service worker dès le mount côté client.
/// Indispensable pour : (1) que le manifest PWA soit "installable" pour
/// Chrome et donc pour TWA, (2) que les push notifications puissent
/// être souscrites. Le SW ne met en cache qu'une page hors ligne
/// (`public/offline.html`), servie quand une navigation échoue — cf.
/// `public/sw.js`.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // updateViaCache: 'none' force le navigateur à revalider sw.js à
    // chaque chargement → fix critique pour ne pas servir un vieux SW
    // en cache HTTP après un deploy.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => {
        console.warn("[pwa] SW registration failed", err);
      });
  }, []);

  return null;
}
