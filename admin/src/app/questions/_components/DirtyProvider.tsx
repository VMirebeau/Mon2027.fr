"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DirtyState = {
  dirty: boolean;
  setDirty: (v: boolean) => void;
  requestLeave: (href: string) => void;
};

const DirtyContext = createContext<DirtyState | null>(null);

export function DirtyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  // Garde-fou navigateur (fermeture d'onglet, F5, etc.)
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome ignore le texte custom mais affiche son propre prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const requestLeave = useCallback(
    (href: string) => {
      if (dirty) {
        setPending(href);
      } else {
        router.push(href);
      }
    },
    [dirty, router]
  );

  const confirm = () => {
    const target = pending;
    setPending(null);
    setDirty(false);
    if (target) router.push(target);
  };

  return (
    <DirtyContext.Provider value={{ dirty, setDirty, requestLeave }}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitter sans enregistrer ?</DialogTitle>
            <DialogDescription>
              Tu as des modifications non enregistrées. Elles seront perdues si
              tu quittes maintenant.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Rester
            </Button>
            <Button variant="destructive" onClick={confirm}>
              Quitter sans enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DirtyContext.Provider>
  );
}

export function useDirty() {
  const ctx = useContext(DirtyContext);
  if (!ctx) throw new Error("useDirty must be used inside <DirtyProvider>");
  return ctx;
}

/// Variante tolérante : null hors d'un DirtyProvider (boutons partagés avec
/// des pages sans formulaire).
export function useOptionalDirty(): DirtyState | null {
  return useContext(DirtyContext);
}

/// Marque le formulaire comme modifié quand `value` change. Pour les saisies
/// qui ne déclenchent pas d'événement `change` sur le <form> : selects
/// contrôlés, boutons « Correct », ajout/suppression de lignes (seul un
/// <input type="hidden"> change). Comparaison à la valeur précédente plutôt
/// qu'un drapeau « premier rendu » : sûr avec le double montage du
/// StrictMode, qui marquait sinon le formulaire modifié dès l'ouverture.
export function useMarkDirtyOnChange(value: string) {
  const ctx = useContext(DirtyContext);
  const setDirty = ctx?.setDirty;
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setDirty?.(true);
  }, [value, setDirty]);
}
