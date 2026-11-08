"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AuthUser = {
  id: string;
  pseudo: string;
  displayPseudo: string;
};

export type AuthError = { field?: "pseudo" | "password"; message: string };

type AuthContextValue = {
  user: AuthUser | null;
  /// `true` une fois que la première lecture `/api/me` est terminée.
  /// Avant ça, on ne sait pas si l'utilisateur est loggué — l'UI peut
  /// afficher un état neutre.
  ready: boolean;
  /// `true` pendant une requête signup/login/logout en vol.
  busy: boolean;
  signup: (pseudo: string, password: string) => Promise<AuthUser | AuthError>;
  login: (pseudo: string, password: string) => Promise<AuthUser | AuthError>;
  logout: () => Promise<void>;
  /// Supprime le compte côté serveur (RGPD art. 17). Demande le mot de passe
  /// en re-confirmation. La progression locale (localStorage) n'est PAS effacée
  /// par cette fonction — le caller décide ce qu'il veut en faire (la garder
  /// pour rejouer anonyme, ou la wipe).
  deleteAccount: (password: string) => Promise<{ ok: true } | AuthError>;
  /// Invalide TOUTES les sessions du user — utile quand on suspecte qu'un
  /// device a été oublié (ordi de café, prêt à un proche). Pas de
  /// re-confirmation MDP : on agit *depuis* un device déjà authentifié.
  /// Cette session-ci est aussi tuée → on est déconnecté localement.
  revokeAllSessions: () => Promise<{ ok: true } | AuthError>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Rebranchement initial : sur le premier mount client, on demande au
  // serveur qui est connecté. Le cookie est HttpOnly donc le JS ne
  // peut pas le lire directement — il faut passer par l'API.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((j: { user: AuthUser | null }) => {
        if (!cancelled) {
          setUser(j.user ?? null);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signup = useCallback(
    async (pseudo: string, password: string): Promise<AuthUser | AuthError> => {
      setBusy(true);
      try {
        const r = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pseudo, password }),
        });
        const j: { user?: AuthUser; error?: AuthError } = await r.json();
        if (!r.ok || !j.user) {
          return j.error ?? { message: "Erreur lors de l'inscription." };
        }
        setUser(j.user);
        return j.user;
      } catch {
        return { message: "Erreur réseau." };
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const login = useCallback(
    async (pseudo: string, password: string): Promise<AuthUser | AuthError> => {
      setBusy(true);
      try {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pseudo, password }),
        });
        const j: { user?: AuthUser; error?: AuthError } = await r.json();
        if (!r.ok || !j.user) {
          return j.error ?? { message: "Erreur de connexion." };
        }
        setUser(j.user);
        return j.user;
      } catch {
        return { message: "Erreur réseau." };
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore — on déconnecte localement de toute façon */
    } finally {
      setUser(null);
      setBusy(false);
    }
  }, []);

  const deleteAccount = useCallback(
    async (password: string): Promise<{ ok: true } | AuthError> => {
      setBusy(true);
      try {
        const r = await fetch("/api/me", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const j: { ok?: true; error?: AuthError } = await r.json();
        if (!r.ok || !j.ok) {
          return j.error ?? { message: "Suppression impossible." };
        }
        setUser(null);
        return { ok: true };
      } catch {
        return { message: "Erreur réseau." };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const revokeAllSessions = useCallback(
    async (): Promise<{ ok: true } | AuthError> => {
      setBusy(true);
      try {
        const r = await fetch("/api/me/sessions", { method: "DELETE" });
        const j: { ok?: true; error?: AuthError } = await r.json();
        if (!r.ok || !j.ok) {
          return j.error ?? { message: "Action impossible." };
        }
        // Le serveur a invalidé toutes les sessions, y compris la nôtre.
        setUser(null);
        return { ok: true };
      } catch {
        return { message: "Erreur réseau." };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      busy,
      signup,
      login,
      logout,
      deleteAccount,
      revokeAllSessions,
    }),
    [
      user,
      ready,
      busy,
      signup,
      login,
      logout,
      deleteAccount,
      revokeAllSessions,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
