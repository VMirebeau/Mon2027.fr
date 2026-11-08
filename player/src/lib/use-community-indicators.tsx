"use client";

import { useEffect, useState } from "react";
import type { IndicatorId } from "./indicators";

/// Hook qui fetch la moyenne des indicateurs communauté depuis
/// /api/indicators/community-mean. Cache module-level pour éviter les
/// re-fetches inutiles (la donnée bouge sur des semaines, pas des minutes).
/// Le cache HTTP côté serveur (s-maxage=1h) protège la DB par ailleurs.

export type CommunityIndicator = {
  id: IndicatorId;
  label: string;
  signedScore: number | null;
  count: number;
};

type CacheEntry = {
  data: CommunityIndicator[];
  fetchedAt: number;
};

/// Cache module-level (durée de vie : tab session). Stocke la dernière
/// réponse pour éviter de re-fetch à chaque mount.
let cache: CacheEntry | null = null;
let inflight: Promise<CommunityIndicator[] | null> | null = null;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

export function useCommunityIndicators(): CommunityIndicator[] | null {
  const [data, setData] = useState<CommunityIndicator[] | null>(() => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return cache.data;
    }
    return null;
  });

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return;
    let cancelled = false;
    const promise =
      inflight ??
      fetch("/api/indicators/community-mean")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j || !Array.isArray(j.indicators)) return null;
          cache = { data: j.indicators, fetchedAt: Date.now() };
          return j.indicators as CommunityIndicator[];
        })
        .catch(() => null)
        .finally(() => {
          inflight = null;
        });
    inflight = promise;
    promise.then((d) => {
      if (!cancelled && d) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
