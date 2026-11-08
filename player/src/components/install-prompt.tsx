"use client";

/// Prompt d'installation PWA — bannière discrète qui invite à installer
/// l'app sur l'écran d'accueil. Cible : Android / Chrome / Edge où le
/// browser émet `beforeinstallprompt` avant d'afficher sa propre UI native
/// (qu'on préempte pour la déclencher au bon moment, avec notre wording).
///
/// Critères d'affichage :
///   - L'événement `beforeinstallprompt` a été capté (browser éligible)
///   - L'utilisateur a déjà répondu à au moins 1 question (engagement minimum)
///   - L'utilisateur n'a pas dismissé la bannière récemment (TTL 14 jours)
///   - L'app n'est PAS déjà installée (display-mode standalone)
///
/// iOS Safari n'émet pas `beforeinstallprompt` (limitation Apple) ; pour
/// iOS, le prompt n'apparaît pas du tout. Une instruction "Partager → Sur
/// l'écran d'accueil" pourra être ajoutée plus tard si on veut couvrir iOS.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useProgress } from "@/lib/use-progress";
import { answeredCount } from "@/lib/progress";

/// Subscribe à un MediaQueryList et retourne `matches` réactivement, via
/// `useSyncExternalStore` — c'est le pattern React 19 pour lire un état
/// externe (browser API) sans tomber sur le lint `set-state-in-effect`.
/// SSR : on retourne false par défaut.
function useMediaQueryMatch(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/// Détection OS mobile via user-agent. L'UA ne change pas après le mount,
/// donc useSyncExternalStore avec un subscribe no-op suffit — on évite
/// useEffect+useState qui ferait du SSR false → client true et un flash.
///
/// Cas particulier iPadOS ≥ 13 : Safari renvoie un UA "Macintosh" pour les
/// iPads en mode "site web pour ordinateur". On distingue via `maxTouchPoints`
/// (les Mac n'ont pas d'écran tactile, les iPads en ont au moins 1).
function useIsMobileOS(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof navigator === "undefined") return false;
      const ua = navigator.userAgent;
      if (/Android|iPhone|iPod/i.test(ua)) return true;
      if (/iPad/i.test(ua)) return true;
      // iPadOS desktop-mode : UA Macintosh + tactile.
      if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
      return false;
    },
    () => false,
  );
}

/// Lit la date de dismiss en localStorage et retourne true si elle est dans
/// la fenêtre TTL. Lecture pure SSR-safe. Le résultat ne réagit pas aux
/// changements de localStorage d'une autre tab — pas nécessaire ici puisque
/// le seul write se fait via `dismiss()` côté même tab (qui appelle aussi
/// `setDismissed(true)` directement).
function readDismissedFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

const DISMISS_KEY = "mon2027:installPromptDismissedAt";
/// 14 jours en ms : si l'utilisateur dismisse, on ne re-propose pas avant.
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/// Type de l'event `beforeinstallprompt` (non standardisé donc pas dans lib.dom).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const { progress, hydrated } = useProgress();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  // État "déjà installée" : lu réactivement via la media query
  // `display-mode: standalone`.
  const isStandalone = useMediaQueryMatch("(display-mode: standalone)");

  // Mobile-only : sur desktop, personne n'installe une PWA depuis une carte
  // intrusive — le browser pose déjà une icône d'installation discrète dans
  // sa barre d'URL pour qui veut. La détection se fait sur l'OS (user-agent)
  // et non sur la largeur d'écran : une fenêtre desktop redimensionnée à 600px
  // ne doit pas déclencher la bannière, et un mobile en paysage doit y avoir
  // droit.
  const isMobile = useIsMobileOS();

  // État "dismiss récent" : combine la lecture localStorage (SSR-safe via
  // useSyncExternalStore) ET un setter local pour le dismiss runtime.
  // Sticky : une fois vrai, ça reste vrai pour la session.
  const dismissedFromStorage = useSyncExternalStore(
    () => () => {},
    readDismissedFromStorage,
    () => false,
  );
  const [dismissedLocally, setDismissedLocally] = useState(false);
  const dismissed = dismissedFromStorage || dismissedLocally;

  useEffect(() => {
    // Capture l'event browser et empêche le prompt natif de s'afficher.
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      // L'app vient d'être installée — on cache la bannière même si dismiss
      // n'a pas été cliqué.
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    // Quel que soit le choix, on consomme l'event — il ne se rejoue pas.
    setDeferredPrompt(null);
    if (choice.outcome === "dismissed") {
      dismiss();
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* perms */
    }
    setDismissedLocally(true);
  }

  // Critères de gating combinés.
  if (!isMobile) return null;
  if (isStandalone) return null;
  if (dismissed) return null;
  if (!deferredPrompt) return null;
  if (!hydrated) return null;
  if (answeredCount(progress) < 1) return null;

  return (
    <div className="install-prompt" role="dialog" aria-label="Installer Mon2027">
      <div className="install-prompt-inner">
        <div className="install-prompt-text">
          <div className="install-prompt-title">
            Installe Mon2027 sur ton écran d&apos;accueil
          </div>
          <div className="install-prompt-sub">
            Accès direct en un tap, et tu reçois la question du jour si tu
            l&apos;actives.
          </div>
        </div>
        <div className="install-prompt-actions">
          <button
            type="button"
            className="install-prompt-secondary"
            onClick={dismiss}
            aria-label="Plus tard"
          >
            Plus tard
          </button>
          <button
            type="button"
            className="install-prompt-primary"
            onClick={handleInstall}
          >
            Installer
          </button>
        </div>
      </div>
    </div>
  );
}
