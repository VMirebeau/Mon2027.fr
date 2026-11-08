"use client";

/// Liste des défis créés par l'utilisateur courant, affichée en tête de la
/// scène "Défier" (step A1). Permet au militant de voir l'état de ses envois
/// (combien d'ami·e·s ont joué, score moyen) sans quitter le flow de création.
///
/// Source de vérité : GET /api/defis/mine. Authentifié via le cookie
/// httpOnly signé `mon2027_defi_client` (posé au POST /api/defis) ET/OU la
/// session user — donc rien à envoyer côté client, le cookie suit la requête.
///
/// Le composant n'affiche RIEN tant que le fetch n'est pas terminé ou que la
/// liste est vide : il ne pollue jamais l'écran d'entrée pour les nouveaux
/// utilisateurs. C'est uniquement une affordance pour les militants qui ont
/// déjà créé au moins un défi.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "./modal";
import {
  CardTrashButton,
  DefiCardMini,
  DefiListSection,
} from "./defi-list-section";
import type { DefiSummary } from "@/app/api/defis/mine/route";
import type { Theme } from "@/lib/types";
import { useUnseenDefis } from "@/lib/use-unseen-defis";

type FetchState =
  | { status: "loading" }
  | { status: "ok"; defis: DefiSummary[] }
  | { status: "error" };

