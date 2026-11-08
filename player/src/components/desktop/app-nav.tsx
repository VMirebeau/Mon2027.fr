"use client";

/// Top nav unifié desktop. Une seule instance est montée au niveau d'AppShell
/// (puis montée à nouveau par /q/[slug] standalone) et survit aux changements
/// de scène. Cette persistance est ce qui permet à l'underline "magic
/// indicator" (motion.span + layoutId) de glisser proprement entre items
/// sans réjouer d'animation d'entrée à chaque navigation.
///
/// Structure :
///   [M Mon2027]   Question du jour · Découvrir · Réviser · Défier   [★ 👤]
///
/// - Le logo renvoie à l'accueil et devient l'item actif quand activeMode === "home".
/// - Réviser apparaît grisé tant que l'utilisateur n'a aucune réponse enregistrée.
/// - Étoile contextuelle (FavoriteToggle) visible uniquement pendant le jeu.
/// - Le bouton UserMenu à droite ouvre le dropdown qui route vers les scènes
///   Mon compte, Mes stats, Mes favoris.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { LayoutGroup, motion } from "framer-motion";
import { BrandIcon } from "../brand-icon";
import { FavoriteToggle } from "../favorite-toggle";
import { PdfHeaderButton } from "../pdf-header-button";
import { UserMenu } from "../user-menu";
import { useProgress } from "@/lib/use-progress";
import { answeredCount } from "@/lib/progress";
import { useUnseenDefis } from "@/lib/use-unseen-defis";
import type { NavTarget } from "@/lib/types";

/// URL canonique côté Next.js pour un mode de nav. Sert au `href` du
/// `<Link>` : middle-click / Ctrl+click / "Copier l'adresse" tombent sur
/// cette URL valide. Le click gauche est intercepté côté composant pour
/// passer par pushScene (state préservé, pas de re-mount AppShell).
function hrefForTarget(target: NavTarget): string {
  if (target === "home") return "/";
  return `/?s=${target}`;
}

type NavItem = {
  target: NavTarget;
  label: string;
  /** Quand true, l'item est rendu en grisé non-cliquable (placeholder). */
  disabled?: boolean;
};

/// Contexte du "mode courant" — propagé par AppShell. L'AppNav lit ce
/// contexte pour décider quel item souligner. Pas d'override par prop : une
/// seule source de vérité, l'activeMode dans AppShell.
const ActiveModeContext = createContext<NavTarget | null>(null);

export function ActiveModeProvider({
  value,
  children,
}: {
  value: NavTarget | null;
  children: React.ReactNode;
}) {
  return (
    <ActiveModeContext.Provider value={value}>
      {children}
    </ActiveModeContext.Provider>
  );
}

/// Contexte question courante — pattern provider+setter (cf. NavPaperContext
/// plus bas, même structure). AppNav consomme l'id pour afficher un
/// FavoriteToggle contextuel dans le header pendant le jeu ; GameSession
/// pousse l'id via `useSetCurrentQuestion` au mount/update.
///
/// Anciennement : provider à valeur fixe wrappant GameSession. Mais AppNav
/// est rendue par AppShell AU-DESSUS de GameSession dans l'arbre — donc le
/// useContext renvoyait toujours null et l'étoile n'apparaissait jamais
/// (bug silencieux). En passant à un provider monté par AppShell (qui
/// englobe AppNav ET le body), GameSession peut maintenant pousser l'id
/// vers le haut via un setter, et AppNav le lit. Même pattern que NavPaper.
type CurrentQuestionCtx = {
  id: string | null;
  setId: (id: string | null) => void;
};
const CurrentQuestionContext = createContext<CurrentQuestionCtx>({
  id: null,
  setId: () => {},
});

export function CurrentQuestionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [id, setId] = useState<string | null>(null);
  const value = useMemo(() => ({ id, setId }), [id]);
  return (
    <CurrentQuestionContext.Provider value={value}>
      {children}
    </CurrentQuestionContext.Provider>
  );
}

/// Hook côté GameSession : pousse l'id de la question courante dans le
/// contexte (consommé par AppNav pour afficher le FavoriteToggle). Reset
/// auto à null à l'unmount (sortie du flow de jeu). No-op silencieux si
/// pas de provider au-dessus (cas standalone sans AppShell).
export function useSetCurrentQuestion(id: string | null) {
  const { setId } = useContext(CurrentQuestionContext);
  useEffect(() => {
    setId(id);
    return () => setId(null);
  }, [id, setId]);
}

/// Variante "paper" du nav — utilisée pendant la phase dossier d'une partie
/// (le fond passe de cream à paper pour matcher l'écran sous-jacent). Comme
/// l'AppNav est hoistée hors de QuestionRunner, on communique via contexte :
/// QuestionRunner appelle `useSetNavPaper(phase === "dossier")` qui pousse
/// l'état dans le provider monté par AppShell.
type NavPaperCtx = { paper: boolean; setPaper: (v: boolean) => void };
const NavPaperContext = createContext<NavPaperCtx>({
  paper: false,
  setPaper: () => {},
});

