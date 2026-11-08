"use client";

/// Sélectionne une question par format (parmi publiées d'abord, sinon parmi
/// les samples Q-TST-*) pour la scène-nav dev. Bundle les 8 useMemo qui
/// vivaient inline dans l'AppShell : un seul retour `demos` regroupe tous
/// les formats, prêt à passer à `sceneToSoloQuestion`.
///
/// En dev, on cherche d'abord parmi les publiées (pour voir le contenu réel),
/// puis on retombe sur le sample Q-TST-* si rien n'est encore publié pour ce
/// format. Évite que la scène nav soit cassée quand un format n'a pas encore
/// de question publiée.

import { useCallback, useMemo } from "react";
import type {
  AbQuestion,
  CategorisationQuestion,
  ClassementQuestion,
  CurseurMultiQuestion,
  EstimationQuestion,
  PondereQuestion,
  QcmQuestion,
  Question,
  VraiFauxMultiQuestion,
  VraiFauxQuestion,
} from "@/lib/types";

export type DevDemos = {
  estim: EstimationQuestion | null;
  tf: VraiFauxQuestion | null;
  ab: AbQuestion | null;
  qcm: QcmQuestion | null;
  classement: ClassementQuestion | null;
  vftfMulti: VraiFauxMultiQuestion | null;
  curseurMulti: CurseurMultiQuestion | null;
  cat: CategorisationQuestion | null;
  pondere: PondereQuestion | null;
};

export function useDevDemos(
  questions: Question[],
  devSamples: Question[],
): DevDemos {
  // useCallback pour stabiliser la référence : le useMemo en-dessous dépend
  // de cette fonction et ne doit pas recalculer à chaque render. Les vraies
  // sources de changement sont questions + devSamples.
  type DevPick = <T extends Question>(format: T["format"]) => T | null;
  const devPickByFormat = useCallback<DevPick>(
    <T extends Question>(format: T["format"]): T | null => {
      const fromPub = questions.find((q): q is T => q.format === format);
      if (fromPub) return fromPub;
      const fromDev = devSamples.find((q): q is T => q.format === format);
      return fromDev ?? null;
    },
    [questions, devSamples],
  );

  return useMemo<DevDemos>(
    () => ({
      estim: devPickByFormat<EstimationQuestion>("estimation"),
      tf: devPickByFormat<VraiFauxQuestion>("vraifaux"),
      ab: devPickByFormat<AbQuestion>("ab"),
      qcm: devPickByFormat<QcmQuestion>("qcm"),
      classement: devPickByFormat<ClassementQuestion>("classement"),
      vftfMulti: devPickByFormat<VraiFauxMultiQuestion>("vraifaux_multi"),
      curseurMulti: devPickByFormat<CurseurMultiQuestion>("curseur_multi"),
      cat: devPickByFormat<CategorisationQuestion>("categorisation"),
      pondere: devPickByFormat<PondereQuestion>("pondere"),
    }),
    [devPickByFormat],
  );
}
