"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Question } from "@/lib/types";
import { phaseAtLeast, type RevealPhase } from "@/lib/reveal-phase";
import { slugForQuestion } from "@/lib/question-slug";
import { copyToClipboard } from "@/lib/clipboard";
import type { StatsResponse } from "@/lib/stats-hook";
import { LEVEL_LABEL } from "@/lib/correctness";
import { Modal } from "../modal";
import { QuitConfirmModal } from "../quit-confirm-modal";

/// Surface de props commune à TOUS les écrans de question — simple
/// comme composite. Avant on avait des CommonProps redéfinis dans
/// chaque format avec des micro-différences (l'un acceptait onAbort,
/// l'autre non, l'un acceptait liveStats, l'autre non…) ce qui
/// déclenchait des bugs d'UI inconsistante (la × du chrome qui
/// apparaissait pour estimation mais pas pour curseur_multi, par
/// exemple). Maintenant tout le monde déclare exactement les mêmes
/// props — quitte à en ignorer certaines.
///
/// `Q` : la variante de Question gérée par ce format
/// `A` : le type de réponse (number, boolean, Record<…>, etc.)
export type FormatProps<Q extends Question, A> = {
  q: Q;
  index: number;
  total: number;
  accent: string;
  onSubmit: (val: A | null) => void;
  revealPhase?: RevealPhase;
  lockedAnswer?: A | null;
  /// Stats live (mergées par le runner via useQuestionStats). Tous les
  /// formats reçoivent la prop ; ceux qui n'en ont pas l'usage (les
  /// formats simples lisent leurs stats directement dans `q`) peuvent
  /// l'ignorer.
  liveStats?: StatsResponse | null;
  /// Avance à la question suivante. Set en reveal seulement.
  onNext?: () => void;
  isLast?: boolean;
  /// X du chrome (always-on quand fourni). Tous les formats l'acceptent
  /// et le passent à QuestionShell.
  onAbort?: () => void;
  /// `false` quand l'utilisateur n'a répondu à AUCUNE question de la
  /// session — utilisé par QuestionShell pour skipper la modal de
  /// confirmation de la × du chrome (il n'y a rien à perdre en
  /// quittant). Calculé par le runner ; absent ou true → modal
  /// affichée. Couple avec AppShell.onDone qui route vers la home (au
  /// lieu du récap) quand 0 réponse.
  hasAnyAnswer?: boolean;
  /// Bouton Terminer secondaire de la cta-bar mobile. Set en ASK only,
  /// caché sur isLast.
  onTerminate?: () => void;
  /// Brouillon de réponse (avant Valider) hydraté depuis GameState. Permet
  /// au format de réinitialiser son state local à la valeur courante au
  /// remontage du runner (flip de breakpoint), au lieu de revenir à null /
  /// default. Le format casts vers son type `A` côté runner.
  draft?: A | null;
  /// À appeler à chaque changement utilisateur (pick, slider, drop, etc.)
  /// pour pousser le brouillon dans GameState. Idempotent — n'est pas un
  /// submit. Le format peut continuer à utiliser son setState local en
  /// parallèle ; `draft` est juste la source de vérité pour l'hydration.
  onDraft?: (value: A) => void;
};

/// Couleur d'accent par thème. Délègue à `lib/theme-colors.ts` (source
/// unique partagée avec les cards Découvrir, l'accent de row Réviser, etc.).
/// L'ancien mapping local divergeait pour Travail/École/Logement/Institutions
/// et donnait des chips de la mauvaise couleur (Climat tombait sur le fallback
/// quand le label ne matchait pas) — voir player/DESIGN.md §7.
import { themeColor as themeAccentImpl } from "@/lib/theme-colors";
import { usePreviewMode } from "@/lib/preview-mode";
export const themeAccent = themeAccentImpl;

/// `ThemeChip` (variant pill plein) supprimée — toute l'app utilise
/// désormais `<ThemeBadge variant="solid|soft">` depuis
/// `components/theme-badge.tsx`. Le wording "chip" survit dans les commentaires
/// historiques mais le composant unique est `ThemeBadge`.

