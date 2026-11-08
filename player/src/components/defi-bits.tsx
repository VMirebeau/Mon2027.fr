"use client";

/// Atomes partagés du mode Défier un proche.
/// - Icones SVG inline — sourcées depuis `components/icons.tsx` pour ne pas
///   dupliquer les pictos déjà utilisés ailleurs (Star, Send, Check, etc).
///   `DI.Tag` reste défini ici, c'est le seul picto exclusif au flow défi.
/// - Boutons primaire/secondaire spécifiques au flow défi (palette + tailles
///   un peu différentes du reste de l'app, suivent le design).
/// - ScoreBadge pour la page C de résultats.
/// - AppBar légère avec back + titre + sous-titre.

import type React from "react";
import { BrandMark } from "./brand-mark";
import {
  ArrowRightIcon,
  BackIcon,
  BellIcon,
  CheckIcon,
  ChevDownIcon,
  ClockIcon,
  CopyIcon,
  DotsIcon,
  EyeIcon,
  RefreshIcon,
  SendIcon,
  ShareIcon,
  SparkleIcon,
  StarIcon,
  SunIcon,
  XIcon,
} from "./icons";

// ============================================================================
// Icons — DI = "Défi Icons", alias des icônes mutualisées + Tag spécifique.
// ============================================================================

type IconProps = { size?: number };

export const DI = {
  Back: BackIcon,
  Arrow: ArrowRightIcon,
  Star: StarIcon,
  /// Tag (badge en losange) — picto exclusif au flow défi (cf. cartes de
  /// sélection thème). Pas exposé ailleurs, donc gardé inline.
  Tag: ({ size = 16 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" />
      <circle cx={7.5} cy={7.5} r={1.4} fill="currentColor" />
    </svg>
  ),
  Check: CheckIcon,
  X: XIcon,
  Copy: CopyIcon,
  Share: ShareIcon,
  Eye: EyeIcon,
  Bell: BellIcon,
  Clock: ClockIcon,
  Sparkle: SparkleIcon,
  Sun: SunIcon,
  Send: SendIcon,
  Dots: DotsIcon,
  ChevDown: ChevDownIcon,
  Refresh: RefreshIcon,
};

// ============================================================================
// AppBar — header avec bouton retour optionnel
// ============================================================================

export function DefiAppBar({
  title,
  sub,
  onBack,
  right,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px 14px",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          minWidth: 0,
        }}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="icon-btn"
            style={{
              width: 36,
              height: 36,
              /* Variante "plein" du back : fond plus marqué que le hover bg
                 standard (pour qu'on voie le bouton sans interaction). */
              background: "var(--hover-bg-strong)",
              color: "var(--ink)",
            }}
          >
            <DI.Back />
          </button>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          {sub ? (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-mute)",
                letterSpacing: "0.04em",
                marginTop: 1,
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>
      </div>
      {right}
    </div>
  );
}

// ============================================================================
// Buttons — variants spécifiques au défi
// ============================================================================

export function DefiPrimaryBtn({
  children,
  onClick,
  disabled,
  big = false,
  yellow = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  big?: boolean;
  /** true = fond jaune + bordure ink (CTA "Générer"), false = fond ink (CTA "Continuer"). */
  yellow?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        background: yellow ? "var(--yellow)" : "var(--ink)",
        color: yellow ? "var(--ink)" : "var(--cream-warm)",
        border: yellow ? "1.5px solid var(--ink)" : 0,
        borderRadius: big ? 18 : 16,
        padding: big ? "20px 22px" : "16px 20px",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: big ? 18 : 16,
        letterSpacing: "-0.01em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        transition: "transform 0.1s",
      }}
    >
      {children}
    </button>
  );
}

export function DefiSecondaryBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        background: "transparent",
        color: "var(--ink)",
        border: "1.5px solid var(--rule)",
        borderRadius: 16,
        padding: "14px 18px",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 15,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// CTA bar — sticky footer with cream gradient fade
// ============================================================================

export function CtaBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 18px 22px",
        background:
          "linear-gradient(to bottom, transparent 0%, var(--cream) 25%)",
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// ScoreBadge — utilisé sur la page C de résultats partagés.
// Règle d'or : "et" (pas "vs"), même fond pour les deux scores, jamais
// de mise en avant du gagnant. neutralTone est ON par défaut.
// ============================================================================

export type ScoreBadgeProps = {
  mine: { name: string; score: number; total: number };
  opponent: { name: string; score: number; total: number };
  size?: "sm" | "md" | "lg" | "inline";
};

export function ScoreBadge({ mine, opponent, size = "md" }: ScoreBadgeProps) {
  if (size === "inline") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-soft)",
          letterSpacing: "0.04em",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>
          {mine.name} {mine.score}/{mine.total}
        </span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>
          {opponent.name} {opponent.score}/{opponent.total}
        </span>
      </span>
    );
  }

  const big = size === "lg";
  const sm = size === "sm";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: big ? 16 : 12,
        alignItems: "stretch",
      }}
    >
      <PersonScore p={mine} big={big} sm={sm} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 500,
          fontSize: big ? 24 : sm ? 14 : 18,
          color: "var(--ink-mute)",
          padding: big ? "0 4px" : "0",
          letterSpacing: "-0.02em",
        }}
      >
        et
      </div>
      <PersonScore p={opponent} big={big} sm={sm} />
    </div>
  );
}

