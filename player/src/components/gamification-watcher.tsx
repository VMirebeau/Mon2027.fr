"use client";

/// Composant invisible monté au layout root (cf. GamificationProvider).
///
/// Rôle :
///   1. Surveille Progress + l'index du catalogue (CatalogIndex).
///   2. À chaque évolution, recalcule les badges débloqués (cf.
///      `findNewBadgeUnlocks`) et persiste les nouveaux unlocks dans
///      Progress.
///   3. Synchronise les compteurs serveur — défis joués par des destinataires
///      via /api/me/defis-impact — vers Progress. Permet aux badges Partage
///      (ambassadeur, bouche-à-oreille) d'utiliser une métrique non-gameable.
///   4. Affiche la file de toasts BadgeToast pour célébrer chaque
///      déblocage. La toast est dismissable et marque le badge `seen` une
///      fois fermée — ce qui empêche le rejeu sur un refresh.
///
/// Pourquoi au root layout et plus dans AppShell :
/// L'AppShell ne couvre que la route `/`. Les pages standalone `/q/[slug]`
/// et `/d/[shortCode]` répondaient aussi à des questions (via GameSession,
/// qui appelle `recordAnswer`) mais ne montaient pas ce watcher — les
/// badges étaient calculés au prochain passage par AppShell, et aucune toast
/// n'apparaissait depuis ces routes. Hoister le watcher au layout règle ces
/// deux soucis d'un coup ; en contrepartie, on a refactoré la signature
/// pour ne prendre qu'un CatalogIndex léger (cf. lib/gamification) — pas
/// besoin de charger toutes les Questions/sources à chaque route.

import { useEffect, useMemo, useRef } from "react";
import {
  type CatalogIndex,
  findNewBadgeUnlocks,
  listUnseenBadges,
} from "@/lib/gamification";
import { useProgress } from "@/lib/use-progress";
import { BadgeToastQueue } from "./badge-toast";

/// Fenêtre minimale entre deux fetchs /api/me/defis-impact. La valeur
/// authoritative bouge rarement (un destinataire qui joue) — on évite de
/// hammer le serveur sur chaque ré-hydratation.
const DEFIS_IMPACT_REFRESH_MS = 90_000;

export function GamificationWatcher({ catalog }: { catalog: CatalogIndex }) {
  const {
    progress,
    hydrated,
    unlockBadges,
    markBadgesSeen,
    setDefisPlayedByOthers,
  } = useProgress();

  // Liste des IDs nouvellement débloqués sur la base du progress courant.
  // Recalculée à chaque change de progress / catalogue ; coût ~13
  // prédicats × O(answers), parfaitement OK pour quelques centaines de
  // réponses.
  const newlyUnlocked = useMemo(() => {
    if (!hydrated) return [];
    return findNewBadgeUnlocks(progress, catalog);
  }, [progress, catalog, hydrated]);

  // Push les unlocks dans Progress (le watcher est seule source d'écriture
  // pour `badges`). updateAndNotify est idempotent : si `newlyUnlocked`
  // est vide ou re-vérifie un badge déjà présent, c'est un noop côté
  // store grâce aux gardes dans unlockBadgesImpl.
  useEffect(() => {
    if (newlyUnlocked.length === 0) return;
    unlockBadges(newlyUnlocked);
  }, [newlyUnlocked, unlockBadges]);

  // Sync compteur défis-joués depuis le serveur. Fire-and-forget côté UX :
  // si le réseau pète, on garde la valeur cachée actuelle (qui était
  // monotone). On refetch au mount + à chaque retour de focus tab
  // (l'utilisateur revient sur l'app après avoir partagé son défi sur
  // un autre support).
  const lastFetchRef = useRef<number>(0);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function fetchImpact() {
      const now = Date.now();
      if (now - lastFetchRef.current < DEFIS_IMPACT_REFRESH_MS) return;
      lastFetchRef.current = now;
      try {
        const r = await fetch("/api/me/defis-impact", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { totalResponses?: number };
        if (cancelled) return;
        if (typeof j.totalResponses === "number") {
          setDefisPlayedByOthers(j.totalResponses);
        }
      } catch {
        /* silent — best-effort */
      }
    }

    fetchImpact();
    function onFocus() {
      // Refresh si l'onglet redevient actif après une absence : c'est
      // typiquement le moment où l'utilisateur revient voir si quelqu'un
      // a répondu à son défi.
      fetchImpact();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [hydrated, setDefisPlayedByOthers]);

  // Toasts : on rend la liste des badges encore non vus. La file est
  // pilotée par la fonction `listUnseenBadges` qui filtre les IDs orphelins
  // (badges retirés du catalogue) automatiquement.
  const unseen = useMemo(
    () => (hydrated ? listUnseenBadges(progress) : []),
    [progress, hydrated]
  );

  return <BadgeToastQueue ids={unseen} onDismiss={markBadgesSeen} />;
}
