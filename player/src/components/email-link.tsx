"use client";

import { useEffect, useState } from "react";
import { CONTACT_HOST, CONTACT_USER } from "@/lib/contact";

// L'adresse n'apparaît jamais dans le DOM sous sa forme `user@host`.
// Le texte affiché est inversé puis remis à l'endroit visuellement via
// `direction: rtl` + `unicode-bidi: bidi-override`. Les scrapers qui
// lisent `textContent` / `innerText` ne récupèrent qu'une chaîne renversée
// (par ex. "gro.elpmaxe@tcatnoc") qui ne matche pas une vraie adresse.
const REVERSED = (CONTACT_USER + "@" + CONTACT_HOST)
  .split("")
  .reverse()
  .join("");

function ObfuscatedAddress() {
  return (
    <span
      style={{
        unicodeBidi: "bidi-override",
        direction: "rtl",
        whiteSpace: "nowrap",
      }}
    >
      {REVERSED}
    </span>
  );
}

export function EmailAddress() {
  return <ObfuscatedAddress />;
}

// Anchor cliquable qui ouvre le mailto au clic. Le `href` n'est jamais
// rendu côté serveur ; il est posé après hydration et reconstruit à la
// volée à partir des constantes JS, jamais stocké dans le DOM.
export function EmailLink({
  children,
  className,
  style,
  ariaLabel,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const [ready, setReady] = useState(false);
  // Détection "client side" après hydration : un effet vide [] qui flip
  // une fois ne cascade rien, mais le linter Next 16 ne sait pas le prouver
  // statiquement.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  function open(e: React.MouseEvent) {
    e.preventDefault();
    if (!ready) return;
    window.location.href = "mailto:" + CONTACT_USER + "@" + CONTACT_HOST;
  }

  return (
    <a
      // Avant hydration : pas d'href du tout. Après hydration : un href
      // bidon qui ne sert qu'à activer le styling :hover et le focus
      // clavier — l'ouverture réelle passe par onClick.
      href={ready ? "#contact" : undefined}
      onClick={open}
      onAuxClick={open}
      role="button"
      aria-label={ariaLabel ?? "Envoyer un mail au contact du projet"}
      className={className}
      style={style}
    >
      {children ?? <ObfuscatedAddress />}
    </a>
  );
}