function PersonScore({
  p,
  big,
  sm,
}: {
  p: { name: string; score: number; total: number };
  big?: boolean;
  sm?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: big ? 22 : 16,
        padding: big ? "20px 22px" : sm ? "10px 12px" : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: big ? 10 : 6,
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: sm ? 9 : 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}
      >
        {p.name}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: big ? 56 : sm ? 22 : 36,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {p.score}
        <span
          style={{
            fontSize: big ? 24 : sm ? 12 : 18,
            color: "var(--ink-mute)",
            fontWeight: 500,
          }}
        >
          /{p.total}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// SourceRadio — A1, choix de source (favoris / thème)
// ============================================================================
//
// Sémantique : click = action immédiate (advance vers l'étape suivante).
// Pas de paradigme "select puis confirm" — donc pas de badge "radio dot"
// qui suggèrerait une étape intermédiaire. Le hover suffit comme affordance.

export function SourceRadio({
  onPick,
  icon,
  color,
  label,
  sub,
  disabled,
  extraLink,
  onExtraLinkClick,
}: {
  onPick: () => void;
  icon: React.ReactNode;
  color: string;
  label: string;
  sub: string;
  disabled?: boolean;
  extraLink?: string;
  onExtraLinkClick?: () => void;
}) {
  // Wrapper non-interactif (`<div>`) qui porte le cadre visuel : ça permet
  // au lien extra ("Comment créer des favoris ?") d'être un `<button>` frère
  // du bouton principal plutôt qu'imbriqué dedans (interdit en HTML).
  // Hover géré 100 % en CSS (.source-radio:hover :not(.source-radio-disabled))
  // — plus de setState donc plus de re-render au survol.
  return (
    <div
      className={
        "source-radio" + (disabled ? " source-radio-disabled" : "")
      }
      style={{
        background: "var(--cream-warm)",
        border: "1.5px solid var(--rule-soft)",
        borderRadius: 16,
        opacity: disabled ? 0.6 : 1,
        transition:
          "border-color 0.18s, transform 0.18s cubic-bezier(.2,.7,.2,1), box-shadow 0.18s",
        overflow: "hidden",
        // Flex-colonne pour que le bouton principal (flex:1) remplisse toute
        // la hauteur du wrapper. En grille 2 colonnes, la cellule s'étire à la
        // hauteur de la carte la plus haute ; sans ça, le bouton resterait à
        // la hauteur de son contenu et le bas de la carte ne serait pas
        // cliquable.
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          background: "transparent",
          border: 0,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          width: "100%",
          flex: 1,
          color: "inherit",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: disabled ? "var(--cream-deep)" : color,
            border: "1.5px solid var(--ink)",
            color: "var(--ink)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "-0.01em",
            }}
          >
            {label}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12.5,
              color: "var(--ink-soft)",
              lineHeight: 1.4,
            }}
          >
            {sub}
          </div>
        </div>
      </button>
      {extraLink ? (
        // Aligné horizontalement sur le `sub` au-dessus (padding-left 18
        // du bouton + icon 44 + gap 14 = 76px).
        <button
          type="button"
          onClick={() => onExtraLinkClick?.()}
          style={{
            margin: "0 18px 14px 76px",
            padding: 0,
            background: "transparent",
            border: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-soft)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            cursor: onExtraLinkClick ? "pointer" : "default",
            textAlign: "left",
          }}
        >
          {extraLink}
        </button>
      ) : null}
    </div>
  );
}

// ============================================================================
// ThemeTile — A2, choix du thème
// ============================================================================

export function ThemeTile({
  label,
  color,
  count,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  count: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  // Convention de l'app : un thème porte TOUJOURS sa couleur en fond.
  // Pas de sélection persistante : click = action.
  //
  // Style unifié avec la page Thèmes (cf. screens/themes.tsx) : même
  // pop-card avec bord ink + ombre offset. Avant on avait deux traitements
  // visuels distincts pour la MÊME donnée (Step-A2 vs Thèmes), ce qui
  // cassait la cohérence (cliquer une tuile = lancer un jeu dans les deux
  // cas — donc même poids visuel attendu). Le seul écart conservé : pas de
  // bouton flèche à droite, car le tile est plus compact (4 colonnes).
  const empty = count === 0;

  if (empty) {
    return (
      <button
        type="button"
        disabled
        className="theme-tile theme-tile-disabled"
        style={{
          background: "var(--cream-warm)",
          color: "var(--ink-soft)",
          border: "1.5px dashed var(--rule)",
          borderRadius: 16,
          padding: "16px 14px 14px",
          textAlign: "left",
          cursor: "not-allowed",
          opacity: 0.55,
          minHeight: 90,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}
        >
          bientôt
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={"pop-card pop-card--sm display" + (disabled ? " theme-tile-disabled" : "")}
      style={{
        background: color,
        color: "var(--ink)",
        padding: "16px 14px 14px",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        minHeight: 90,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          marginTop: 6,
          fontSize: 10.5,
          color: "var(--ink-soft)",
          letterSpacing: "0.04em",
        }}
      >
        {`${count} question${count > 1 ? "s" : ""}`}
        {disabled && count > 0 ? " · trop court" : ""}
      </div>
    </button>
  );
}

// ============================================================================
// Bandeau Mon2027 minimaliste — utilisé sur B1 et la page de résultats
// quand on ne veut pas du header app complet (chrome zéro côté ami).
//
// Alias minimal sur BrandMark (composant factorisé). On garde l'export
// DefiBrandMark pour préserver l'API des call-sites existants ; toute évo
// du visuel (espace, kerning, couleurs) se fait désormais dans brand-mark.tsx.
// La prop `href` autorise à rendre le logo cliquable : sur les pages standalone
// /d et /q il pointe vers "/" pour qu'un clic ramène à la home (comportement
// attendu sur tout site).
// ============================================================================

export function DefiBrandMark({ href }: { href?: string } = {}) {
  return <BrandMark size="sm" href={href} />;
}
