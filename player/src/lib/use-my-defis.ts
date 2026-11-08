"use client";

/// Défis ENVOYÉS par l'utilisateur courant, lus côté serveur
/// (GET /api/defis/mine, authentifié par le cookie `mon2027_defi_client`
/// et/ou la session). C'est la seule source fiable : `progress.challenges.sent`
/// n'est plus alimenté depuis que les défis vivent en base, si bien que les
/// écrans qui le lisaient affirmaient « aucun défi envoyé » à un joueur qui
/// en avait envoyé (et dont l'onglet Défier portait une pastille).
///
/// Plusieurs composants montés ensemble (StatsDT + StatsBody sur desktop)
/// partagent la même requête en vol plutôt que d'en lancer une chacun.

import { useEffect, useState } from "react";
import type { DefiSummary } from "@/app/api/defis/mine/route";

export type MyDefisState =
  | { status: "loading" }
  | { status: "ok"; defis: DefiSummary[] }
  | { status: "error" };

let inflight: Promise<DefiSummary[] | null> | null = null;

function fetchMyDefis(): Promise<DefiSummary[] | null> {
  inflight ??= fetch("/api/defis/mine", { cache: "no-store" })
    .then((r) =>
      r.ok ? (r.json() as Promise<{ defis: DefiSummary[] }>) : null,
    )
    .then((j) => (j && Array.isArray(j.defis) ? j.defis : null))
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useMyDefis(): MyDefisState {
  const [state, setState] = useState<MyDefisState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetchMyDefis().then((defis) => {
      if (cancelled) return;
      setState(defis ? { status: "ok", defis } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
