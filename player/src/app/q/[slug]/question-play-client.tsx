"use client";

/// Client de la page publique `/q/[slug]`. Friction zéro côté contenu :
/// pas de cookie banner, pas d'install prompt, pas d'inscription. En
/// revanche on garde l'AppNav (rendue par QuestionRunnerDT en desktop)
/// fonctionnelle : si le visiteur veut explorer le reste de l'app après
/// avoir joué la question partagée, les liens nav le ramènent dans
/// l'AppShell (route `/`).
///
/// GameSession sur 1 seule question (réutilise tout le pipeline play+reveal).
/// À la fin (onDone), bascule sur un écran "Partager · Découvrir l'app".

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameSession } from "@/components/game-session";
import { loadActiveSession } from "@/lib/active-session";
import {
  ActiveModeProvider,
  AppNav,
  CurrentQuestionProvider,
  NavPaperProvider,
} from "@/components/desktop/app-nav";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import {
  DefiSecondaryBtn,
  DI,
} from "@/components/defi-bits";
import type { NavTarget, Question } from "@/lib/types";
import { copyToClipboard } from "@/lib/clipboard";

type Step = "play" | "share";

export function QuestionPlayClient({
  question,
  slug,
}: {
  question: Question;
  slug: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("play");

  // Reprise de session après reload : pendant une série / un thème / un défi,
  // l'URL est cosmétiquement `/q/[slug]` (cf. GameSession). Un reload atterrit
  // donc ICI, sur la question isolée, en perdant le contexte. Si le localStorage
  // contient une session active dont la question COURANTE est ce slug, on
  // redirige vers `/?s=game` où l'AppShell restaure la session complète.
  //
  // On ne redirige que si le slug correspond à la question en cours de la
  // session : un ami qui ouvre un lien partagé n'a pas cette session locale (ou
  // pas sur ce slug) → comportement normal de question isolée, inchangé.
  //
  // `resuming` masque le rendu le temps de la redirection pour éviter de jouer
  // la question puis de sauter. Décision prise après hydratation (localStorage
  // indispo en SSR), d'où l'état plutôt qu'un calcul au render initial.
  const [resuming, setResuming] = useState(false);
  useEffect(() => {
    const saved = loadActiveSession();
    if (saved && saved.slugs[saved.idx] === slug) {
      // setState synchrone assumé : la décision dépend du localStorage,
      // indispo en SSR, donc on ne peut la prendre qu'après hydratation. Le
      // setResuming masque juste le flash avant le router.replace.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResuming(true);
      router.replace("/?s=game");
    }
  }, [slug, router]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/q/${slug}`
      : `/q/${slug}`;

  /// Le visiteur est sur la route publique standalone, hors AppShell. Les
  /// clics dans l'AppNav (rendue par GameSession's runner) doivent donc
  /// faire une vraie navigation Next.js vers la racine de l'app — où le
  /// AppShell prendra le relais avec la scène demandée.
  function handleNavigate(target: NavTarget) {
    switch (target) {
      case "home":
      case "daily":
        // "daily" lance la question du jour, mais ça nécessite AppShell —
        // on renvoie sur la home qui propose la question du jour en hero.
        router.push("/");
        break;
      case "themes":
        router.push("/?s=themes");
        break;
      case "review":
        router.push("/?s=review");
        break;
      case "challenge":
        router.push("/?s=challenge");
        break;
      case "favorites":
        router.push("/?s=favorites");
        break;
      case "account":
        router.push("/?s=account");
        break;
      case "stats":
        router.push("/?s=stats");
        break;
      case "methode":
        router.push("/?s=methode");
        break;
      case "apropos":
        router.push("/?s=apropos");
        break;
    }
  }

  // Redirection de reprise en cours : on n'affiche rien pour ne pas flasher la
  // question isolée avant le saut vers `/?s=game`.
  if (resuming) return null;

  return (
    <ActiveModeProvider value={null}>
      <NavPaperProvider>
        <CurrentQuestionProvider>
          <div
            style={{
              minHeight: "100dvh",
              background: "var(--cream)",
              color: "var(--ink)",
              display: "flex",
              flexDirection: "column",
              fontFamily: "var(--font-body)",
            }}
          >
            {/* AppNav desktop persistante (cachée par CSS sur mobile). Aucun
                item du nav n'est marqué actif (activeMode=null) : le
                visiteur arrive depuis l'extérieur, ce n'est pas une scène
                dans la timeline de l'app.
                CurrentQuestionProvider englobe AppNav + body pour que
                GameSession puisse pousser l'id courant (via
                useSetCurrentQuestion) et qu'AppNav affiche le FavoriteToggle. */}
            <AppNav onNavigate={handleNavigate} />

            {step === "play" ? (
              <GameSession
                questions={[question]}
                // Session à 1 seule question : pas de récap pertinent (l'unique
                // réponse vient juste d'être révélée). On envoie le visiteur
                // direct sur Découvrir — le bouton final du reveal lit déjà
                // "Découvrir" (cf. RevealActionBar). Le ShareScreen est gardé
                // accessible via `setStep("share")` mais plus déclenché
                // automatiquement : il sert au fallback "Rejouer cette
                // question" (cf. plus loin) et au cas où un futur flow
                // voudrait y router.
                onDone={() => router.push("/?s=themes")}
              />
            ) : (
              <ShareScreen
                question={question}
                shareUrl={shareUrl}
                onPlayAgain={() => setStep("play")}
              />
            )}

            {/* Mobile : bottom tab bar uniquement sur l'écran de partage —
                pendant le jeu, on reste immersif (cohérent avec AppShell qui
                masque la barre pendant les flows de partie). La barre est
                auto-cachée sur desktop via media query CSS. */}
            {step === "share" ? (
              <BottomTabBar active="home" onNavigate={handleNavigate} />
            ) : null}
          </div>
        </CurrentQuestionProvider>
      </NavPaperProvider>
    </ActiveModeProvider>
  );
}

function ShareScreen({
  question,
  shareUrl,
  onPlayAgain,
}: {
  question: Question;
  shareUrl: string;
  onPlayAgain: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const nav: Navigator | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) {
      try {
        await nav.share({
          title: question.question,
          text: "Une question civique sourcée sur Mon2027 :",
          url: shareUrl,
        });
        return;
      } catch {
        /* user cancelled, fall through to copy */
      }
    }
    await copy();
  }

  async function copy() {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div
      className="with-bottom-bar"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        // Padding split (pas de shorthand) : la classe .with-bottom-bar ajoute
        // un padding-bottom qui réserve la hauteur de la BottomTabBar + safe-area.
        // Un `padding: "32px 24px"` inline expand `padding-bottom: 32px` et
        // écrase la règle de la classe — ce qui faisait passer le dernier
        // bouton sous la barre sur mobile.
        paddingTop: 32,
        paddingLeft: 24,
        paddingRight: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Tu as fini cette question
        </div>

        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 32,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            textWrap: "balance",
          }}
        >
          Tu veux{" "}
          <span style={{ color: "var(--coral)" }}>en savoir plus</span> ?
        </div>

        <div
          style={{
            marginTop: 14,
            fontFamily: "var(--font-serif)",
            fontSize: 15,
            color: "var(--ink-soft)",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          Plus de 400 questions civiques sourcées t&apos;attendent sur l&apos;app :
          immigration, économie, sécurité, climat, institutions. Avant de
          voter en 2027, teste ce que tu crois savoir.
        </div>

        {/* CTA primaire : Découvrir. Avant la page était hyper-orientée
            partage (bouton noir = Partager + 3 CTA secondaires), peu de
            chemin clair pour continuer dans l'app. Maintenant Découvrir
            est primaire ; partager / rejouer / copier vivent en
            secondaires. */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Link
            href="/?s=themes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "var(--ink)",
              color: "var(--cream-warm)",
              border: 0,
              borderRadius: 16,
              padding: "16px 22px",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: "-0.01em",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            <DI.Sparkle size={16} />
            Découvrir d&apos;autres questions
          </Link>
          <DefiSecondaryBtn onClick={onPlayAgain}>
            Rejouer cette question
          </DefiSecondaryBtn>
        </div>

        {/* Section partage en bas, plus discrète : on garde l'URL visible
            et les 2 boutons partager/copier, mais en outline (pas remplis
            noir) pour signaler que c'est secondaire face à Découvrir. */}
        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: "1px solid var(--rule-soft)",
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
              marginBottom: 12,
            }}
          >
            Ou partage cette question
          </div>
          <div
            style={{
              padding: "10px 14px",
              background: "var(--cream-warm)",
              border: "1.5px solid var(--rule)",
              borderRadius: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-soft)",
              letterSpacing: "0.02em",
              wordBreak: "break-all",
              textAlign: "left",
              marginBottom: 10,
            }}
          >
            {shareUrl}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DefiSecondaryBtn onClick={handleShare}>
              <DI.Share size={14} />
              Partager · WhatsApp, SMS…
            </DefiSecondaryBtn>
            <button
              type="button"
              onClick={copy}
              style={{
                background: copied
                  ? "rgba(74,143,92,0.12)"
                  : "transparent",
                color: copied ? "var(--signal-good)" : "var(--ink-soft)",
                border: `1.5px solid ${
                  copied ? "rgba(74,143,92,0.4)" : "var(--rule)"
                }`,
                borderRadius: 14,
                padding: "10px 16px",
                fontFamily: "var(--font-display)",
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.2s",
              }}
            >
              {copied ? <DI.Check /> : <DI.Copy size={14} />}
              {copied ? "Lien copié" : "Copier le lien"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