/// Indicateur discret de difficulté (★1..★5) à côté du badge thème. Aide
/// l'utilisateur à comprendre a posteriori pourquoi il a buté (★5 vs ★1).
/// Pleins/vides plutôt qu'un nombre : visuellement plus immédiat. La
/// couleur reste neutre (ink-mute) pour ne pas voler la vedette au thème.
const DIFF_LABEL: Record<number, string> = {
  1: "très facile",
  2: "facile",
  3: "moyen",
  4: "difficile",
  5: "très difficile",
};

export function DifficultyChip({ difficulte }: { difficulte: number | undefined }) {
  if (difficulte == null) return null;
  const d = Math.max(1, Math.min(5, Math.round(difficulte)));
  return (
    <span
      title={`Difficulté : ${DIFF_LABEL[d]}`}
      aria-label={`Difficulté ${d} sur 5`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--ink-mute)",
        letterSpacing: 0,
      }}
    >
      {"★".repeat(d)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - d)}</span>
    </span>
  );
}

/// Note : `FormatChrome` a été supprimé. Les formats composites
/// (qcm, classement, vraifaux_multi, curseur_multi, categorisation,
/// pondere) utilisent désormais `QuestionChrome` (depuis ui-bits) —
/// le même qui sert aux formats simples. Avant on avait deux chromes
/// avec des rendus différents (anneau circulaire ici, barre là), ce
/// qui rendait l'UI incohérente d'un format à l'autre. Un seul
/// chrome, un seul rendu.

/// Libellés de verdict. « Bien vu » / « Pas loin » / « Pas cette fois »
/// plutôt que « Bonne / Mauvaise réponse » : on déplace la honte (« j'avais
/// faux ») vers une lecture collective (« on est nombreux à se faire piéger,
/// voici pourquoi »). Source unique : LEVEL_LABEL (lib/correctness), le même
/// vocabulaire que les pastilles des formats composites et le récap.
export const VERDICT_GOOD_LABEL = LEVEL_LABEL.good;
export const VERDICT_BAD_LABEL = LEVEL_LABEL.bad;

