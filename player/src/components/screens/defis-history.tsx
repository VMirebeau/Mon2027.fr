"use client";

/// Page "Mes défis" (mobile) — historique complet des défis envoyés et reçus
/// joués par l'utilisateur, sans cap. Accessible depuis "Voir les N autres →"
/// sur la page de création de défi (étape A1).
///
/// Structure identique à la prévisualisation A1, mais sans `cap` — toutes
/// les entrées sont rendues. Pas de filtre / tri custom pour l'instant :
/// l'ordre "plus récent d'abord" est suffisant et cohérent avec la preview.

import { useEffect, useState } from "react";
import { AppHeader } from "../ui-bits";
import { EmptyHint } from "../empty-hint";
import { MyDefisList } from "../my-defis-list";
import { ReceivedDefisList } from "../received-defis-list";
import { useProgress } from "@/lib/use-progress";
import type { NavTarget, Theme } from "@/lib/types";

export function DefisHistory({
  themes,
  onHome,
  onNavigate,
}: {
  themes: Theme[];
  onHome: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <AppHeader title="Mes défis" onBack={onHome} />
      <div style={{ padding: "0 16px 32px" }}>
        <DefisHistoryBody themes={themes} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/// Corps partagé entre mobile et desktop. Pas de cap sur les listes.
/// Les deux listes se cachent silencieusement quand elles sont vides
/// (cf. MyDefisList et ReceivedDefisList). Si les deux sont vides, on
/// rend un empty state — sinon l'utilisateur qui atterrit ici via nav
/// directe (ou via un bookmark) verrait une page totalement blanche.
export function DefisHistoryBody({
  themes,
  onNavigate,
  variant = "mobile",
}: {
  themes: Theme[];
  onNavigate?: (target: NavTarget) => void;
  variant?: "mobile" | "desktop";
}) {
  const large = variant === "desktop";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <MyDefisList themes={themes} large={large} />
      <ReceivedDefisList themes={themes} large={large} />
      <DefisHistoryEmptyHint onNavigate={onNavigate} />
    </div>
  );
}

/// Empty state autonome : s'affiche uniquement quand l'utilisateur n'a
/// AUCUN défi envoyé (GET /api/defis/mine = []) ET aucun défi reçu
/// (progress.challenges.received = []). On duplique le fetch /api/defis/mine
/// pour rester indépendant des composants liste — ils peuvent se cacher pour
/// des raisons orthogonales (loading, error), et on veut un signal "vide"
/// strict, pas "pas encore rendu".
function DefisHistoryEmptyHint({
  onNavigate,
}: {
  onNavigate?: (target: NavTarget) => void;
}) {
  const { progress, hydrated } = useProgress();
  const [sentCount, setSentCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/defis/mine", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ defis: unknown[] }>) : null))
      .then((j) => {
        if (cancelled) return;
        setSentCount(j ? j.defis.length : 0);
      })
      .catch(() => {
        if (!cancelled) setSentCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!hydrated || sentCount === null) return null;
  const receivedCount = progress.challenges.received.length;
  if (sentCount > 0 || receivedCount > 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <EmptyHint variant="block" title="Pas encore de défis.">
        Tes défis envoyés et ceux que tu joues apparaîtront ici.
        {onNavigate ? (
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={() => onNavigate("challenge")}
              className="btn-primary"
              style={{
                width: "auto",
                display: "inline-flex",
                padding: "12px 22px",
                fontSize: 15,
                fontStyle: "normal",
              }}
            >
              Créer un défi
            </button>
          </div>
        ) : null}
      </EmptyHint>
    </div>
  );
}
