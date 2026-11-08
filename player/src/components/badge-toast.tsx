"use client";

/// File de toasts de déblocage de badges.
///
/// Une seule toast est visible à la fois (mode="wait" : la suivante n'apparaît
/// qu'après l'exit animation de la précédente). La pile complète est dérivée
/// du store progress (les badges `seen:false`).
///
/// UX :
///   - Position fixe : bureau, coin haut-droit sous l'AppNav ; mobile, en
///     bas au-dessus des barres d'action (en haut, elle masquait l'énoncé de
///     la question et le score des résultats de défi). Placement porté par
///     la classe .badge-toast-card (globals.css).
///   - Apparition/disparition via framer-motion spring : entre par la droite
///     avec un léger pop, sort dans la même direction.
///   - Auto-dismiss à 6 s avec barre de progression visible en pied de
///     carte. Hover/touch sur la toast met le timer en pause (UX standard
///     pour pas dégager une notif qu'on est en train de lire).
///   - Click sur le corps → ouvre la page Récompenses (via CustomEvent
///     écouté par AppShell, cf. plus bas pour la rationale).
///   - Croix dédiée plus visible pour fermer sans ouvrir la page.
///
/// Pourquoi un CustomEvent pour ouvrir Récompenses : la toast est rendue
/// à l'intérieur de GamificationWatcher qui n'a pas accès au navigateur
/// de scènes d'AppShell. Plutôt que propager un callback à travers les
/// providers, on émet un événement DOM nommé que l'AppShell route vers
/// `navTo("rewards")`. Local au browser, pas de couplage React à gérer.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BADGE_BY_ID, type BadgeDef } from "@/lib/gamification";
import { BadgeIcon } from "./badge-icon";

export const BADGE_TOAST_NAVIGATE_EVENT = "mon2027:badge-toast-navigate";

/// Durée d'affichage avant auto-dismiss. Calibré pour laisser le temps
/// de lire (titre + description) sans devenir intrusif. La barre de
/// progression visible en pied de carte donne le feedback du timer.
const AUTO_DISMISS_MS = 6000;

/// Seuil de swipe pour dégager la toast vers la droite. ~25% de la largeur
/// max de la toast (380px) : assez pour distinguer d'un glissement
/// accidentel, assez peu pour qu'un swipe franc suffise sur mobile.
const SWIPE_DISMISS_OFFSET_PX = 90;
/// Vélocité (px/s) qui suffit à dégager même sans atteindre l'offset —
/// permet le "flick" rapide typique. 500 px/s = un coup de pouce ferme
/// mais pas extrême.
const SWIPE_DISMISS_VELOCITY_PX_S = 500;

