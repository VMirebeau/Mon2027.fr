"use client";

import { useState } from "react";
import { Logo } from "../ui-bits";
import { EmailLink } from "../email-link";
import {
  ORGANISMS_TOTAL,
  SOURCE_FAMILIES,
  type SourceFamily,
} from "@/lib/methode-sources";
import { SuggestionTrigger } from "../suggestion-modal";

export function Methode({
  onHome,
  totalSources,
}: {
  onHome: () => void;
  /// Sources citées par les questions publiées (calcul serveur, le même que
  /// celui affiché sur Découvrir).
  totalSources: number;
}) {
  return (
    <div
      className="scroll"
      style={{
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "32px 24px 24px" }}>
        <button
          onClick={onHome}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
          }}
          aria-label="Retour à l'accueil"
        >
          <Logo />
        </button>
      </div>

      <div style={{ padding: "0 24px 32px", flex: 1 }}>
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
          Méthode · Sources
        </div>
        <h1
          className="display"
          style={{
            fontWeight: 700,
            fontSize: 36,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            margin: 0,
            textWrap: "balance",
          }}
        >
          Comment on choisit{" "}
          <span style={{ color: "var(--coral)" }}>les chiffres</span>.
        </h1>
        <p
          style={{
            marginTop: 16,
            fontSize: 16,
            lineHeight: 1.5,
            color: "var(--ink-soft)",
          }}
        >
          Mon2027 ne propose pas d&apos;opinion. On part de chiffres publics,
          vérifiables, et on explique ce qu&apos;ils disent, surtout quand
          l&apos;intuition se trompe.
        </p>

        <Section title="D'où viennent les données ?">
          <p>
            Toutes les réponses du quiz sont sourcées sur des organismes
            publics, en privilégiant les producteurs primaires.
          </p>

          <div
            className="mono"
            style={{
              marginTop: 16,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
              display: "flex",
              gap: 16,
              alignItems: "baseline",
            }}
          >
            <span>
              <strong
                style={{ color: "var(--ink)", fontSize: 18, fontWeight: 700 }}
              >
                {totalSources}
              </strong>{" "}
              sources citées
            </span>
            <span>
              <strong
                style={{ color: "var(--ink)", fontSize: 18, fontWeight: 700 }}
              >
                {ORGANISMS_TOTAL}
              </strong>{" "}
              organismes
            </span>
          </div>

          {SOURCE_FAMILIES.map((family) => (
            <FamilyCard key={family.id} family={family} />
          ))}

          <p style={{ marginTop: 16, fontSize: 13, color: "var(--ink-mute)" }}>
            Chaque question affiche ses sources avec un lien direct vers le
            document d&apos;origine.
          </p>
        </Section>

        <Section title="Le workflow rédactionnel">
          <Numbered
            items={[
              [
                "Brouillon IA",
                "Une IA propose un chiffre, une formulation, une fourchette.",
              ],
              [
                "Source primaire",
                "On remonte au document INSEE/Eurostat, on recalcule si besoin.",
              ],
              [
                "Triangulation",
                "Quand possible, on confronte avec une seconde source indépendante.",
              ],
              [
                "Validation humaine",
                "Un relecteur valide formulation, fourchette, cohérence, et le filet non-partisan.",
              ],
            ]}
          />
        </Section>

        <Section title="Open data, auditabilité">
          <p>
            Chaque question publie ses sources avec lien direct. Le code de
            l&apos;app est ouvert. Toute personne peut vérifier ou contester.
          </p>
        </Section>

        <Section title="Signaler une erreur, proposer une question">
          <p>
            Une donnée fausse, périmée, biaisée ? Signale-la avec le lien placé
            sous les sources de chaque question : elle arrive directement chez
            les contributeurs, qui vérifient source en main. Tu peux aussi
            écrire à{" "}
            <EmailLink
              style={{
                color: "var(--ink)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            />
            .
          </p>
          <SuggestionTrigger label="Proposer une nouvelle question →" />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2
        className="display"
        style={{
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-soft)" }}>
        {children}
      </div>
    </section>
  );
}

function FamilyCard({ family }: { family: SourceFamily }) {
  const [open, setOpen] = useState(false);
  const visible = family.organisms.slice(0, family.visibleCount);
  const hidden = family.organisms.slice(family.visibleCount);
  const totalCitations = family.organisms.reduce((s, o) => s + o.count, 0);

  return (
    <div
      style={{
        marginTop: 14,
        padding: "14px 14px 12px",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        background: "var(--cream-warm)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>
          {family.title}
        </div>
        <div
          className="mono"
          style={{ fontSize: 11, color: "var(--ink-mute)", flexShrink: 0 }}
        >
          {totalCitations} cit.
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: "var(--ink-soft)",
          marginTop: 4,
        }}
      >
        {family.tagline}
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {visible.map((o, i) => (
          <Chip key={o.label} label={o.label} count={o.count} highlight={i === 0} />
        ))}
        {hidden.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              padding: "5px 10px",
              border: "1px dashed var(--rule-soft)",
              borderRadius: 999,
              background: "transparent",
              color: "var(--ink-mute)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {open ? "Replier" : `+ ${hidden.length} autres`}
          </button>
        )}
      </div>
      {open && hidden.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {hidden.map((o) => (
            <Chip key={o.label} label={o.label} count={o.count} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  count,
  highlight,
}: {
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        background: highlight ? "var(--coral)" : "var(--paper)",
        color: highlight ? "white" : "var(--ink)",
        border: highlight ? 0 : "1px solid var(--rule-soft)",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.2,
      }}
    >
      {label}
      <span
        className="mono"
        style={{
          fontSize: 10,
          opacity: highlight ? 0.85 : 0.55,
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </span>
  );
}

function Numbered({ items }: { items: [string, string][] }) {
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0, counterReset: "step" }}>
      {items.map(([title, desc], i) => (
        <li
          key={title}
          style={{
            display: "flex",
            gap: 14,
            padding: "12px 0",
            borderBottom:
              i === items.length - 1 ? 0 : "1px solid var(--rule-soft)",
          }}
        >
          <span
            className="mono"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--ink)",
              color: "var(--yellow)",
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {i + 1}
          </span>
          <div>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{title}</div>
            <div style={{ marginTop: 2, fontSize: 14 }}>{desc}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