export function MyDefisList({
  themes,
  large,
  cap,
  onSeeMore,
}: {
  themes: Theme[];
  /// Layout desktop : grille horizontale au lieu de pile verticale.
  large?: boolean;
  /// Limite d'affichage. Si non fourni ou ≤ 0, on affiche tout. Quand
  /// fourni, on montre les `cap` plus récents et un bouton "Voir plus →"
  /// est affiché ssi le total dépasse `cap`.
  cap?: number;
  /// Callback du bouton "Voir plus →" — typiquement, navigue vers la
  /// scène defis-history. Si absent, le bouton n'est pas rendu (la liste
  /// est tronquée silencieusement).
  onSeeMore?: () => void;
}) {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  /// Map par shortCode du nombre de réponses non vues. Source = polling
  /// UnseenDefisProvider monté dans AppShell. Mis à jour en temps réel sans
  /// re-fetcher la liste complète : seule la pastille de compteur sur
  /// chaque carte bouge entre deux ticks, le reste des KPIs reste sur la
  /// fetch initiale.
  const { byShortCode: unseenByShortCode } = useUnseenDefis();
  /// `shortCode` du défi sur lequel l'utilisateur a cliqué Supprimer.
  /// null = pas de modal ouverte. Une seule confirm à la fois — pas de
  /// queue : la suppression est rare, et l'utilisateur referme avant
  /// d'en lancer une autre.
  const [pendingDelete, setPendingDelete] = useState<DefiSummary | null>(null);
  /// État du DELETE en cours pour donner un feedback ("Suppression…")
  /// + désactiver le bouton confirm pendant le round-trip.
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/defis/${pendingDelete.shortCode}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        setDeleteError(`Suppression refusée (${res.status})`);
        setDeleting(false);
        return;
      }
      // Update optimiste/post-effect : on retire l'entrée de la liste
      // affichée. Pas de re-fetch — la source de vérité est le serveur
      // et on vient juste de lui dire "delete", donc on peut faire
      // confiance localement.
      setState((s) =>
        s.status === "ok"
          ? {
              status: "ok",
              defis: s.defis.filter((x) => x.shortCode !== pendingDelete.shortCode),
            }
          : s,
      );
      setPendingDelete(null);
      setDeleting(false);
    } catch {
      setDeleteError("Réseau indisponible. Réessaie dans un instant.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/defis/mine", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ defis: DefiSummary[] }>) : null))
      .then((j) => {
        if (cancelled) return;
        if (!j) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ok", defis: j.defis });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Index themes par id pour résoudre themeId → label dans chaque carte.
  const themesById = useMemo(() => {
    const m = new Map<string, Theme>();
    for (const t of themes) m.set(t.id, t);
    return m;
  }, [themes]);

  // États sans rendu : loading initial + liste vide. Dans les deux cas, on
  // ne pollue pas l'écran d'entrée du wizard — le militant voit directement
  // les deux cartes "Sur tes favoris / Sur un thème".
  if (state.status === "loading") return null;
  if (state.status === "error") return null;
  if (state.defis.length === 0) return null;

  const total = state.defis.length;
  const totalResponses = state.defis.reduce((s, d) => s + d.responsesCount, 0);

  // Cap d'affichage : si fourni et < total, on tronque + on rend le
  // "Voir plus →" en pied de section. Sans cap (ou ≤ 0), on rend tout.
  const effectiveCap = typeof cap === "number" && cap > 0 ? cap : total;
  const visibleDefis = state.defis.slice(0, effectiveCap);
  const hasMore = total > visibleDefis.length;

  return (
    <>
      <DefiListSection
        subtitle="Défis envoyés"
        title={
          <>
            {total} envoyé{total > 1 ? "s" : ""}{" "}
            <span style={{ color: "var(--ink-soft)", fontWeight: 500 }}>
              · {totalResponses} réponse{totalResponses === 1 ? "" : "s"}
            </span>
          </>
        }
        large={large}
        remainingCount={hasMore ? total - visibleDefis.length : 0}
        onSeeMore={onSeeMore}
      >
        {visibleDefis.map((d) => (
          <DefiCard
            key={d.shortCode}
            d={d}
            themesById={themesById}
            unseenCount={unseenByShortCode[d.shortCode] ?? 0}
            onRequestDelete={() => setPendingDelete(d)}
          />
        ))}
      </DefiListSection>

      <Modal
        open={pendingDelete !== null}
        onClose={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
        ariaLabel="Confirmer la suppression du défi"
        size="sm"
      >
        <h3
          style={{
            margin: "0 0 12px",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Supprimer ce défi&nbsp;?
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--ink-soft)",
          }}
        >
          Le lien <strong>deviendra inaccessible</strong> pour les ami·e·s
          qui ne l&apos;ont pas encore joué. Les réponses déjà reçues seront
          aussi effacées. Cette action est définitive.
        </p>
        {deleteError ? (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "rgba(199,93,93,0.08)",
              border: "1px solid rgba(199,93,93,0.3)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--signal-bad)",
            }}
          >
            {deleteError}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 22,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (deleting) return;
              setPendingDelete(null);
              setDeleteError(null);
            }}
            disabled={deleting}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid var(--rule)",
              background: "transparent",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 14,
              color: "var(--ink)",
              cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: 0,
              background: "var(--signal-bad)",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 14,
              color: "var(--cream-warm)",
              cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </Modal>
    </>
  );
}

