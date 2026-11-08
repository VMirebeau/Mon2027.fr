"use client";

import { useEffect } from "react";
import { prefetchDossiers } from "@/lib/use-question-dossier";

/// Lance le chargement des dossiers de questions quand le navigateur est au
/// repos après l'affichage de l'accueil : ils sont prêts bien avant la
/// première réponse, sans ralentir le premier affichage.
export function DossierPrefetch() {
  useEffect(() => {
    const run = () => prefetchDossiers();
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 3_000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1_500);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
