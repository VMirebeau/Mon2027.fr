"use client";

/// Page "Mon compte" desktop. Layout 2 colonnes : hero à gauche (eyebrow +
/// titre coral + description), panneau d'auth à droite (tabs + form ou,
/// quand connecté, infos + actions). La logique vit dans AccountBody pour
/// rester DRY mobile/desktop ; le flag `bareHero` lui dit de sauter ses
/// titres internes (rendus dans la colonne hero ici).

import { AppFooter } from "./app-nav";
import { AccountBody } from "../screens/account";
import { useAuth } from "@/lib/use-auth";
import type { NavTarget } from "@/lib/types";

export function AccountDT({
  onNavigate,
}: {
  onNavigate?: (target: NavTarget) => void;
}) {
  const { user, ready } = useAuth();
  return (
    <>
      <div className="dt-page">
        <div
          className="dt-content"
          style={{ paddingTop: 32, paddingBottom: 48 }}
        >
          <div className="dt-account-grid">
            <header className="dt-account-hero">
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
                Mon compte
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "clamp(40px, 4.2vw, 64px)",
                  lineHeight: 1,
                  letterSpacing: "-0.035em",
                  margin: 0,
                  textWrap: "balance",
                }}
              >
                {ready && user ? (
                  <>
                    Bonjour{" "}
                    <span style={{ color: "var(--coral)" }}>
                      {user.displayPseudo}
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Pseudo,{" "}
                    <span style={{ color: "var(--coral)" }}>sans email</span>.
                  </>
                )}
              </h1>
              <p
                style={{
                  marginTop: 20,
                  fontSize: 18,
                  lineHeight: 1.5,
                  color: "var(--ink-soft)",
                  textWrap: "balance",
                }}
              >
                {ready && user
                  ? "Ta progression est synchronisée avec ce compte. Tu peux te déconnecter, fermer toutes tes sessions, ou supprimer le compte si tu veux repartir à zéro."
                  : "Un compte sert uniquement à retrouver ta progression sur un autre appareil. Tant que tu joues sur le même navigateur, tu n'en as pas besoin."}
              </p>
            </header>

            <div className="dt-account-panel">
              <AccountBody onNavigate={onNavigate} bareHero />
            </div>
          </div>
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}