function DefiCard({
  d,
  themesById,
  unseenCount,
  onRequestDelete,
}: {
  d: DefiSummary;
  themesById: Map<string, Theme>;
  /// Nombre de réponses non encore vues par le créateur pour CE défi.
  /// > 0 → pastille rouge avec compteur en coin de la carte. Polling
  /// UnseenDefisProvider : la valeur se met à jour automatiquement (toutes
  /// les 60 s ou au retour focus) sans re-render de la liste entière.
  unseenCount: number;
  /// Click sur la poubelle : ouvre la confirm modal côté parent (la
  /// suppression réelle est gérée par MyDefisList). Le parent doit faire
  /// confiance que stopPropagation est appliqué côté carte.
  onRequestDelete: () => void;
}) {
  // Le serveur calcule themeLabel à partir des thèmes réels des questions :
  // soit le nom du thème commun (ex. "Économie"), soit "Questions diverses"
  // si plusieurs thèmes. Indépendant de l'origine (favoris / thème / replay)
  // — c'est le contenu qui compte pour le destinataire et l'expéditeur.
  const themeLabel = d.themeLabel;
  const themeColor = d.themeId
    ? themesById.get(d.themeId)?.color ?? "var(--ink-mute)"
    : "var(--ink-mute)";

  const dateLabel = formatDateShort(d.createdAt);

  return (
    <Link
      href={`/d/${d.shortCode}/resultats?from=app`}
      className="soft-card"
      style={{
        position: "relative",
        display: "block",
        textDecoration: "none",
        color: "inherit",
        /* override : background paper (pas cream-warm) pour distinguer
           les cards défi du reste de la home, et radius custom 14 — entre
           sm (12) et md (16). */
        background: "var(--paper)",
        borderRadius: 14,
        padding: "12px 14px",
        // Padding-right pour réserver la zone de la poubelle absolute.
        paddingRight: 38,
      }}
    >
      <CardTrashButton
        ariaLabel="Supprimer ce défi"
        onActivate={onRequestDelete}
      />
      {/* Structure d'en-tête constante quelle que soit la présence d'un
          titre : pastille + thème en eyebrow mono (toujours), puis une
          ligne titre (titre réel OU placeholder italique). Ça évite la
          désynchro verticale des KPIs entre cartes avec/sans titre. */}
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
        {/* Chip "N nouv." en pastille rouge, alignée à droite dans l'eyebrow
            avant le badge "Expiré" (les deux peuvent coexister : un défi
            expiré qui aurait reçu une dernière réponse avant cutoff). Le
            placement dans la ligne eyebrow (et pas en absolute) évite tout
            chevauchement avec la poubelle, et garde la pastille visible
            même quand le titre est tronqué sur 2 lignes. */}
        {unseenCount > 0 ? (
          <span
            aria-label={`${unseenCount} nouvelle${unseenCount > 1 ? "s" : ""} réponse${unseenCount > 1 ? "s" : ""} non lue${unseenCount > 1 ? "s" : ""}`}
            className="mono"
            style={{
              flexShrink: 0,
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--coral)",
              color: "var(--cream-warm)",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: "0.04em",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {unseenCount > 9 ? "9+" : unseenCount} nouv.
          </span>
        ) : null}
        {d.isExpired ? (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(26,26,26,0.06)",
              whiteSpace: "nowrap",
            }}
          >
            Expiré
          </span>
        ) : null}
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
          // Cap soft à 2 lignes : titre court tient sur 1, titre long
          // (max 60 chars côté serveur) sur 2 max. La hauteur de cette
          // zone est donc bornée — combinée à l'eyebrow constante, ça
          // donne une grille KPI alignée d'une carte à l'autre.
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {/* Fallback dérivé de la date de création — plus informatif que
            "Défi sans titre" générique : ça aide à distinguer plusieurs
            défis sans titre quand on en a accumulé (ex: "Défi du 16 mai"
            vs "Défi du 19 mai"). Le footer répète la date plus discrète. */}
        {d.title ?? `Défi du ${formatDateShort(d.createdAt)}`}
      </div>

      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <DefiCardMini
          label="Toi"
          value={`${d.creatorScore}/${d.questionsCount}`}
        />
        <DefiCardMini
          label="Joué"
          value={`${d.responsesCount}`}
          accent={d.responsesCount > 0 ? "good" : undefined}
        />
        <DefiCardMini
          label="Meilleur"
          value={
            d.responsesBestScore === null
              ? "–"
              : `${d.responsesBestScore}/${d.questionsCount}`
          }
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
        {/* "Voir résultats" implique qu'il y en a — quand personne n'a
            encore répondu, on dit la vérité ("Aucun résultat") tout en
            gardant le même lien : la page cible reste utile au créateur
            pour vérifier ce qu'il a partagé et re-partager. */}
        <span style={{ color: "var(--ink-soft)" }}>
          {d.responsesCount === 0 ? "Aucun résultat →" : "Voir résultats →"}
        </span>
      </div>
    </Link>
  );
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
    }).format(d);
  } catch {
    return "";
  }
}