/// Bandeau « Bien vu » / « Pas cette fois » + phrase de vérité serif,
/// utilisé en phase reveal par les formats simples discrets (Vrai/Faux,
/// A/B). Rendu aussi sur mobile en variante `compact` : avant, seule la
/// couleur du bouton/carte joué disait le résultat — illisible pour un
/// daltonien et ambigu quand la bonne réponse est « Faux » (rouge).
/// Apparaît dès la phase `verdict`. Pas d'aria-live ici : l'annonce
/// lecteur d'écran est portée par VerdictAnnouncer (QuestionShell), sinon
/// le verdict serait lu deux fois.
export function VerdictRevealBanner({
  visible,
  correct,
  truth,
  communityLine,
  compact = false,
}: {
  visible: boolean;
  correct: boolean;
  /// Variante mobile : marges et typo resserrées, pour tenir au-dessus de
  /// la barre « Dossier » sans pousser le toggle communauté hors écran.
  compact?: boolean;
  /// Phrase ou ReactNode décrivant la réponse. Vrai/Faux passe une
  /// string (« C'est vrai. »), A/B passe `La réponse est <strong>X</strong>`.
  /// Vide ou null → le bandeau affiche juste « Bonne/Mauvaise réponse ».
  truth?: ReactNode;
  /// Optionnel : ligne courte de comparaison communautaire ("67 % pensent
  /// comme toi" / "Tu es dans la minorité : 18 % se trompent comme ça").
  /// Surfacée par défaut dans le bandeau verdict pour que la dimension
  /// sociale ne soit pas planquée derrière un toggle — c'est la moitié de
  /// la valeur du reveal ("pas un score, une cartographie de ce que les
  /// gens pensaient").
  communityLine?: ReactNode;
}) {
  if (!visible) return null;
  return (
    <div
      className="verdict-banner-pop"
      // Cible du défilement « verdict visible » (cf. lib/scroll-verdict).
      data-verdict=""
      style={{
        marginTop: compact ? 0 : 24,
        padding: compact ? "10px 14px" : "14px 18px",
        borderRadius: 12,
        border: `1.5px solid ${
          correct ? "var(--signal-good)" : "var(--signal-bad)"
        }`,
        background: correct
          ? "rgba(74,143,92,0.08)"
          : "rgba(199,93,93,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transformOrigin: "center center",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="mono"
          style={{
            fontSize: compact ? 12 : 13,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: correct ? "var(--signal-good-ink)" : "var(--signal-bad-ink)",
            fontWeight: 700,
          }}
        >
          {correct ? VERDICT_GOOD_LABEL : VERDICT_BAD_LABEL}
        </div>
        {truth ? (
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-serif)",
              fontSize: compact ? 15 : 17,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            {truth}
          </div>
        ) : null}
        {communityLine ? (
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--ink-soft)",
              lineHeight: 1.4,
            }}
          >
            {communityLine}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/// Phrase de lecture collective affichée d'office sous le verdict des
/// formats composites et de l'estimation (cf. lib/community-lines). Rien
/// quand la phrase est null (seuil de réponses pas atteint). Même habillage
/// que la ligne de contraste du QCM.
export function CommunityReadLine({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p
      style={{
        margin: 0,
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--ink-soft)",
        lineHeight: 1.4,
        textWrap: "pretty",
      }}
    >
      {text}
    </p>
  );
}

/// Espace insécable avant « % » (typographie française) : évite qu'un
/// « 18 » reste en fin de ligne et son « % » parte à la ligne suivante.
export const NBSP = String.fromCharCode(160);

/// Helper partagé : compose une phrase de contraste communautaire pour
/// les formats binaires (V/F, A/B, QCM). Retourne `null` si pas assez de
/// data agrégée. La phrase est volontairement neutre, factuelle, et
/// jamais culpabilisante : pour quelqu'un qui se trompe, "67 % se trompent
/// aussi" doit rassurer plus que culpabiliser — la cartographie, pas le score.
export function communityContrastLine({
  userCorrect,
  userPickPct,
  oppositePickPct,
}: {
  userCorrect: boolean;
  /// % de joueurs ayant fait le même choix que l'utilisateur.
  userPickPct?: number;
  /// % ayant choisi l'option opposée (utile pour formuler "X% pensent que…").
  oppositePickPct?: number;
}): string | null {
  if (userPickPct == null) return null;
  if (userCorrect) {
    // Bon : on souligne soit "tu n'es pas seul·e" (consensus large) soit
    // "tu fais partie d'une minorité éclairée" (réponse contre-intuitive).
    if (userPickPct >= 65) {
      return `Comme la majorité : ${userPickPct}${NBSP}% répondent juste sur cette question.`;
    }
    if (userPickPct <= 35) {
      return `Tu vois clair : seuls ${userPickPct}${NBSP}% trouvent la bonne réponse.`;
    }
    return `${userPickPct}${NBSP}% des joueurs répondent juste comme toi.`;
  }
  // Mauvais : on rassure quand l'erreur est partagée (userPickPct élevé),
  // et quand elle est plus rare on renvoie vers le dossier (« voici ce qui
  // piège ») plutôt que de souligner la minorité. On regarde userPickPct (le
  // % qui ont fait LA MÊME erreur), pas oppositePickPct — la nuance vient
  // des autres erreurs possibles (en QCM 4 options, "30 % comme moi" est
  // différent de "30 % dans la bonne et 70 % éparpillés ailleurs").
  // oppositePickPct reste accepté en paramètre pour compatibilité mais
  // n'influence plus la décision principale.
  //
  // Très faible (≤ 5 %, jusqu'à 0 % quand on est parmi les premiers) :
  // « 0 % ont fait le même choix » ou « Tu n'es pas seul·e : 0 % » sonne
  // faux — formulation neutre, sans chiffre.
  if (userPickPct <= 5) {
    return "Choix peu fréquent sur cette question : le dossier explique ce qui piège.";
  }
  if (userPickPct <= 25) {
    return `${userPickPct}${NBSP}% ont fait le même choix que toi : le dossier explique ce qui piège.`;
  }
  return `Tu n'es pas seul·e : ${userPickPct}${NBSP}% ont fait le même choix sur cette question.`;
}

/** Popover « ⓘ Précisions » à placer juste sous la question. Quand le texte
 *  `precisions` existe en DB, le joueur peut le déplier pour lire tout ce qui
 *  a été sorti de la question pour la garder courte : définition d'un terme,
 *  périmètre, année, unité, source (ex. : « écart entre le quart le plus
 *  favorisé et le quart le plus défavorisé selon l'indice ESCS PISA »). Reste fermé par
 *  défaut pour ne pas alourdir la question — les méta-précisions sont opt-in.
 *  Rend null si pas de texte ; sûr à mettre partout.
 *
 *  Implémenté en popover ancré au bouton (et non en disclosure inline) pour
 *  éviter le layout-shift qui pousse le slider hors de l'écran quand on
 *  déplie la définition pendant qu'on règle son estimation. Le popover se
 *  ferme au clic extérieur ou via Échap. */
export function PrecisionsDisclosure({ text }: { text?: string | null }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const wrap = wrapperRef.current;
      if (!wrap) return;
      if (!wrap.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // pointerdown plutôt que click : ferme avant que le bouton Valider /
    // slider ne reçoive son tap (sinon double-tap perçu).
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!text || !text.trim()) return null;
  return (
    <div
      ref={wrapperRef}
      style={{
        marginTop: 10,
        position: "relative",
        display: "inline-block",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="mono"
        style={{
          appearance: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: open ? "var(--ink)" : "transparent",
          color: open ? "var(--paper)" : "var(--ink-soft)",
          border: "1px solid var(--rule)",
          borderRadius: 99,
          padding: "5px 11px",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 600,
          cursor: "pointer",
          transition: "background 0.18s, color 0.18s, border-color 0.18s",
        }}
      >
        <InfoGlyph />
        Précisions
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Précisions"
          className="pop-in"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            // Largeur contrainte au viewport : sur mobile étroit on évite
            // que le popover déborde à droite. Le wrapper bouton est au
            // padding 24px de gauche, on garde 24px de marge à droite.
            width: "max-content",
            maxWidth: "min(320px, calc(100vw - 48px))",
            background: "var(--cream-warm)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--ink-soft)",
            boxShadow:
              "0 8px 24px -8px rgba(26,26,26,0.18), 0 1px 0 rgba(26,26,26,0.04)",
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}

function InfoGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="3.6" r="0.7" fill="currentColor" />
      <path
        d="M6 5.4v3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Score chip (good / mid / bad), used in reveal. Si `pop`, le chip apparaît
 *  avec l'animation spring partagée du verdict (verdict-banner-pop dans
 *  globals.css) et adopte un style plus marqué (typo + padding) pour rendre le
 *  verdict immédiatement lisible. À activer dans tous les composants format au
 *  moment où le chip représente LE verdict global du joueur. */
export function ScoreChip({
  kind,
  children,
  pop = false,
}: {
  kind: "good" | "mid" | "bad" | "neutral";
  children: ReactNode;
  pop?: boolean;
}) {
  // Texte en teintes foncées (*-ink, ≥ 4,5:1 sur ces fonds teintés — cf.
  // globals.css) ; les fonds gardent les teintes claires.
  const map: Record<string, { fg: string; bg: string }> = {
    good: { fg: "var(--signal-good-ink)", bg: "rgba(74,143,92,0.12)" },
    mid: { fg: "var(--signal-mid-ink)", bg: "rgba(216,154,62,0.12)" },
    bad: { fg: "var(--signal-bad-ink)", bg: "rgba(199,93,93,0.12)" },
    neutral: { fg: "var(--ink-mute)", bg: "rgba(0,0,0,0.06)" },
  };
  const m = map[kind];
  return (
    <span
      className={pop ? "verdict-banner-pop" : undefined}
      // Pastille « pop » = LE verdict : cible du défilement qui le garde
      // visible à la révélation (cf. lib/scroll-verdict).
      data-verdict={pop ? "" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: pop ? 8 : 5,
        fontFamily: "var(--font-mono)",
        fontSize: pop ? 13 : 10,
        letterSpacing: pop ? "0.04em" : "0.05em",
        padding: pop ? "7px 13px" : "3px 8px",
        borderRadius: 99,
        background: m.bg,
        color: m.fg,
        textTransform: "uppercase",
        fontWeight: pop ? 700 : 600,
        transformOrigin: "center center",
      }}
    >
      <span
        style={{
          width: pop ? 7 : 5,
          height: pop ? 7 : 5,
          borderRadius: 99,
          background: "currentColor",
        }}
      />
      {children}
    </span>
  );
}

/** Tampon ✓/✗ qui pop dans le coin haut-droit de l'artefact joué au moment du
 *  verdict. Le parent doit avoir `position: relative` (voir .ab-card / .dt-ab-
 *  card / .tf-btn / .dt-tf-btn dans globals.css). Rendu en spring overshoot
 *  via la classe .verdict-icon-xl, taille pilotée par la prop `size`. */
export function VerdictIconXL({
  good,
  size = 96,
}: {
  good: boolean;
  size?: number;
}) {
  return (
    <span
      className={"verdict-icon-xl " + (good ? "good" : "bad")}
      aria-hidden
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="46"
          fill={good ? "var(--signal-good)" : "var(--signal-bad)"}
          stroke="var(--paper)"
          strokeWidth="4"
        />
        {good ? (
          <path
            d="M28 52 44 68 73 36"
            stroke="var(--paper)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          <path
            d="M32 32 68 68 M68 32 32 68"
            stroke="var(--paper)"
            strokeWidth="9"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}


/** Action bar du reveal desktop — agrège les 3 actions de sortie de question :
 *  - Terminer (secondaire, link-style) : abandonne la session et passe au
 *    récap immédiatement. Caché si on est déjà sur la dernière question
 *    (`isLast`), parce que "Suivant" devient "Voir le récap" qui fait
 *    exactement la même chose.
 *  - Partager (secondaire, icône) : ouvre le sheet de partage du navigateur
 *    avec l'URL `/q/[slug]` de la question, ou fallback copie dans le
 *    presse-papier. Identique au bouton Partager qui vivait dans le
 *    DossierPanel — retiré là-bas pour éviter le doublon.
 *  - Suivant (primaire) : passe à la question suivante, ou au récap si
 *    `isLast`.
 *
 *  Sur bureau, le runner la rend APRÈS le dossier, à la phase `dossier`,
 *  dans un conteneur collant en bas de la fenêtre (`.dt-reveal-actions`) :
 *  placée entre le verdict et le dossier, elle invitait à partir sans lire ;
 *  collante, elle reste trouvable tant que le dossier défile.
 *
 *  Desktop-only : sur mobile, l'action bar vit dans `dossier-panel-mobile`
 *  (bottom-sheet sticky) — n'utilise pas ce composant. */
export function RevealActionBar({
  q,
  onNext,
  onTerminate,
  isLast = false,
  total = 0,
  revealPhase,
  defi = false,
}: {
  q: Question;
  onNext?: () => void;
  onTerminate?: () => void;
  isLast?: boolean;
  /// Nombre total de questions de la session. Quand total === 1 et
  /// isLast (== seule question), le bouton final passe en
  /// « Continuer » plutôt que « Voir le récap » : un récap d'1
  /// réponse n'a pas d'intérêt, l'utilisateur est routé vers
  /// /découvrir (cf. onDone côté AppShell / QuestionPlayClient).
  total?: number;
  revealPhase: RevealPhase;
  /// Contexte création de défi : on masque le « Partager » par-question
  /// (partager UNE question publique en pleine création de défi est
  /// hors-flux) et le bouton final devient « Partager le défi » — il mène à
  /// l'écran de création/partage du défi, pas à un récap.
  defi?: boolean;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  // Aperçu contributeur : la question n'est pas (encore) publique, rien à
  // partager.
  const preview = usePreviewMode();
  if (!onNext || !phaseAtLeast(revealPhase, "verdict")) return null;

  return (
    <>
      <div className="reveal-action-bar">
        {!isLast && onTerminate ? (
          <button
            type="button"
            className="reveal-action-end"
            // Confirmation « Quitter la partie ? » : Terminer est voisin de
            // « Question suivante », un clic d'à-côté ne doit pas couper la
            // partie sans retour possible.
            onClick={() => setQuitOpen(true)}
          >
            Terminer
          </button>
        ) : null}
        {onTerminate ? (
          <QuitConfirmModal
            open={quitOpen}
            onCancel={() => setQuitOpen(false)}
            onConfirm={() => {
              setQuitOpen(false);
              onTerminate?.();
            }}
          />
        ) : null}
        {defi || preview ? null : (
          <button
            type="button"
            className="reveal-action-share"
            onClick={() => setShareOpen(true)}
            aria-label="Partager cette question"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M11.5 4.5a2 2 0 1 0-2-2 2 2 0 0 0 .1.6L5.6 5.4A2 2 0 1 0 4 8a2 2 0 0 0 1.6-.8l3.9 2.3a2 2 0 0 0-.1.6 2 2 0 1 0 .5-1.3L6 6.5A2 2 0 0 0 6 5l4-2.4a2 2 0 0 0 1.5.9z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Partager</span>
          </button>
        )}
        <button type="button" onClick={onNext} className="reveal-action-next">
          {isLast
            ? defi
              ? "Partager le défi"
              : total === 1
                ? "Continuer"
                : "Voir le récap"
            : "Question suivante"}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="m6 3 5 5-5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        q={q}
      />
    </>
  );
}

/// Modal de partage déclenchée depuis l'action bar. Avant on tentait
/// `navigator.share` direct + fallback clipboard, mais sur desktop l'API
/// n'est généralement pas dispo → le clipboard write se faisait
/// silencieusement et l'utilisateur ne savait pas ce qui s'était passé.
/// La modal rend le partage explicite : URL visible, bouton copier avec
/// confirmation, et bouton "Partager via…" si l'API navigateur est dispo
/// (typiquement mobile + quelques navigateurs desktop).
function ShareModal({
  open,
  onClose,
  q,
}: {
  open: boolean;
  onClose: () => void;
  q: Question;
}) {
  const [copied, setCopied] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);

  // navigator.share check fait dans un effect pour éviter un mismatch
  // d'hydratation (navigator est undefined côté SSR — le SSR rend la modal
  // sans le bouton "Partager via…", l'hydratation client peut l'ajouter
  // ensuite si l'API est dispo). Le re-render est ici intentionnel : on
  // veut afficher le bouton SI l'API existe, donc on demande explicitement
  // au composant de se rafraîchir après mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      setHasNativeShare(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const slug = slugForQuestion(q);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/q/${slug}`
      : `/q/${slug}`;

  async function copyLink() {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: q.question,
        text: "Un chiffre civique sourcé sur Mon2027 :",
        url,
      });
      onClose();
    } catch {
      /* user a annulé ou erreur : on reste sur la modal pour qu'il puisse
         retenter ou copier le lien */
    }
  }

  return (
    <Modal open={open} onClose={onClose} ariaLabel="Partager cette question" size="md">
      <div className="share-modal-body">
        <div className="share-modal-eyebrow">Partager</div>
        <h3 className="share-modal-title">{q.question}</h3>
        <p className="share-modal-sub">
          Le lien envoie tes proches direct sur cette question : ils peuvent
          jouer puis voir l&apos;explication.
        </p>

        <div className="share-modal-url" title={url}>
          {url}
        </div>

        <div className="share-modal-actions">
          <button
            type="button"
            className="share-modal-primary"
            onClick={copyLink}
            data-copied={copied ? "true" : "false"}
          >
            {copied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="m3 8 3.5 3.5L13 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Lien copié
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect
                    x="3"
                    y="4"
                    width="8"
                    height="9"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M5 2h7a1 1 0 0 1 1 1v8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Copier le lien
              </>
            )}
          </button>

          {hasNativeShare ? (
            <button
              type="button"
              className="share-modal-secondary"
              onClick={nativeShare}
            >
              Partager via…
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/// Bouton « Terminer » link-style affiché en phase ASK à côté du
/// validate CTA de chaque format. Permet à l'utilisateur d'abandonner la
/// session sans devoir d'abord répondre, en cohérence visuelle avec le
/// Terminer du RevealActionBar (même classe `reveal-action-end`).
///
/// Le caller passe `onTerminate` depuis le runner ; si `undefined` (cas
/// `isLast`, où la session se termine de toute façon au prochain
/// Valider) on rend null. À monter dans le même conteneur que le
/// validate primaire pour qu'ils s'alignent visuellement.
export function AskTerminerLink({
  onTerminate,
  skipConfirm = false,
}: {
  onTerminate?: () => void;
  /// Aucune réponse dans la session : rien à perdre, on termine sans
  /// passer par « Quitter la partie ? » (même règle que la × du chrome).
  skipConfirm?: boolean;
}) {
  const [quitOpen, setQuitOpen] = useState(false);
  if (!onTerminate) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (skipConfirm ? onTerminate?.() : setQuitOpen(true))}
        className="reveal-action-end"
        style={{ marginRight: 0 }}
      >
        Terminer
      </button>
      <QuitConfirmModal
        open={quitOpen}
        onCancel={() => setQuitOpen(false)}
        onConfirm={() => {
          setQuitOpen(false);
          onTerminate?.();
        }}
      />
    </>
  );
}

/// Wrapper cta-bar mobile qui pose le Valider primaire (`children`) à
/// droite et un bouton secondaire « Terminer » à sa gauche, en grille
/// `1fr 1.4fr` — même pattern que la `dossier-action-bar` du reveal
/// (Terminer + Suivant côte-à-côte). Remplace `<div className="cta-bar">`
/// dans la branche mobile de chaque format.
///
/// Si `onTerminate` est undefined (isLast ou reveal), on tombe en grille
/// `1fr` : seul le Valider est rendu, plein largeur — comportement
/// identique à l'ancien wrapper simple.
///
/// `background` override : la classe `.cta-bar` a un gradient
/// `transparent → cream at 30%` pensé pour fondre avec UN seul bouton.
/// Avec le Terminer ajouté à côté, on garde une mini-bande de fade en
/// tout début (12px) pour adoucir la transition avec le contenu
/// au-dessus, puis cream opaque sur tout le reste — sinon le bouton
/// Terminer (border outlined) laissait apparaître les hints / labels
/// du curseur derrière par transparence.
///
/// Terminer passe par la confirmation « Quitter la partie ? » (la même que
/// la × du chrome) : collé à Valider, un tap d'à-côté coupait la partie
/// sans retour. `skipConfirm` (aucune réponse dans la session) court-circuite
/// la modale — il n'y a rien à perdre.
export function MobileCtaBar({
  onTerminate,
  skipConfirm = false,
  children,
}: {
  onTerminate?: () => void;
  skipConfirm?: boolean;
  children: ReactNode;
}) {
  const hasTerminer = !!onTerminate;
  const [quitOpen, setQuitOpen] = useState(false);
  return (
    <div
      className="cta-bar"
      style={{
        display: "grid",
        gridTemplateColumns: hasTerminer ? "1fr 1.4fr" : "1fr",
        gap: 10,
        alignItems: "stretch",
        background:
          "linear-gradient(to bottom, transparent 0, var(--cream) 12px, var(--cream) 100%)",
      }}
    >
      {hasTerminer ? (
        <button
          type="button"
          onClick={() => (skipConfirm ? onTerminate?.() : setQuitOpen(true))}
          className="btn-secondary"
          style={{ padding: "18px 12px" }}
        >
          Terminer
        </button>
      ) : null}
      {children}
      {hasTerminer ? (
        <QuitConfirmModal
          open={quitOpen}
          onCancel={() => setQuitOpen(false)}
          onConfirm={() => {
            setQuitOpen(false);
            onTerminate?.();
          }}
        />
      ) : null}
    </div>
  );
}

/// Toggle « Voir les réponses des autres » partagé entre TOUS les formats
/// en phase reveal. Centralise :
///  - le wording et le style du bouton (mono pill, état ouvert = ink/paper)
///  - l'empty state « pas encore assez de réponses » quand `hasData` est
///    false (le caller ne rend pas ses stats dans ce cas — on affiche le
///    message à la place)
///
/// Le composant est **contrôlé** : la state `open` est portée par le
/// caller, qui s'en sert pour rendre conditionnellement ses propres
/// graphiques de répartition (mini-barres par bin/option, marker
/// communauté sur un axe, etc.). Ce composant ne rend QUE le bouton.
///
/// Avant ça : chaque format avait son propre toggle inline avec un
/// libellé légèrement différent (« Comparer aux autres joueurs »,
/// « Voir comment les autres ont répondu »…).
///
/// Sans données (seuil de réponses pas encore atteint), le bouton n'est
/// PAS rendu : l'ancien état « bouton visible → s'ouvre sur “Pas encore
/// assez de réponses” » était une promesse non tenue au moment du verdict,
/// ressentie comme un bug au parcours réel. `emptyMessage` reste accepté
/// pour compatibilité mais n'est plus affiché.
export function CommunityStatsToggle({
  open,
  onToggle,
  hasData,
  /// Override des libellés. Par défaut on aligne sur la formulation
  /// utilisée par `question-categorisation` (la plus neutre et explicite).
  label = "Voir les réponses des autres",
  openLabel = "Masquer les réponses des autres",
  /// Wrapper margin top. Par défaut 14 — s'aligne sur le reveal des
  /// composites. Passer 0 pour les formats qui veulent leur propre
  /// container.
  marginTop = 14,
}: {
  open: boolean;
  onToggle: () => void;
  hasData: boolean;
  label?: string;
  openLabel?: string;
  marginTop?: number;
  /// Ancien message d'état vide — plus affiché (le bouton est masqué
  /// sans données). Conservé dans le type pour ne pas casser les appels.
  emptyMessage?: string;
}) {
  if (!hasData) return null;
  return (
    <div style={{ marginTop }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mono"
        style={{
          appearance: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: open ? "var(--ink)" : "transparent",
          color: open ? "var(--paper)" : "var(--ink-soft)",
          border: "1px solid var(--rule)",
          borderRadius: 99,
          padding: "6px 12px",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 600,
          cursor: "pointer",
          transition: "background 0.18s, color 0.18s, border-color 0.18s",
        }}
      >
        {open ? openLabel : label}
        <span
          aria-hidden
          style={{
            display: "inline-block",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 0.18s",
          }}
        >
          ▾
        </span>
      </button>
    </div>
  );
}

/** Reveal section header used inside composite-format reveal panels. */
export function RevealSection({
  title,
  tag,
  children,
  style,
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 6,
          borderBottom: "1px solid var(--rule-soft)",
          marginBottom: 10,
        }}
      >
        <div
          className="display"
          style={{
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ink)",
          }}
        >
          {title}
        </div>
        {tag ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-mute)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {tag}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

