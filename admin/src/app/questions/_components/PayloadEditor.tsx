"use client";

import type { FormatValue } from "@/lib/constants";
import { CategorisationEditor } from "./payload/CategorisationEditor";
import { ClassementEditor } from "./payload/ClassementEditor";
import { CurseurMultiEditor } from "./payload/CurseurMultiEditor";
import { PondereEditor } from "./payload/PondereEditor";
import { ABEditor, QCMEditor, VraiFauxEditor } from "./payload/SimpleEditors";
import { VraiFauxMultiEditor } from "./payload/VraiFauxMultiEditor";

type NonNumericFormat = Exclude<FormatValue, "estimation_numerique">;

type Props = {
  format: NonNumericFormat;
  /// JSON enregistré (colonne `payload`), ou null pour une nouvelle question.
  initial?: string | null;
};

/// « Réponse attendue » des formats autres que l'estimation. Chaque éditeur
/// envoie le JSON dans un champ caché `payload` (lu par l'action serveur et
/// validé par lib/schema). La logique JSON ↔ éditeur, testée à part, est dans
/// ./payload/ (un module par format).
///
/// Monté avec `key={format}` par QuestionForm : changer de format repart d'un
/// éditeur neuf. `initial` est alors le JSON de l'ancien format ; chaque
/// éditeur le reconnaît et ne le reprend pas (sauf les choix, entre A/B et QCM).
export function PayloadEditor({ format, initial }: Props) {
  switch (format) {
    case "vrai_faux":
      return <VraiFauxEditor initial={initial} />;
    case "ab":
      return <ABEditor initial={initial} />;
    case "qcm":
      return <QCMEditor initial={initial} />;
    case "classement":
      return <ClassementEditor initial={initial} />;
    case "vraifaux_multi":
      return <VraiFauxMultiEditor initial={initial} />;
    case "curseur_multi":
      return <CurseurMultiEditor initial={initial} />;
    case "categorisation":
      return <CategorisationEditor initial={initial} />;
    case "pondere":
      return <PondereEditor initial={initial} />;
  }
}
