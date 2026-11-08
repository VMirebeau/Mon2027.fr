"use client";

import { useState } from "react";
import { AppFooter } from "./app-nav";
import { EmailLink } from "../email-link";
import type { NavTarget } from "@/lib/types";
import {
  ORGANISMS_TOTAL,
  SOURCE_FAMILIES,
  type SourceFamily,
} from "@/lib/methode-sources";
import { SuggestionTrigger } from "../suggestion-modal";

export function MethodeDT({
  onNavigate,
  totalSources,
}: {
  onNavigate?: (target: NavTarget) => void;
  /// Sources citées par les questions publiées (calcul serveur, le même que
  /// celui affiché sur Découvrir).
  totalSources: number;
}) {
  return (
    <>
      <div className="dt-page">
        <div className="dt-content">
          <div className="dt-doc">
            <div>
              <header className="dt-doc-hero">
                <div className="dt-doc-eyebrow">Méthode · Sources · Corrections</div>
                <h1>
                  Comment on choisit{" "}
                  <span style={{ color: "var(--coral)" }}>les chiffres</span>.
                </h1>
                <p className="dt-doc-lede">
                  Mon2027 ne propose pas d&apos;opinion. On part de chiffres
                  publics, vérifiables, et on explique ce qu&apos;ils disent,
                  surtout quand l&apos;intuition se trompe.
                </p>
              </header>

              <section className="dt-doc-section">
                <h2>D&apos;où viennent les données ?</h2>
                <p>
                  Toutes les réponses du quiz sont sourcées sur des organismes
                  publics, en privilégiant les producteurs primaires (instituts
                  de statistique nationaux ou internationaux). On ne s&apos;appuie
                  jamais sur une étude isolée, un article de presse ou une
                  publication militante pour fixer une valeur.
                </p>

                <div className="dt-src-stats">
                  <div className="dt-src-stat">
                    <strong>{totalSources}</strong>
                    <span>sources citées</span>
                  </div>
                  <div className="dt-src-stat">
                    <strong>{ORGANISMS_TOTAL}</strong>
                    <span>organismes différents</span>
                  </div>
                  <div className="dt-src-stat">
                    <strong>{SOURCE_FAMILIES.length}</strong>
                    <span>familles</span>
                  </div>
                </div>

                <div className="dt-src-families">
                  {SOURCE_FAMILIES.map((family) => (
                    <FamilyCard key={family.id} family={family} />
                  ))}
                </div>

                <p style={{ marginTop: 16, color: "var(--ink-mute)", fontSize: 14 }}>
                  Chaque question affiche ses sources avec un lien direct vers
                  le document d&apos;origine. La liste complète est ouverte :
                  toute personne peut vérifier ou contester un chiffre.
                </p>
              </section>

              <section className="dt-doc-section">
                <h2>Comment on rédige une question</h2>
                <p>
                  Chaque question passe par une chaîne en quatre étapes. Aucune
                  n&apos;est suffisante seule.
                </p>
                <h3>1. Brouillon assisté</h3>
                <p>
                  Une IA propose un premier jet : un chiffre marquant repéré
                  dans une publication officielle, une formulation grand public,
                  une fourchette de réponses plausibles. Ce brouillon n&apos;est
                  jamais publié tel quel.
                </p>
                <h3>2. Vérification de la source primaire</h3>
                <p>
                  La rédaction humaine remonte au document d&apos;origine
                  (INSEE, Eurostat, etc.), recalcule si nécessaire, et fixe la
                  valeur exacte avec son année de référence. Si le chiffre
                  dépend d&apos;une définition discutable (par ex. ce qu&apos;on
                  appelle un &laquo; pauvre &raquo; en France), on le signale
                  dans l&apos;explication.
                </p>
                <h3>3. Triangulation</h3>
                <p>
                  Quand c&apos;est possible, on confronte le chiffre à une
                  seconde source indépendante. Si les deux divergent
                  significativement, on choisit la source primaire et on note
                  l&apos;écart dans la fiche question.
                </p>
                <h3>4. Validation éditoriale</h3>
                <p>
                  Avant publication, un relecteur humain valide la formulation, la
                  fourchette, la cohérence pédagogique, et surtout vérifie
                  que la question ne flatte pas le biais militant de
                  l&apos;équipe. C&apos;est le filet de sécurité non-partisan
                  (voir ci-dessous).
                </p>
              </section>

              <section className="dt-doc-section">
                <h2>Open data, auditabilité</h2>
                <p>
                  Chaque question publie ses sources avec le lien direct vers le
                  document de référence. Le code source de l&apos;app est
                  ouvert. Toute personne peut vérifier un chiffre, contester une
                  formulation, ou proposer une amélioration.
                </p>
              </section>

              <section className="dt-doc-section">
                <h2>Signaler une erreur, proposer une question</h2>
                <p>
                  Si tu repères une donnée fausse, périmée, ou une formulation
                  qui te paraît biaisée, utilise le lien placé sous les sources
                  de la question : ta proposition arrive directement chez les
                  contributeurs, qui la vérifient source en main avant toute
                  correction. Tu peux aussi écrire à <EmailLink />.
                </p>
                <SuggestionTrigger label="Proposer une nouvelle question →" />
              </section>
            </div>

            <aside className="dt-doc-aside">
              <h3>En bref</h3>
              <ul>
                <li>
                  <strong>Sources</strong>
                  {totalSources} citations · {ORGANISMS_TOTAL} organismes ·{" "}
                  {SOURCE_FAMILIES.length} familles
                </li>
                <li>
                  <strong>Tête de liste</strong>
                  INSEE, DREES, Sénat, Cour des comptes, Eurostat, OCDE
                </li>
                <li>
                  <strong>Validation</strong>
                  IA pour le brouillon, humain pour la valeur finale et la
                  formulation
                </li>
                <li>
                  <strong>Affiliations</strong>
                  Aucun parti, aucune campagne, aucun financement politique
                </li>
                <li>
                  <strong>Données personnelles</strong>
                  Compte optionnel sans email, pas de cookies de tracking
                </li>
              </ul>
              <EmailLink>Signaler une erreur →</EmailLink>
            </aside>
          </div>
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}

function FamilyCard({ family }: { family: SourceFamily }) {
  const [open, setOpen] = useState(false);
  const visible = family.organisms.slice(0, family.visibleCount);
  const hidden = family.organisms.slice(family.visibleCount);
  const totalCitations = family.organisms.reduce((s, o) => s + o.count, 0);

  return (
    <div className="dt-src-family">
      <div className="dt-src-family-head">
        <h3>{family.title}</h3>
        <span className="dt-src-family-count">{totalCitations} citations</span>
      </div>
      <p className="dt-src-family-tagline">{family.tagline}</p>
      <div className="dt-src-chips">
        {visible.map((o, i) => (
          <Chip
            key={o.label}
            label={o.label}
            count={o.count}
            highlight={i === 0}
          />
        ))}
        {hidden.length > 0 && (
          <button
            type="button"
            className="dt-src-chip-more"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Replier" : `+ ${hidden.length} autres`}
          </button>
        )}
      </div>
      {open && hidden.length > 0 && (
        <div className="dt-src-chips dt-src-chips--hidden">
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
    <span className={`dt-src-chip${highlight ? " dt-src-chip--lead" : ""}`}>
      {label}
      <span className="dt-src-chip-n">{count}</span>
    </span>
  );
}
