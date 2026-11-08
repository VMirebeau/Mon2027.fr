// Mon2027 — service worker minimal
// Rôles :
//   1. recevoir les push notifications et gérer le clic ;
//   2. servir une page hors ligne légère (/offline.html) quand une
//      NAVIGATION échoue faute de réseau — sinon l'appli installée affichait
//      la page d'erreur du navigateur.
// Volontairement PAS de cache applicatif : ni l'API, ni le HTML des pages,
// ni les assets ne sont mis en cache. Seule la page hors ligne l'est, à
// l'installation. Les requêtes autres que les navigations ne passent pas
// par le service worker (pas de respondWith).

// Incrémenter la version quand offline.html change : l'activation purge les
// anciennes versions du cache.
const OFFLINE_CACHE = "mon2027-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(OFFLINE_CACHE);
        // cache: "reload" : on veut la version du serveur, pas celle du
        // cache HTTP éventuellement périmée.
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {
        // Échec réseau pendant l'installation : le SW s'installe quand même
        // (push intacts), la page hors ligne sera simplement absente.
      }
      // Active le nouveau SW immédiatement plutôt que d'attendre fermeture
      // de tous les onglets.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge des anciennes versions de la page hors ligne.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("mon2027-offline-") && k !== OFFLINE_CACHE)
          .map((k) => caches.delete(k)),
      );
      // Navigation preload : le navigateur lance la requête de page en
      // parallèle du démarrage du SW, pour ne pas ralentir les navigations
      // maintenant qu'un gestionnaire fetch existe.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* non supporté : sans conséquence */
        }
      }
      // Prend le contrôle des onglets ouverts dès l'activation.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Uniquement les navigations (chargement d'une page) en GET : tout le
  // reste (API, RSC, scripts, images…) suit le chemin réseau normal.
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(req);
      } catch {
        // Le réseau a échoué (hors ligne, DNS…) : page hors ligne. Une
        // réponse HTTP d'erreur (404, 500) n'arrive pas ici — elle est
        // rendue telle quelle.
        const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
        return (
          cached ||
          new Response("Hors ligne. Réessaie quand le réseau sera revenu.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Mon2027", body: event.data.text() };
  }

  const title = payload.title || "Mon2027";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon",
    badge: payload.badge || "/icon",
    tag: payload.tag,
    data: { url: payload.url || "/" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawTarget = (event.notification.data && event.notification.data.url) || "/";

  // Sécurité : on ne suit la cible que si elle reste sur notre origine. Une
  // future route admin de push custom pourrait théoriquement injecter une URL
  // externe — openWindow l'ouvrirait sinon, ce qui exposerait à du phishing
  // depuis une notif "Mon2027". client.navigate est déjà restreint same-origin
  // par le navigateur, mais openWindow ne l'est pas.
  let target = "/";
  try {
    const resolved = new URL(rawTarget, self.location.origin);
    if (resolved.origin === self.location.origin) {
      target = resolved.pathname + resolved.search + resolved.hash;
    }
  } catch {
    // URL malformée : on ouvre la home.
  }

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Si un onglet de l'app est déjà ouvert, on le focus et on navigue.
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              // navigate cross-origin échoue silencieusement — ok.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
