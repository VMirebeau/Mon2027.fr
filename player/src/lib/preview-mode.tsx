"use client";

import { createContext, useContext } from "react";

/// Mode « aperçu » (page /apercu/<jeton>, ouverte depuis l'espace
/// contributeurs) : la question se joue normalement, mais la réponse n'est
/// envoyée ni aux statistiques communautaires ni à la progression du joueur
/// (cf. use-game-state). Faux partout ailleurs.
const PreviewModeContext = createContext(false);

export const PreviewModeProvider = PreviewModeContext.Provider;

export function usePreviewMode(): boolean {
  return useContext(PreviewModeContext);
}
