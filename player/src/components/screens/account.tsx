"use client";

/// Page "Mon compte" (mobile). Remplace l'AccountModal historique : le reste
/// de l'app navigue par scènes, pas par modals — cette page suit la même
/// convention pour rester cohérente. Les classes CSS `.account-modal-*` sont
/// conservées (elles habillent juste des inputs / boutons, pas une modal),
/// mais le wrapper est désormais un écran scrollable comme Favoris / Réviser.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenHeader } from "../screen-header";
import { useAuth, type AuthError } from "@/lib/use-auth";
import {
  PASSWORD_RULES,
  PSEUDO_RULES,
  validatePassword,
  validatePseudo,
} from "@/lib/auth/validation";
import { sanitizeNextPath } from "@/lib/safe-redirect";
import type { NavTarget } from "@/lib/types";

type Tab = "login" | "signup";

export function Account({
  onHome,
  onNavigate,
}: {
  /// Conservés pour rester compat avec AppShell. Le HomeHeader est rendu
  /// au niveau d'AppShell (persistant entre scènes) ; la navigation se fait
  /// via la BottomTabBar et le menu user.
  onHome?: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  void onHome;
  const { user, ready } = useAuth();
  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <div style={{ padding: "0 20px 32px" }}>
        <ScreenHeader
          eyebrow="Mon compte"
          title={
            ready && user ? (
              <>
                Bonjour{" "}
                <span style={{ color: "var(--coral)" }}>
                  {user.displayPseudo}
                </span>
                .
              </>
            ) : (
              <>
                Pseudo,{" "}
                <span style={{ color: "var(--coral)" }}>sans email</span>.
              </>
            )
          }
          subtitle={
            ready && user
              ? "Ta progression est synchronisée avec ce compte."
              : "Un compte sert uniquement à retrouver ta progression sur un autre appareil."
          }
        />
        <AccountBody onNavigate={onNavigate} bareHero />
      </div>
    </div>
  );
}

