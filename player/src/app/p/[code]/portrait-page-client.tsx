"use client";

/// Composant client de la page /p/[code]. Construit un radar isolé à partir
/// des scores décodés depuis l'URL. Pas d'interaction avec la progression
/// locale du visiteur — c'est une consultation, pas un dashboard.
///
/// Mise en page :
///   - En-tête éditorial cohérent avec les pages DT
///   - Le radar grand format au centre
///   - 3 indicateurs les plus marqués listés en dessous (texte verbal)
///   - CTA proéminent "Génère ton portrait →" qui amène sur /?s=indicators

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { IndicatorRadar } from "@/components/indicator-radar";
import {
  INDICATORS,
  INDICATOR_IDS,
  type IndicatorId,
} from "@/lib/indicators";
import { useProgress } from "@/lib/use-progress";
import {
  computeAllIndicatorBiases,
  computeLucidityScore,
} from "@/lib/progress-stats";
import type { PortraitCodePayload } from "@/lib/portrait-url";
import type { IndicatorBiasRow } from "@/lib/progress-stats";
import type { Question } from "@/lib/types";

export function PortraitPageClient({
  code: _code,
  payload,
  questions,
}: {
  code: string;
  payload: PortraitCodePayload;
  questions: Question[];
}) {
  // Convertit le payload (scores Record) en IndicatorBiasRow[] dans l'ordre
  // canonique INDICATOR_IDS, qui est ce qu'attend IndicatorRadar.
  const biases = useMemo<IndicatorBiasRow[]>(
    () =>
      INDICATOR_IDS.map((id) => {
        const meta = INDICATORS[id];
        const score = payload.scores[id] ?? 0;
        return {
          id,
          label: meta.label,
          subjectShort: meta.subjectShort,
          signedScore: score,
          // count élevé pour passer le seuil minSamples côté radar — le code
          // partagé est par construction "déjà mesuré", on a confiance dans
          // les scores. Si on mettait count=0, le radar les ignorerait.
          count: 9,
          qualitative: qualitativeOf(score),
        } satisfies IndicatorBiasRow;
      }),
    [payload.scores],
  );
  // Score Lucidité de la personne qui partage : on PRIVILÉGIE celui
  // encodé dans le code URL (calculé canoniquement côté player du sharer)
  // pour zéro divergence avec ce qu'il voit chez lui. Fallback recalcul
  // si code legacy 10 chars.
  const sharedLucidity = useMemo(() => {
    if (payload.lucidity != null) return payload.lucidity;
    return computeLucidityScore(biases)?.score ?? null;
  }, [payload.lucidity, biases]);

  // Portrait du VISITEUR (s'il a déjà joué sur cet appareil). On le calcule
  // mais on ne l'affiche QUE si le visiteur clique explicitement sur
  // "Comparer avec mon portrait" — sinon c'est intrusif (le user qui
  // partage son propre lien verrait "Toi" automatiquement, perception
  // confuse).
  const { progress, hydrated } = useProgress();
  const visitorBiasesAvailable = useMemo<IndicatorBiasRow[] | null>(() => {
    if (!hydrated) return null;
    const all = computeAllIndicatorBiases(progress, questions);
    const measured = all.filter((b) => b.count >= 3);
    if (measured.length < 3) return null;
    return all;
  }, [progress, questions, hydrated]);
  const visitorLucidityAvailable = useMemo(
    () =>
      visitorBiasesAvailable
        ? computeLucidityScore(visitorBiasesAvailable)?.score ?? null
        : null,
    [visitorBiasesAvailable],
  );
  // Toggle de comparaison — off par défaut. On expose le visiteur (radar
  // + score "Toi") seulement quand cet état est true.
  const [comparing, setComparing] = useState(false);
  const visitorBiases = comparing ? visitorBiasesAvailable : null;
  const visitorLucidity = comparing ? visitorLucidityAvailable : null;

  // Tri par magnitude décroissante pour surfacer les biais les plus marqués
  // dans la liste textuelle sous le radar.
  const notable = useMemo(
    () =>
      [...biases]
        .filter((b) => Math.abs(b.signedScore) >= 0.2)
        .sort((a, b) => Math.abs(b.signedScore) - Math.abs(a.signedScore))
        .slice(0, 3),
    [biases],
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--cream)",
        padding: "40px 24px 64px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1200 }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
            marginBottom: 12,
          }}
        >
          Portrait civique partagé
        </div>

        {/* Layout principal : 2 colonnes sur grand écran (texte+stats à
            gauche, radar à droite), stack vertical sur mobile. Le titre et
            la description vivent dans la colonne gauche pour mieux équilibrer
            le poids visuel — sinon le radar dominait sans contrepoids. */}
        <div className="portrait-page-layout">
          <style>{`
            .portrait-page-layout {
              display: grid;
              grid-template-columns: minmax(0, 1fr);
              gap: 28px;
            }
            @media (min-width: 900px) {
              .portrait-page-layout {
                grid-template-columns: minmax(360px, 480px) minmax(0, 1fr);
                align-items: center;
                gap: 56px;
              }
            }
          `}</style>

          {/* Colonne gauche : titre + description + score + biais + toggle compare */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(32px, 4vw, 48px)",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                margin: 0,
                color: "var(--ink)",
                textWrap: "balance",
              }}
            >
              Comment cette personne voit la{" "}
              <span style={{ color: "var(--coral)" }}>France</span>.
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--ink-soft)",
                textWrap: "pretty",
              }}
            >
              Le cercle médian est la réalité. Plus le polygone sort vers
              l&apos;extérieur sur une dimension, plus elle est surestimée.
              Plus il rentre, plus elle est sous-estimée.
            </p>

            {/* Scores Lucidité — "Cette personne" toujours, "Toi" si compare actif */}
            <div
              style={{
                display: "flex",
                gap: 32,
                flexWrap: "wrap",
              }}
            >
              {sharedLucidity != null ? (
                <ScoreBlock
                  eyebrow="Cette personne"
                  value={sharedLucidity}
                  color="var(--coral)"
                />
              ) : null}
              {visitorLucidity != null ? (
                <ScoreBlock
                  eyebrow="Toi"
                  value={visitorLucidity}
                  color="var(--ink)"
                />
              ) : null}
            </div>

            {/* Liste des biais notables */}
            {notable.length > 0 ? (
              <div>
                <div
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                    marginBottom: 10,
                    fontWeight: 600,
                  }}
                >
                  Les biais les plus marqués
                </div>
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {notable.map((b) => {
                    const over = b.signedScore > 0;
                    const verb = over
                      ? Math.abs(b.signedScore) >= 0.5
                        ? "surestime nettement"
                        : "surestime"
                      : Math.abs(b.signedScore) >= 0.5
                        ? "sous-estime nettement"
                        : "sous-estime";
                    const color = over
                      ? "var(--signal-bad)"
                      : "var(--signal-mid)";
                    return (
                      <li
                        key={b.id}
                        style={{
                          fontSize: 15.5,
                          color: "var(--ink)",
                          lineHeight: 1.45,
                        }}
                      >
                        <strong style={{ fontWeight: 600, color }}>
                          {verb}
                        </strong>{" "}
                        {b.subjectShort}.
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Toggle "Comparer avec mon portrait" — opt-in uniquement.
                Affiché seulement si le visiteur a effectivement un portrait
                local (≥3 axes mesurés). Sinon ça n'a pas de sens. */}
            {visitorBiasesAvailable ? (
              <button
                type="button"
                onClick={() => setComparing((c) => !c)}
                style={{
                  alignSelf: "flex-start",
                  background: comparing ? "var(--ink)" : "transparent",
                  color: comparing ? "var(--cream-warm)" : "var(--ink)",
                  border: "1.5px solid var(--ink)",
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background var(--t-base), color var(--t-base)",
                }}
              >
                <Users size={15} strokeWidth={2.2} aria-hidden />
                {comparing ? "Masquer ma comparaison" : "Comparer avec mon portrait"}
              </button>
            ) : null}
          </div>

          {/* Colonne droite : la carte radar */}
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule-soft)",
              borderRadius: 18,
              padding: "28px 24px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ width: "100%", maxWidth: 560 }}>
              <IndicatorRadar
                biases={biases}
                community={visitorBiases ?? undefined}
                minSamples={1}
              />
            </div>
            {visitorBiases ? (
              <div
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 13,
                  color: "var(--ink-mute)",
                  textAlign: "center",
                  maxWidth: 460,
                  lineHeight: 1.5,
                }}
              >
                Son polygone en{" "}
                <span style={{ color: "var(--coral)" }}>coral</span>, le tien
                en <span style={{ opacity: 0.7 }}>pointillés</span>. Où
                divergez-vous le plus ?
              </div>
            ) : null}
          </div>
        </div>

        {/* CTA primaire — varie selon que le visiteur a déjà un portrait
            (continue à jouer pour affiner) ou non (en démarrer un). */}
        <div
          style={{
            marginTop: 36,
            padding: "24px 20px",
            background: "var(--paper)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 16,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
              marginBottom: 8,
            }}
          >
            {visitorBiasesAvailable
              ? "Continue à affiner ton portrait."
              : "Et toi, où te trompes-tu ?"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--ink-soft)",
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            {visitorBiasesAvailable
              ? "Plus tu joues, plus ton portrait s'affine sur les 9 dimensions."
              : "Joue quelques questions sourcées sur la France et découvre ton portrait sur les 9 dimensions."}
          </div>
          <Link
            href={visitorBiasesAvailable ? "/?s=profile" : "/?s=daily"}
            style={{
              display: "inline-block",
              background: "var(--ink)",
              color: "var(--cream-warm)",
              padding: "12px 24px",
              borderRadius: 999,
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              border: "1.5px solid var(--ink)",
            }}
          >
            {visitorBiasesAvailable
              ? "Voir mon portrait →"
              : "Commencer Mon2027 →"}
          </Link>
        </div>
      </div>
    </div>
  );
}

/// Bloc score "Cette personne" / "Toi" affiché côte à côte au-dessus du
/// radar quand le visiteur a déjà joué — comparaison directe en un coup
/// d'œil. Plus simple que LucidityBadge (pas de sub "X / Y dimensions")
/// car on est en mode "show, don't tell".
function ScoreBlock({
  eyebrow,
  value,
  color,
}: {
  eyebrow: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          fontWeight: 600,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          fontFamily: "var(--font-display)",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 44,
            letterSpacing: "-0.04em",
            color,
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        <span style={{ fontWeight: 500, fontSize: 16, color: "var(--ink-soft)" }}>
          / 100
        </span>
      </div>
    </div>
  );
}

/// Identique au mapping côté progress-stats.ts. Dupliqué ici pour éviter
/// d'importer une fonction non-exportée (l'API publique de progress-stats
/// expose IndicatorBiasRow, pas qualitativeOf).
function qualitativeOf(
  score: number,
): IndicatorBiasRow["qualitative"] {
  if (score >= 0.5) return "forte_sur";
  if (score >= 0.2) return "sur";
  if (score <= -0.5) return "forte_sous";
  if (score <= -0.2) return "sous";
  return "juste";
}
