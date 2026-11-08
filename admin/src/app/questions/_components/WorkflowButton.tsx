"use client";

import type { ComponentProps } from "react";
import { ActionButton } from "../../_components/ActionButton";
import { useOptionalDirty } from "./DirtyProvider";

/// Bouton du circuit de relecture (valider, publier, demander une relecture).
/// Ces actions portent sur la version ENREGISTRÉE de la question : tant que le
/// formulaire voisin a des modifications non enregistrées, on refuse d'agir
/// plutôt que de valider ou publier autre chose que ce que la personne a sous
/// les yeux.
export function WorkflowButton(props: Omit<ComponentProps<typeof ActionButton>, "blockedReason">) {
  const dirty = useOptionalDirty()?.dirty ?? false;
  return (
    <ActionButton
      {...props}
      blockedReason={
        dirty
          ? "Enregistre d'abord tes modifications : ce bouton porte sur la version enregistrée de la question."
          : undefined
      }
    />
  );
}