/// Corps réutilisé par la version desktop. Toute la logique d'auth vit ici
/// pour éviter de dupliquer signup/login/delete entre mobile et DT.
///
/// `bareHero` : sur desktop, le hero (titre coral + description) est rendu
/// par AccountDT dans la colonne de gauche, donc on saute les titres/sous-
/// titres internes pour éviter la double accroche "Pseudo, sans email" /
/// "Compte optionnel, sans email" empilée verticalement. Le warning et le
/// form restent ici (tab-spécifiques).
export function AccountBody({
  onNavigate,
  bareHero = false,
}: {
  onNavigate?: (target: NavTarget) => void;
  bareHero?: boolean;
}) {
  const { user, busy, login, signup, logout, deleteAccount, revokeAllSessions } =
    useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // `next` autorise le caller (CTA "Crée un compte" sur /d/CODE/resultats, par
  // exemple) à demander qu'on redirige l'utilisateur vers une URL spécifique
  // après login/signup réussi. Validé strictement (cf. sanitizeNextPath) pour
  // empêcher tout open-redirect vers un domaine externe.
  const nextPath = sanitizeNextPath(searchParams.get("next"));
  /// `?tab=login` permet aux liens entrants (ex. "Déjà un compte ? Se
  /// connecter" sur l'onboarding) d'atterrir directement sur l'onglet
  /// Connexion plutôt que sur Créer un compte. Toute autre valeur (ou
  /// absence) garde l'onglet par défaut (signup) — la création reste la
  /// porte d'entrée pour les nouveaux. Lu UNE seule fois (initial state),
  /// pas re-synchronisé en cours d'interaction.
  ///
  /// On lit `window.location.search` plutôt que `searchParams` parce que
  /// la navigation interne d'AppShell utilise `window.history.pushState`
  /// directement (cf. use-scene-router.pushScene) sans passer par le router
  /// Next ; du coup `useSearchParams` peut retourner un snapshot pré-push
  /// au moment du mount, et on raterait le `tab=login` fraîchement injecté.
  /// Sur initial render serveur, `window` n'existe pas → fallback `signup`.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "signup";
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    return tabParam === "login" ? "login" : "signup";
  });
  const [pseudo, setPseudo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthError | null>(null);
  const [confirmLossUnderstood, setConfirmLossUnderstood] = useState(false);
  // Panneau "supprimer mon compte" : initialement masqué, déplié sur clic
  // du lien. Re-confirme avec mot de passe.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<AuthError | null>(null);

  async function submit() {
    setError(null);
    const pseudoErr = validatePseudo(pseudo);
    if (pseudoErr) return setError(pseudoErr);
    // Les règles de force (longueur min, anti-common-password) ne s'appliquent
    // qu'à la création : sur login, on enverrait sinon un faux "mot de passe
    // trop courant" à un utilisateur qui a un mot de passe légitime mais que
    // la liste commune a depuis intégré (ou créé avant ajout de la règle).
    // Le serveur reste l'autorité — il rejettera juste avec "credentials
    // invalides" si ça ne matche pas.
    if (tab === "signup") {
      const passwordErr = validatePassword(password);
      if (passwordErr) return setError(passwordErr);
    } else if (!password) {
      return setError({ field: "password", message: "Mot de passe requis." });
    }
    const result = await (tab === "signup"
      ? signup(pseudo, password)
      : login(pseudo, password));
    if ("message" in result) {
      setError(result);
    } else {
      // Login OK : on remet le formulaire à zéro.
      setPassword("");
      setError(null);
      // Si un `next` validé a été passé en query (ex. CTA "Crée un compte"
      // sur la page résultats), on rebascule l'utilisateur sur sa page
      // d'origine — c'est ce qui déclenche l'auto-claim côté serveur grâce
      // au cookie + la nouvelle session.
      if (nextPath !== null) {
        router.push(nextPath);
      }
      // Sinon : l'écran passe automatiquement en branche LOGGED-IN au
      // prochain render via le user du context auth.
    }
  }

  async function doLogout() {
    await logout();
    setPseudo("");
    setPassword("");
    setError(null);
  }

  async function doDelete() {
    setDeleteError(null);
    if (!deletePassword) {
      setDeleteError({ message: "Mot de passe requis." });
      return;
    }
    const result = await deleteAccount(deletePassword);
    if ("message" in result) {
      setDeleteError(result);
      return;
    }
    setDeleteOpen(false);
    setDeletePassword("");
  }

  if (user) {
    return (
      <div style={{ maxWidth: 560 }}>
        {!bareHero ? (
          <>
            <h2 className="account-modal-title">Connecté</h2>
            <p className="account-modal-sub">
              Tu es connecté en tant que{" "}
              <strong style={{ color: "var(--ink)" }}>
                {user.displayPseudo}
              </strong>
              . Ta progression est synchronisée automatiquement sur le serveur.
            </p>
          </>
        ) : null}

        <div className="account-modal-info">
          <div>
            <div className="account-modal-label">Pseudo</div>
            <div className="account-modal-value">{user.displayPseudo}</div>
          </div>
          <div>
            <div className="account-modal-label">Sync</div>
            <div className="account-modal-value">
              Activée : push automatique après chaque réponse
            </div>
          </div>
        </div>

        {onNavigate ? (
          <button
            type="button"
            className="account-modal-secondary"
            onClick={() => onNavigate("stats")}
            style={{ marginBottom: 6 }}
          >
            Voir mes stats
          </button>
        ) : null}

        <button
          type="button"
          className="account-modal-secondary"
          onClick={doLogout}
          disabled={busy}
        >
          {busy ? "Déconnexion…" : "Se déconnecter"}
        </button>
        <p className="account-modal-fine">
          La déconnexion garde ta progression locale (le navigateur la
          conserve). Au prochain login, elle sera re-fusionnée avec le serveur.
        </p>

        <button
          type="button"
          className="account-modal-link"
          onClick={async () => {
            await revokeAllSessions();
          }}
          disabled={busy}
        >
          Déconnecter tous mes appareils
        </button>
        <p className="account-modal-fine">
          À utiliser si tu as oublié de te déconnecter ailleurs (ordi partagé,
          téléphone perdu). Tous les cookies de session sont invalidés, y
          compris celui-ci. Tu seras déconnecté de cet appareil aussi.
        </p>

        {deleteOpen ? (
          <div className="account-modal-danger">
            <div className="account-modal-danger-title">
              Supprimer mon compte
            </div>
            <p className="account-modal-fine">
              Cette action est <strong>définitive</strong>. Tes données côté
              serveur (snapshot de progression, sessions, abonnements push)
              seront effacées immédiatement. Les défis que tu as créés restent
              accessibles à tes amis, mais sans lien avec ton compte.
            </p>
            <label className="account-modal-field">
              <span>Confirme avec ton mot de passe</span>
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                aria-invalid={!!deleteError}
              />
            </label>
            {deleteError ? (
              <div className="account-modal-error">{deleteError.message}</div>
            ) : null}
            <div className="account-modal-danger-actions">
              <button
                type="button"
                className="account-modal-ghost"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeletePassword("");
                  setDeleteError(null);
                }}
                disabled={busy}
              >
                Annuler
              </button>
              <button
                type="button"
                className="account-modal-danger-confirm"
                onClick={doDelete}
                disabled={busy}
              >
                {busy ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="account-modal-link"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
          >
            Supprimer mon compte
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="account-modal-tabs">
        <button
          type="button"
          className={"account-modal-tab" + (tab === "signup" ? " active" : "")}
          onClick={() => {
            setTab("signup");
            setError(null);
          }}
        >
          Créer un compte
        </button>
        <button
          type="button"
          className={"account-modal-tab" + (tab === "login" ? " active" : "")}
          onClick={() => {
            setTab("login");
            setError(null);
          }}
        >
          Connexion
        </button>
      </div>

      {tab === "signup" ? (
        <>
          {!bareHero ? (
            <>
              <h2 className="account-modal-title">
                Compte optionnel,{" "}
                <span style={{ color: "var(--coral)" }}>sans email</span>.
              </h2>
              <p className="account-modal-sub">
                Sert uniquement à retrouver ta progression sur un autre
                appareil. Tant que tu joues sur le même navigateur, tu
                n&apos;en as pas besoin.
              </p>
            </>
          ) : null}
          <div className="account-modal-warning">
            <strong>Note ton mot de passe quelque part de sûr</strong> : on ne
            garde pas d&apos;email, donc s&apos;il est oublié, le compte
            l&apos;est aussi.
          </div>
        </>
      ) : !bareHero ? (
        <>
          <h2 className="account-modal-title">Connexion</h2>
          <p className="account-modal-sub">
            Retrouve ta progression sur cet appareil.
          </p>
        </>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (tab === "signup" && !confirmLossUnderstood) {
            setError({
              message: "Coche la case pour confirmer que tu as compris.",
            });
            return;
          }
          submit();
        }}
      >
        <label className="account-modal-field">
          <span>Pseudo</span>
          <input
            type="text"
            autoComplete="username"
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder={tab === "signup" ? "ex : MartinDijon" : "Ton pseudo"}
            aria-invalid={error?.field === "pseudo"}
          />
          {tab === "signup" ? (
            <span className="account-modal-hint">
              {PSEUDO_RULES.description}
            </span>
          ) : null}
        </label>

        <label className="account-modal-field">
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete={tab === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === "signup" ? "8 caractères min." : "•••••"}
            aria-invalid={error?.field === "password"}
          />
          {tab === "signup" ? (
            <span className="account-modal-hint">
              {PASSWORD_RULES.description} À noter dans un endroit sûr.
            </span>
          ) : null}
        </label>

        {tab === "signup" ? (
          <label className="account-modal-check">
            <input
              type="checkbox"
              checked={confirmLossUnderstood}
              onChange={(e) => setConfirmLossUnderstood(e.target.checked)}
            />
            <span>
              Je comprends que <strong>perdre mon mot de passe</strong> = perdre
              mon compte définitivement.
            </span>
          </label>
        ) : null}

        {error ? (
          <div className="account-modal-error">{error.message}</div>
        ) : null}

        <button
          type="submit"
          className="account-modal-primary"
          disabled={busy}
        >
          {busy
            ? tab === "signup"
              ? "Création du compte…"
              : "Connexion…"
            : tab === "signup"
              ? "Créer mon compte"
              : "Me connecter"}
        </button>
      </form>
    </div>
  );
}
