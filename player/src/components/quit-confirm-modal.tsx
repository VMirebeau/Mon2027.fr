"use client";

import { Modal } from "./modal";

/// Confirmation « Quitter la partie ? ». Extraite de QuestionChrome
/// (ui-bits.tsx, la × du chrome) pour être réutilisée par tous les boutons
/// « Terminer » : cta-bar mobile à côté de Valider, barre d'action du
/// reveal mobile (dossier) et liens Terminer du bureau. Fichier à part
/// plutôt que dans ui-bits pour éviter un import circulaire
/// ui-bits ↔ formats/format-shared.
///
/// Le focus arrive sur « Continuer la partie » (data-autofocus) : l'action
/// sûre, pour qu'un Entrée réflexe ne coupe pas la partie.
export function QuitConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      ariaLabel="Quitter la partie"
      size="sm"
      showClose={false}
    >
      <div style={{ padding: "8px 4px 4px" }}>
        <div
          className="display"
          style={{
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            textWrap: "balance",
          }}
        >
          Quitter la partie&nbsp;?
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 14,
            color: "var(--ink-soft)",
            lineHeight: 1.45,
          }}
        >
          Tu reviendras à l&apos;écran de récap avec les réponses déjà
          données. Les questions non répondues ne comptent pas.
        </div>
        <div
          style={{
            marginTop: 22,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            style={{ width: "100%" }}
          >
            Quitter et voir le récap
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            style={{ width: "100%" }}
            data-autofocus
          >
            Continuer la partie
          </button>
        </div>
      </div>
    </Modal>
  );
}
