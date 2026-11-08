"use client";

import { useEffect, useState } from "react";

/// Drop-in opt-in component pour les push notifs.
/// À placer où ça a du sens éditorialement (compte modal, écran de
/// fin de quiz, etc.). N'affiche rien si :
///   - le navigateur ne supporte pas Web Push,
///   - la permission a déjà été refusée (l'user devrait la réactiver
///     manuellement dans les réglages du navigateur — on n'insiste pas),
///   - l'env publique n'est pas configurée (clé VAPID manquante).
export function PushToggle() {
  const [state, setState] = useState<
    "loading" | "unsupported" | "denied" | "subscribed" | "idle" | "pending"
  >("loading");
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  // Détection capabilities browser (push, service worker, permission).
  // Le setState à l'arrivée est intentionnel : passage "loading" → état
  // réel après mount. Plusieurs branches en sortie, donc on désactive la
  // règle sur le bloc entier.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!vapidKey) {
      setState("unsupported");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    (async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "idle");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function subscribe() {
    if (!vapidKey) return;
    setState("pending");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "idle");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        await sub.unsubscribe();
        setState("idle");
        return;
      }
      setState("subscribed");
    } catch (err) {
      console.warn("[push] subscribe failed", err);
      setState("idle");
    }
  }

  async function unsubscribe() {
    setState("pending");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("idle");
    } catch (err) {
      console.warn("[push] unsubscribe failed", err);
      setState("subscribed");
    }
  }

  if (state === "loading" || state === "unsupported") return null;
  if (state === "denied") {
    return (
      <p className="text-sm text-[var(--ink-mute)]">
        Les notifications sont bloquées. Active-les depuis les réglages
        de ton navigateur si tu changes d&apos;avis.
      </p>
    );
  }

  const subscribed = state === "subscribed";
  return (
    <button
      type="button"
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={state === "pending"}
      className="rounded-full border border-[var(--rule)] px-4 py-2 text-sm font-medium hover:bg-[var(--cream-deep)] disabled:opacity-50"
    >
      {state === "pending"
        ? "…"
        : subscribed
        ? "Désactiver les notifications"
        : "Activer les notifications"}
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}