export function NavPaperProvider({ children }: { children: React.ReactNode }) {
  const [paper, setPaper] = useState(false);
  const value = useMemo(() => ({ paper, setPaper }), [paper]);
  return (
    <NavPaperContext.Provider value={value}>{children}</NavPaperContext.Provider>
  );
}

/// Hook côté QuestionRunner : signale à l'AppNav qu'on est en mode paper.
/// Reset auto à false à l'unmount (sortie de game). Si pas de provider au-
/// dessus (cas /q/[slug] standalone sans AppShell), c'est un no-op silencieux.
export function useSetNavPaper(paper: boolean) {
  const { setPaper } = useContext(NavPaperContext);
  useEffect(() => {
    setPaper(paper);
    return () => setPaper(false);
  }, [paper, setPaper]);
}

export function AppNav({
  onNavigate,
}: {
  onNavigate?: (target: NavTarget) => void;
}) {
  const resolvedActive = useContext(ActiveModeContext);
  const { paper } = useContext(NavPaperContext);
  const { progress, hydrated } = useProgress();

  // hasData drive l'état "Réviser" : grisé tant que l'utilisateur n'a
  // aucune réponse à revoir.
  const hasData = hydrated && answeredCount(progress) > 0;

  // Question en cours : poussée par GameSession via `useSetCurrentQuestion`.
  // Permet d'afficher un FavoriteToggle dans le header pendant le jeu.
  const { id: currentQuestionId } = useContext(CurrentQuestionContext);

  // Pastille notif "Défier" : alimentée par le polling UnseenDefisProvider
  // monté dans AppShell. Hors AppShell le hook retombe sur 0 (pas de
  // provider au-dessus → pas de pastille parasite).
  const { total: unseenTotal } = useUnseenDefis();

  const items: NavItem[] = [
    { target: "daily", label: "Question du jour" },
    { target: "themes", label: "Découvrir" },
    { target: "review", label: "Réviser", disabled: !hasData },
    { target: "challenge", label: "Défier" },
  ];

  function go(target: NavTarget) {
    onNavigate?.(target);
  }

  return (
    <div className={"dt-nav" + (paper ? " is-paper" : "")}>
      <div className="dt-nav-inner">
        <div className="dt-nav-left">
          {/* LayoutGroup englobe le logo ET les NavLink : l'underline
              (un seul motion.span avec layoutId stable) glisse entre eux
              quand activeMode change. Comme l'AppNav est persistante (une
              seule instance dans AppShell), le LayoutGroup ne démonte pas,
              donc framer-motion garde ses repères et n'invente pas
              d'animation d'entrée parasite. Pas de prop `id` sur le
              LayoutGroup : on veut un scope local, pas un share global. */}
          <LayoutGroup>
            <Link
              href="/"
              aria-label="Retour à l'accueil"
              aria-current={resolvedActive === "home" ? "page" : undefined}
              onClick={(e) => {
                // Click gauche sans modifier → pushScene (préserve state +
                // évite re-mount). Middle/Ctrl/Meta laisse Next.js ouvrir
                // dans un nouvel onglet via le href canonique.
                if (isPlainLeftClick(e)) {
                  e.preventDefault();
                  go("home");
                }
              }}
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <NavLogo isActive={resolvedActive === "home"} />
            </Link>
            <nav className="dt-nav-links" aria-label="Navigation principale">
              {items.map((it) => (
                <NavLink
                  key={it.target}
                  href={hrefForTarget(it.target)}
                  label={it.label}
                  isActive={resolvedActive === it.target}
                  disabled={it.disabled}
                  onClick={() => !it.disabled && go(it.target)}
                  badgeCount={
                    it.target === "challenge" && unseenTotal > 0
                      ? unseenTotal
                      : 0
                  }
                />
              ))}
            </nav>
          </LayoutGroup>
        </div>

        <div className="dt-nav-right" style={{ display: "flex", gap: 4 }}>
          {/* Étoile contextuelle : visible uniquement quand on a une
              question en cours (game scene). */}
          {currentQuestionId ? (
            <FavoriteToggle questionId={currentQuestionId} size="md" />
          ) : null}
          <PdfHeaderButton />
          <UserMenu onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

function NavLogo({ isActive }: { isActive?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "var(--font-display)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: 30,
          height: 30,
        }}
        aria-hidden
      >
        <BrandIcon size={30} />
      </span>
      <span
        style={{
          position: "relative",
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: "-0.02em",
          color: "var(--ink)",
          padding: "4px 0",
        }}
      >
        Mon<span style={{ color: "var(--coral)" }}>2027</span>
        {isActive ? (
          <motion.span
            aria-hidden
            layoutId="app-nav-underline"
            initial={false}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 1.5,
              background: "var(--coral)",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </span>
    </div>
  );
}

/// Tag de click "plain left click" (sans modifier key) → on intercepte pour
/// piloter la nav en interne via pushScene. Tous les autres cas (middle,
/// Ctrl, Meta, Shift) laissent le navigateur faire son boulot via le href
/// du `<Link>` — typiquement, ouvrir dans un nouvel onglet.
function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

function NavLink({
  href,
  label,
  isActive,
  disabled,
  onClick,
  badgeCount = 0,
}: {
  href: string;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /// Pastille rouge avec compteur affichée en haut-droite du label. 0 = pas
  /// de pastille. Cappé visuellement à "9+" (cf. NavBadge) pour ne pas
  /// gonfler la nav. Aujourd'hui utilisé seulement pour "Défier" — le
  /// design est générique pour qu'on puisse en ajouter ailleurs sans
  /// dupliquer la pastille.
  badgeCount?: number;
}) {
  // Si l'utilisateur est sur la page (isActive), on neutralise le disabled :
  // garder l'item grisé alors qu'on est dessus produit une contradiction
  // visuelle ("désactivé mais sélectionné"). C'est typiquement le cas de
  // Réviser : l'utilisateur peut atterrir sur /?s=review via URL directe
  // même sans données, et l'item doit s'éclairer comme item courant.
  const visuallyDisabled = !!disabled && !isActive;
  const style: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    background: "transparent",
    border: 0,
    padding: "4px 0",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: visuallyDisabled
      ? "var(--ink-mute)"
      : isActive
        ? "var(--ink)"
        : "var(--ink-soft)",
    cursor: visuallyDisabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    opacity: visuallyDisabled ? 0.6 : 1,
    transition: "color 0.18s cubic-bezier(.2,.7,.2,1)",
    textDecoration: "none",
  };

  // État disabled : on rend en <span> pour éviter qu'un middle-click ouvre
  // une page vers un mode pas encore accessible (Réviser sans réponses).
  if (visuallyDisabled) {
    return (
      <span aria-disabled style={style} suppressHydrationWarning>
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (isPlainLeftClick(e)) {
          e.preventDefault();
          onClick();
        }
      }}
      suppressHydrationWarning
      aria-current={isActive ? "page" : undefined}
      aria-label={
        badgeCount > 0
          ? `${label}, ${badgeCount} nouvelle${badgeCount > 1 ? "s" : ""} réponse${badgeCount > 1 ? "s" : ""}`
          : undefined
      }
      style={style}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.color = "var(--ink)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.color = "var(--ink-soft)";
      }}
    >
      {label}
      {badgeCount > 0 ? <NavBadge count={badgeCount} /> : null}
      {isActive ? <Underline label={label} /> : null}
    </Link>
  );
}

