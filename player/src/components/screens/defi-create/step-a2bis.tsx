"use client";

/// Étape A2bis du flow Défier — sélection multi parmi les favoris.
/// L'utilisateur coche entre FAV_MIN et FAV_MAX favoris ; on lance le jeu
/// avec exactement cette sélection (pas de tirage aléatoire).

import { useMemo, useState } from "react";
import { CtaBar, DefiPrimaryBtn, DI } from "../../defi-bits";
import { useProgress } from "@/lib/use-progress";
import { listFavorites } from "@/lib/progress";
import type { Question } from "@/lib/types";
import { FAV_MAX, FAV_MIN } from "./shared";

export function StepA2bisBody({
  publishedQuestions,
  onPickFavorites,
  onBackToSource,
  large,
}: {
  publishedQuestions: Question[];
  onPickFavorites: (picked: Question[]) => void;
  /// Lien "← changer de source" pour desktop (mobile a son AppHeader).
  onBackToSource?: () => void;
  large?: boolean;
}) {
  const { progress, hydrated } = useProgress();
  // Memoize la Map des questions par id (~400 entrées). Sinon elle est
  // reconstruite à chaque render, et le wizard fait beaucoup de re-renders
  // (toggle case, recherche, etc.).
  const byId = useMemo(
    () => new Map(publishedQuestions.map((q) => [q.id, q])),
    [publishedQuestions],
  );
  // On filtre les ids qui ne correspondent à aucune question publiée
  // (q dépubliée depuis l'ajout en favori). Évite d'envoyer un défi cassé.
  const favs = useMemo(() => {
    const ids = hydrated ? listFavorites(progress) : [];
    return ids
      .map((id) => byId.get(id))
      .filter((q): q is Question => q !== undefined);
  }, [byId, hydrated, progress]);

  // Sélection : par défaut, les FAV_MAX premiers favoris (les plus récents)
  // sont cochés, dans la limite des dispos. L'utilisateur peut décocher.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(favs.slice(0, FAV_MAX).map((q) => q.id)),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < FAV_MAX) {
        next.add(id);
      }
      // Si on est déjà à FAV_MAX et qu'on essaie d'en ajouter, no-op silent.
      return next;
    });
  }

  const count = selected.size;
  const valid = count >= FAV_MIN && count <= FAV_MAX;

  function launch() {
    if (!valid) return;
    const picked = favs.filter((q) => selected.has(q.id));
    onPickFavorites(picked);
  }

  return (
    <div
      style={{
        padding: large ? "8px 0 0" : "4px 18px 24px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {large ? (
        <>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 40,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              textWrap: "balance",
              maxWidth: 720,
            }}
          >
            Quelles{" "}
            <span style={{ color: "var(--coral)" }}>questions</span> à défier ?
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 16,
              color: "var(--ink-soft)",
              lineHeight: 1.5,
              maxWidth: 640,
            }}
          >
            Coche les favoris à envoyer (jusqu&apos;à {FAV_MAX}). Ton ami·e
            jouera exactement ces questions, dans l&apos;ordre que tu vois ici.
          </div>
          {onBackToSource ? (
            <button
              type="button"
              onClick={onBackToSource}
              style={{
                marginTop: 12,
                alignSelf: "flex-start",
                background: "transparent",
                border: 0,
                padding: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              ← Changer de source
            </button>
          ) : null}
        </>
      ) : (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink-mute)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Coche tes favoris · jusqu&apos;à {FAV_MAX}
        </div>
      )}

      {/* Bandeau compteur — vert si OK, ambre sinon. */}
      <div
        suppressHydrationWarning
        style={{
          marginTop: large ? 24 : 4,
          padding: "10px 14px",
          background: valid
            ? "rgba(74,143,92,0.10)"
            : "rgba(216,154,62,0.10)",
          border: valid
            ? "1px solid rgba(74,143,92,0.3)"
            : "1px solid rgba(216,154,62,0.3)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: valid ? "var(--signal-good)" : "var(--signal-mid)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {count} sélectionnée{count > 1 ? "s" : ""} · max {FAV_MAX}
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 18,
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink)",
          }}
        >
          {count}
        </span>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {favs.map((q) => (
          <FavoriteSelectRow
            key={q.id}
            q={q}
            selected={selected.has(q.id)}
            atMax={count >= FAV_MAX && !selected.has(q.id)}
            onToggle={() => toggle(q.id)}
          />
        ))}
      </div>

      {large ? (
        <div style={{ marginTop: 32, maxWidth: 320 }}>
          <DefiPrimaryBtn onClick={launch} disabled={!valid}>
            Jouer les {count} question{count > 1 ? "s" : ""}
            <DI.Arrow size={16} />
          </DefiPrimaryBtn>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 24 }} />
          <CtaBar>
            <DefiPrimaryBtn onClick={launch} disabled={!valid}>
              Jouer les {count} question{count > 1 ? "s" : ""}
              <DI.Arrow size={16} />
            </DefiPrimaryBtn>
          </CtaBar>
        </>
      )}
    </div>
  );
}

function FavoriteSelectRow({
  q,
  selected,
  atMax,
  onToggle,
}: {
  q: Question;
  selected: boolean;
  /// Le max global est atteint et cette row n'est pas déjà cochée : la cocher
  /// serait refusé silencieusement, donc on grise pour signifier "indispo".
  atMax: boolean;
  onToggle: () => void;
}) {
  const muted = atMax && !selected;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={muted}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        background: selected ? "var(--yellow)" : "var(--cream-warm)",
        border: selected
          ? "1.5px solid var(--ink)"
          : "1.5px solid var(--rule-soft)",
        borderRadius: 14,
        textAlign: "left",
        cursor: muted ? "not-allowed" : "pointer",
        opacity: muted ? 0.5 : 1,
        transition: "background 0.15s, border-color 0.15s",
        width: "100%",
        color: "inherit",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: selected ? "var(--ink)" : "transparent",
          border: `1.5px solid ${selected ? "var(--ink)" : "var(--rule)"}`,
          display: "grid",
          placeItems: "center",
          color: "var(--yellow)",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {selected ? <DI.Check size={12} /> : null}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: selected ? "var(--ink-soft)" : "var(--ink-mute)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 3,
          }}
        >
          {q.theme}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 13.5,
            letterSpacing: "-0.005em",
            lineHeight: 1.25,
            color: "var(--ink)",
          }}
        >
          {q.question}
        </div>
      </div>
    </button>
  );
}
