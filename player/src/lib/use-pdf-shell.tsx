"use client";

/// Contexte partagé pour le mode "export PDF". Permet :
///   1. au `HomeHeader` de rendre un bouton d'export contextuel à gauche du
///      UserMenu, dont l'action dépend de la scène active (sélection sur
///      Réviser, lien direct sur Favoris).
///   2. au composant Réviser (mobile + desktop) de partager le même état
///      `PdfSelection` que ce bouton header.
///
/// Les scènes "publient" leur action via `useExposePdfHeaderAction()` au mount
/// et la nettoient au unmount. Si aucune scène ne publie d'action, le bouton
/// n'apparaît pas dans le header.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePdfSelection, type PdfSelection } from "./use-pdf-selection";

/// Action exposée au bouton header par la scène active.
///   - "select" : entre en mode sélection PDF (utilisé par Réviser)
///   - "direct" : ouvre /livret directement (utilisé par Favoris)
export type PdfHeaderAction =
  | { kind: "select"; onClick: () => void }
  | { kind: "direct"; href: string; count: number }
  | null;

type PdfShellCtx = {
  selection: PdfSelection;
  headerAction: PdfHeaderAction;
  setHeaderAction: (a: PdfHeaderAction) => void;
};

const Ctx = createContext<PdfShellCtx | null>(null);

export function PdfShellProvider({ children }: { children: React.ReactNode }) {
  const selection = usePdfSelection();
  const [headerAction, setHeaderAction] = useState<PdfHeaderAction>(null);

  const value = useMemo<PdfShellCtx>(
    () => ({ selection, headerAction, setHeaderAction }),
    [selection, headerAction],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/// Hook principal — accès à l'état partagé. Throw si pas wrappé.
export function usePdfShell(): PdfShellCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePdfShell must be used within PdfShellProvider");
  return c;
}

/// Variante "safe" qui retourne null si pas wrappé — pour les call sites
/// (HomeHeader) qui peuvent être montés sans le Provider (cas dégradé,
/// SSR partiel, etc.). Évite un throw qui casserait toute la page.
export function usePdfShellSafe(): PdfShellCtx | null {
  return useContext(Ctx);
}

/// Sucre : publie une action `select` au mount, nettoie au unmount.
/// La scène l'appelle avec son callback d'entrée en mode sélection.
/// `enabled` (défaut true) permet de masquer le bouton header quand la
/// scène n'a rien à exporter — sinon une icône d'export apparaît dans la
/// barre alors qu'aucune sélection n'est possible (cas Réviser vide).
export function useExposePdfHeaderSelectAction(
  onClick: () => void,
  enabled: boolean = true,
) {
  const { setHeaderAction } = usePdfShell();
  /// `useCallback` ici demande une fonction inline (règle react-hooks/use-memo) :
  /// on enveloppe `onClick` plutôt que de passer la ref directement, ce qui
  /// préserve la stabilité de l'identité tant que `onClick` reste référentiellement
  /// stable côté caller.
  const stable = useCallback(() => onClick(), [onClick]);
  useEffect(() => {
    if (!enabled) {
      setHeaderAction(null);
      return;
    }
    setHeaderAction({ kind: "select", onClick: stable });
    return () => setHeaderAction(null);
  }, [setHeaderAction, stable, enabled]);
}

/// Sucre : publie une action `direct` (lien /livret). Re-publie quand
/// `count`/`href` changent.
export function useExposePdfHeaderDirectAction(href: string, count: number) {
  const { setHeaderAction } = usePdfShell();
  useEffect(() => {
    if (count === 0) {
      setHeaderAction(null);
      return;
    }
    setHeaderAction({ kind: "direct", href, count });
    return () => setHeaderAction(null);
  }, [setHeaderAction, href, count]);
}