export function BadgeToastQueue({
  ids,
  onDismiss,
}: {
  ids: string[];
  onDismiss: (ids: string[]) => void;
}) {
  // Head de la queue. Quand l'utilisateur dismisse, onDismiss → seen:true
  // → la liste `ids` se réduit → un nouveau head apparaît au prochain render.
  const head = ids[0] ?? null;

  return (
    <div
      // Couche racine : pointer-events:none pour ne pas bloquer les clicks
      // dans la zone vide. La toast elle-même réactive pointer-events.
      // Couvre le viewport (inset 0) pour que la carte puisse s'ancrer en
      // haut (bureau) comme en bas (mobile) ; pointer-events:none laisse
      // passer les clics partout ailleurs.
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        pointerEvents: "none",
      }}
    >
      <AnimatePresence mode="wait">
        {head ? (
          <ToastCard
            key={head}
            id={head}
            def={BADGE_BY_ID.get(head) ?? null}
            onDismiss={onDismiss}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  id,
  def,
  onDismiss,
}: {
  id: string;
  /// null si le badge n'est plus au catalogue (ID orphelin dans progress).
  /// On dismiss silencieusement dans ce cas — voir SilentDismiss.
  def: BadgeDef | null;
  onDismiss: (ids: string[]) => void;
}) {
  /// Hover/focus met le timer en pause. Sans ça, déplacer la souris pour
  /// lire la description suffisait à le faire disparaître au pire moment.
  const [paused, setPaused] = useState(false);

  // Auto-dismiss avec pause au hover. Quand `paused` toggle on, on clear
  // le timeout ; quand off, on en recrée un. Pas de tracking du temps
  // restant — la barre de progression est juste cosmétique et redémarre
  // depuis 0 à chaque pause/resume (acceptable, l'utilisateur ne court
  // pas un chrono à la milliseconde).
  useEffect(() => {
    if (!def) return;
    if (paused) return;
    const t = setTimeout(() => onDismiss([id]), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [id, def, paused, onDismiss]);

  // Badge orphelin : dismiss au mount, ne rend rien (pas de UI flash).
  if (!def) {
    return <SilentDismiss id={id} onDismiss={onDismiss} />;
  }

  function handleNavigate() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(BADGE_TOAST_NAVIGATE_EVENT));
    onDismiss([id]);
  }

  return (
    <motion.div
      role="status"
      aria-live="polite"
      // Entrée par la droite avec un léger pop. Spring pour le côté
      // "objet matériel qui arrive" plutôt qu'une transition CSS plate.
      // Damping élevé pour éviter un wobble exagéré — on veut une
      // notification, pas un jouet.
      initial={{ x: 32, opacity: 0, scale: 0.96 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 48, opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      // Swipe-to-dismiss horizontal. Drag uniquement vers la droite
      // (constraints left:0) — la toast est ancrée top-right, donc le
      // geste naturel pour "la faire partir" est de la pousser hors
      // écran à droite. dragElastic donne un léger rebond élastique si
      // on tente d'aller à gauche (rubber band) sans permettre le
      // déplacement réel. dragMomentum=false évite l'inertie qui ferait
      // dépasser involontairement le seuil quand on relâche un drag
      // hésitant.
      //
      // Mobile et desktop : framer-motion distingue un tap (déplacement
      // < ~3px) d'un drag — le clic sur le corps pour ouvrir Récompenses
      // reste fonctionnel, et le drag ne se déclenche qu'au-delà de ce
      // seuil pointer-events. Sur desktop ça permet aussi de swiper à la
      // souris, ce qui est agréable mais secondaire (la croix reste la
      // surface principale).
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.05, right: 0.9 }}
      dragMomentum={false}
      onDragStart={() => setPaused(true)}
      onDragEnd={(_event, info) => {
        // Décision de dismiss : seuil par offset OU vélocité. Le "flick"
        // rapide (forte vélocité) marche même sans grand déplacement,
        // ce qui matche l'attente mobile. Si pas dismiss, framer-motion
        // ramène automatiquement la carte à x:0 via le drag elastic.
        if (
          info.offset.x > SWIPE_DISMISS_OFFSET_PX ||
          info.velocity.x > SWIPE_DISMISS_VELOCITY_PX_S
        ) {
          onDismiss([id]);
          return;
        }
        // Relâche le timer auto-dismiss seulement si on a annulé le geste
        // (le user voulait pas dégager). Si on dismiss, le composant
        // unmount juste après et le pause state devient irrelevant.
        setPaused(false);
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      // top / right / bottom : cf. .badge-toast-card (bureau en haut à
      // droite sous l'AppNav, mobile en bas au-dessus des barres d'action).
      className="badge-toast-card"
      style={{
        pointerEvents: "auto",
        position: "absolute",
        width: "min(380px, calc(100vw - 24px))",
        background: "var(--paper)",
        color: "var(--ink)",
        border: "1.5px solid var(--ink)",
        borderRadius: 14,
        boxShadow:
          "3px 4px 0 var(--ink), 0 18px 36px -10px rgba(26,26,26,0.22)",
        fontFamily: "var(--font-body)",
        overflow: "hidden",
      }}
    >
      {/* Zone cliquable principale → ouvre la page Récompenses. */}
      <button
        type="button"
        onClick={handleNavigate}
        aria-label={`Voir la page Récompenses (nouveau badge: ${def.label})`}
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          width: "100%",
          padding: "12px 14px 14px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: 11,
            background: "var(--coral)",
            color: "var(--cream-warm)",
            display: "grid",
            placeItems: "center",
          }}
          aria-hidden
        >
          <BadgeIcon kind={def.icon} size={22} />
        </span>
        <span style={{ minWidth: 0, flex: 1, paddingRight: 28 }}>
          <span
            className="mono"
            style={{
              display: "block",
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--coral)",
              marginBottom: 2,
            }}
          >
            Nouveau badge
          </span>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              color: "var(--ink)",
            }}
          >
            {def.label}
          </span>
          <span
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 12,
              color: "var(--ink-soft)",
              lineHeight: 1.35,
            }}
          >
            {def.description}
          </span>
        </span>
      </button>

      {/* Croix de fermeture — séparée du bouton principal pour éviter
          la nav vers Récompenses. Position absolute top-right de la
          carte, visible sans dominer la lecture. */}
      <button
        type="button"
        aria-label="Fermer la notification"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss([id]);
        }}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 30,
          height: 30,
          borderRadius: 9,
          border: 0,
          background: "transparent",
          color: "var(--ink-mute)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          transition: "background 0.12s, color 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(26,26,26,0.08)";
          e.currentTarget.style.color = "var(--ink)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--ink-mute)";
        }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {/* Barre de progression du countdown auto-dismiss. Animée via CSS
          width transition pour rester fluide quand React n'est pas en
          train de re-render. Reset à 100 % au mount + à chaque resume
          (cf. `key={paused}` qui force le re-mount → restart de la
          transition). Pas visible pendant le hover (paused=true → on
          ne rejoue pas la transition, la barre reste à 100 %). */}
      <div
        style={{
          height: 3,
          background: "rgba(26,26,26,0.06)",
        }}
        aria-hidden
      >
        <div
          key={paused ? "paused" : "running"}
          style={{
            height: "100%",
            width: paused ? "100%" : "0%",
            background: "var(--coral)",
            // Transition lance le rétrécissement de la barre quand on
            // n'est PAS en pause. Quand on hover, la barre reste à
            // 100 % (paused=true gèle l'état). Quand on quitte le
            // hover, la barre repart à 0 % en AUTO_DISMISS_MS — synchro
            // avec le timeout du useEffect.
            transition: paused
              ? "none"
              : `width ${AUTO_DISMISS_MS}ms linear`,
          }}
        />
      </div>
    </motion.div>
  );
}

/// Dismiss silencieux au mount (ID orphelin dans progress.badges sans
/// définition au catalogue). Rendre null + appeler onDismiss dans un
/// effect évite un loop infini : l'effet ne se re-fire pas tant que
/// l'id change.
function SilentDismiss({
  id,
  onDismiss,
}: {
  id: string;
  onDismiss: (ids: string[]) => void;
}) {
  useEffect(() => {
    onDismiss([id]);
  }, [id, onDismiss]);
  return null;
}
