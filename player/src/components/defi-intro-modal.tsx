"use client";

/// Modal d'accueil affichée quand le militant lance un défi « Sur un thème ».
/// Sans elle, choisir un thème le projette direct sur une nouvelle série de
/// questions sans qu'il comprenne ce qu'il fait. On l'affiche AVANT de monter
/// GameSession — voir app-shell `defiIntroPending`.

import { Modal } from "./modal";

export function DefiIntroModal({
  themeLabel,
  onStart,
  onCancel,
}: {
  /// Libellé du thème choisi (ex. « Santé »), affiché pour contextualiser.
  /// Null si indisponible — le texte reste cohérent sans.
  themeLabel: string | null;
  /// « C'est parti » : monte GameSession et démarre le chrono.
  onStart: () => void;
  /// Fermeture (X / clic dehors / Escape) : abandonne le défi et renvoie au
  /// choix du thème.
  onCancel: () => void;
}) {
  return (
    <Modal open onClose={onCancel} ariaLabel="Comment fonctionne le défi" size="sm">
      <h3
        style={{
          margin: "0 0 12px",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.02em",
          color: "var(--ink)",
        }}
      >
        Crée ton défi&nbsp;{themeLabel ? `« ${themeLabel} »` : ""}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--ink-soft)",
        }}
      >
        Tu vas répondre à <strong>5 questions tirées au hasard</strong>
        {themeLabel ? ` sur le thème « ${themeLabel} »` : " sur ce thème"}. Une
        fois terminé, tu pourras <strong>partager ces questions et ton score</strong>
        {" "}avec un·e proche pour le·la défier&nbsp;!
      </p>
      <div
        style={{
          marginTop: 22,
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid var(--rule)",
            background: "transparent",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          Changer de thème
        </button>
        <button
          type="button"
          onClick={onStart}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: 0,
            background: "var(--ink)",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--cream-warm)",
            cursor: "pointer",
          }}
        >
          C&apos;est parti&nbsp;!
        </button>
      </div>
    </Modal>
  );
}
