"use client";

/// Liste des défis reçus joués par l'utilisateur courant. Affichée sous la
/// liste des défis envoyés sur la scène A1 du wizard de création de défi.
///
/// Source : `progress.challenges.received` (local, synchronisé via
/// UserSnapshot quand l'utilisateur est connecté). Alimenté par
/// `DefiPlayClient` au moment du submit d'une réponse — donc la liste
/// suit l'usage réel (pas besoin d'auth, fonctionne aussi pour les
/// utilisateurs purement clientId).
///
/// Symétrique de `MyDefisList` : même structure visuelle pour faciliter
/// la lecture côte-à-côte ; les KPI internes diffèrent (on compare le
/// score de l'utilisateur à celui de l'expéditeur, plutôt que le score
/// utilisateur au "meilleur" des amis).

import { useMemo } from "react";
import Link from "next/link";
import {
  CardTrashButton,
  DefiCardMini,
  DefiListSection,
} from "./defi-list-section";
import { useProgress } from "@/lib/use-progress";
import type { ReceivedChallenge } from "@/lib/progress";
import type { Theme } from "@/lib/types";

export function ReceivedDefisList({
  themes,
  large,
  cap,
  onSeeMore,
}: {
  /// Catalogue des thèmes — utilisé pour résoudre `themeId` → couleur de
  /// pastille dans chaque carte. Si absent, la pastille tombe sur la
  /// couleur neutre `ink-mute`.
  themes: Theme[];
  /// Layout desktop : grille horizontale au lieu de pile verticale.
  large?: boolean;
  /// Limite d'affichage. Si non fourni ou ≤ 0, on affiche tout. Quand
  /// fourni, on montre les `cap` plus récents et un bouton "Voir plus →"
  /// est affiché ssi le total dépasse `cap`.
  cap?: number;
  /// Callback du bouton "Voir plus →" — navigue vers la scène
  /// `defis-history`. Si absent, le bouton n'est pas rendu.
  onSeeMore?: () => void;
}) {
  const { progress, hydrated, removeReceivedDefi } = useProgress();

  const themesById = useMemo(() => {
    const m = new Map<string, Theme>();
    for (const t of themes) m.set(t.id, t);
    return m;
  }, [themes]);

  // Liste triée du plus récent au plus ancien. progress.challenges.received
  // est déjà censé être trié (le mutator insère en tête), mais on re-trie
  // défensivement au cas où un client legacy aurait laissé un ordre cassé.
  const items = useMemo(() => {
    if (!hydrated) return [];
    return [...progress.challenges.received].sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }, [progress, hydrated]);

  // États sans rendu : pré-hydratation + liste vide. On ne pollue jamais
  // l'écran pour les nouveaux utilisateurs — c'est purement une affordance
  // pour ceux qui ont déjà joué au moins un défi reçu.
  if (!hydrated) return null;
  if (items.length === 0) return null;

  const total = items.length;
  const effectiveCap = typeof cap === "number" && cap > 0 ? cap : total;
  const visible = items.slice(0, effectiveCap);
  const hasMore = total > visible.length;

  return (
    <DefiListSection
      subtitle="Défis reçus"
      title={`${total} joué${total > 1 ? "s" : ""}`}
      large={large}
      remainingCount={hasMore ? total - visible.length : 0}
      onSeeMore={onSeeMore}
    >
      {visible.map((d) => (
        <ReceivedDefiCard
          key={d.id}
          d={d}
          themesById={themesById}
          onRemove={() => removeReceivedDefi(d.id)}
        />
      ))}
    </DefiListSection>
  );
}

function ReceivedDefiCard({
  d,
  themesById,
  onRemove,
}: {
  d: ReceivedChallenge;
  themesById: Map<string, Theme>;
  /// Soft-delete : retire la carte de l'historique local. Pas de confirm
  /// pour les défis reçus — l'opération est locale et réversible (le défi
  /// reste accessible via son lien d'origine si l'utilisateur le retrouve).
  onRemove: () => void;
}) {
  const themeLabel = d.themeLabel ?? "Un défi";
  const themeColor =
    d.themeId && themesById.get(d.themeId)?.color
      ? themesById.get(d.themeId)!.color
      : "var(--ink-mute)";

  const total = d.total ?? d.questionIds.length ?? 0;
  // Verdict relatif : compare score user et score créateur. On garde le ton
  // non-compétitif (cf. recap qui ne parle pas de "gagnant") : "Mieux que",
  // "Comme", "Moins que" reste factuel sans triomphalisme.
  const myScore = d.myScore;
  const verdict =
    myScore === null
      ? null
      : myScore > d.opponentScore
        ? { label: "Mieux que l'expéditeur", color: "var(--signal-good)" }
        : myScore === d.opponentScore
          ? { label: "Comme l'expéditeur", color: "var(--ink-soft)" }
          : { label: "Moins que l'expéditeur", color: "var(--ink-mute)" };

  const dateLabel = formatDateShort(d.createdAt);

  return (
    <Link
      href={`/d/${d.id}/resultats?from=app`}
      style={{
        position: "relative",
        display: "block",
        textDecoration: "none",
        color: "inherit",
        background: "var(--paper)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        padding: "12px 14px",
        // Padding-right pour ne pas se faire chevaucher par le bouton
        // poubelle posé en absolute top-right.
        paddingRight: 38,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--rule)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--rule-soft)";
      }}
    >
      <CardTrashButton
        ariaLabel="Retirer ce défi de mon historique"
        onActivate={onRemove}
      />
      {/* Structure d'en-tête constante (cf. my-defis-list pour la rationale) :
          thème en eyebrow mono toujours, puis ligne titre (réel ou
          placeholder italique). Garde l'alignement vertical des KPIs
          entre cartes avec/sans titre. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: themeColor,
            flexShrink: 0,
          }}
          aria-hidden
        />
        <div
          className="mono"
          style={{
            fontWeight: 500,
            fontSize: 10.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {themeLabel}
        </div>
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: "var(--font-display)",
          fontWeight: d.title ? 600 : 500,
          fontStyle: d.title ? "normal" : "italic",
          fontSize: 15,
          letterSpacing: "-0.01em",
          color: d.title ? "var(--ink)" : "var(--ink-mute)",
          lineHeight: 1.3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {/* Fallback dérivé de la date où l'utilisateur a joué le défi
            (createdAt local = playedAt). Plus informatif qu'un placeholder
            générique pour distinguer plusieurs défis reçus sans titre. */}
        {d.title ?? `Défi du ${formatDateShort(d.createdAt)}`}
      </div>

      <div
        className="mono"
        style={{
          marginTop: 6,
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}
      >
        Envoyé par <span style={{ color: "var(--ink)" }}>{d.from}</span>
      </div>

      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <DefiCardMini label="Toi" value={`${myScore ?? "–"}/${total}`} />
        <DefiCardMini
          label={`Score de ${d.from.slice(0, 12)}`}
          value={`${d.opponentScore}/${total}`}
        />
      </div>

      <div
        className="mono"
        style={{
          marginTop: 10,
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{dateLabel}</span>
        <span style={{ color: verdict?.color ?? "var(--ink-soft)" }}>
          {verdict?.label ?? "Voir →"}
        </span>
      </div>
    </Link>
  );
}

function formatDateShort(epochMs: number): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
    }).format(new Date(epochMs));
  } catch {
    return "";
  }
}
