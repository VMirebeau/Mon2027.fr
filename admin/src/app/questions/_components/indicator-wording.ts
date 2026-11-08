import type { FormatValue } from "@/lib/constants";

/// Phrases qui expliquent le sens (la polarité ±1) d'un indicateur du
/// portrait, selon le format de la question. Elles traduisent
/// `contributionFor` et `computeIndicatorBiases`
/// (player/src/lib/progress-stats.ts) :
///   - estimation : (réponse − vraie valeur) / |vraie valeur|, bornée à ±1,
///     puis × polarité. Avec +1, une réponse trop haute pousse vers
///     « surestimer » ; avec −1, vers « sous-estimer ». Une réponse trop
///     basse pousse dans l'autre sens.
///   - vrai ou faux, A ou B, QCM : 0 si juste, 1 si faux, × polarité. Toute
///     erreur compte dans le sens choisi (+1 surestimer, −1 sous-estimer).
///   - formats composés : part d'erreurs dans [0, 1], × polarité. Le sens de
///     chaque erreur n'entre pas en compte (sur une échelle, trop haut ou trop
///     bas, c'est pareil).
/// Une réponse juste vaut 0 mais entre dans la moyenne : elle tire le score
/// vers « juste ». Score positif = « Tu surestimes <sujet> » au portrait.

export type Polarity = 1 | -1;

export type PolarityWording = {
  /// Question posée au-dessus des deux choix.
  prompt: string;
  /// Libellé du choix correspondant à une polarité.
  choice: (polarity: Polarity) => string;
  /// Phrase de synthèse pour la polarité retenue.
  summary: (polarity: Polarity) => string;
};

const lean = (polarity: Polarity, subject: string) =>
  `${polarity === 1 ? "surestimer" : "sous-estimer"} ${subject}`;

/// Ce qui compte comme une erreur dans les formats composés.
const COMPOSITE_ERRORS: Partial<Record<FormatValue, string>> = {
  vraifaux_multi: "chaque affirmation mal jugée",
  classement: "chaque élément mal placé",
  categorisation: "chaque étiquette rangée dans la mauvaise case",
  pondere: "chaque point mal réparti",
  curseur_multi: "chaque étiquette placée loin de sa vraie position, trop haut comme trop bas,",
};

export function polarityWording(format: FormatValue, subject: string): PolarityWording {
  const choice = (polarity: Polarity) => lean(polarity, subject);

  if (format === "estimation_numerique") {
    return {
      prompt: "Répondre trop haut, c'est…",
      choice,
      summary: (p) =>
        `Une estimation trop haute compte comme : ${lean(p, subject)} ; trop basse, comme : ${lean(
          p === 1 ? -1 : 1,
          subject,
        )}. Plus l'écart est grand, plus elle pèse.`,
    };
  }

  const composite = COMPOSITE_ERRORS[format];
  if (composite) {
    return {
      prompt: "Se tromper ici, c'est…",
      choice,
      summary: (p) =>
        `Ici, ${composite} compte comme : ${lean(p, subject)}. Plus il y a d'erreurs, plus la réponse pèse.`,
    };
  }

  return {
    prompt: "Se tromper ici, c'est…",
    choice,
    summary: (p) =>
      `Une réponse fausse ici compte comme : ${lean(p, subject)}.` +
      (format === "qcm" ? " Toutes les mauvaises réponses comptent pareil." : "") +
      " Une réponse juste compte comme : voir juste.",
  };
}