/// Pastille de notif rouge posée en haut-droite d'un NavLink. Format
/// identique à la pastille du BottomTabBar pour rester cohérent visuel
/// mobile ↔ desktop : pillule coral, texte mono, halo cream pour
/// décoller du fond cream du dt-nav.
function NavBadge({ count }: { count: number }) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: -6,
        right: -14,
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 999,
        background: "var(--coral, #e0524a)",
        color: "var(--cream-warm, #faf6ed)",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: 10,
        lineHeight: "16px",
        textAlign: "center",
        boxShadow: "0 0 0 2px var(--cream, #f4eee0)",
        pointerEvents: "none",
      }}
    >
      {label}
    </span>
  );
}

/// Wrapper sur le motion.span pour pouvoir tracer son mount/unmount par item.
/// L'animation glide entre items vient du fait que cet élément démonte sous
/// l'ancien NavLink et remonte sous le nouveau, avec le même layoutId.
///
/// `layoutDependency={label}` : framer-motion ne mesure la layout (et ne
/// déclenche d'animation spring) QUE quand `label` change. Sans ça, chaque
/// re-render mesure la position absolue du span, et un éventuel reflow
/// horizontal — apparition/disparition de la scrollbar verticale, par
/// exemple — fait croire à framer-motion que l'underline a glissé, et il
/// rejoue un spring qui simule le "underline qui se remet en place".
function Underline({ label }: { label: string }) {
  return (
    <motion.span
      aria-hidden
      layoutId="app-nav-underline"
      layoutDependency={label}
      initial={false}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 1.5,
        background: "var(--coral)",
        pointerEvents: "none",
      }}
    />
  );
}

// ============================================================================
// AppFooter — liens discrets Méthode / À propos sur chaque page desktop.
// (Pour le mobile, on utilise déjà SecondaryLinks dans home-bits.tsx.)
// ============================================================================

export function AppFooter({
  onNavigate,
}: {
  onNavigate?: (target: NavTarget) => void;
}) {
  const linkStyle: React.CSSProperties = {
    background: "transparent",
    border: 0,
    cursor: "pointer",
    color: "inherit",
    padding: 0,
    fontFamily: "var(--font-body)",
    fontSize: 13,
  };
  return (
    <footer
      style={{
        padding: "24px 32px 32px",
        textAlign: "center",
        fontSize: 13,
        color: "var(--ink-mute)",
        borderTop: "1px solid var(--rule-soft)",
        marginTop: 48,
      }}
    >
      <button
        type="button"
        onClick={() => onNavigate?.("methode")}
        style={linkStyle}
      >
        Méthode
      </button>
      <span style={{ margin: "0 10px" }}>·</span>
      <button
        type="button"
        onClick={() => onNavigate?.("apropos")}
        style={linkStyle}
      >
        À propos
      </button>
    </footer>
  );
}
