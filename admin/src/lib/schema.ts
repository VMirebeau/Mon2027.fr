import { z } from "zod";
import { INDICATORS, MAX_INDICATORS_PER_QUESTION } from "@/lib/constants";

const INDICATOR_IDS = INDICATORS.map((i) => i.value) as [string, ...string[]];

/// Messages d'erreur : ils s'affichent tels quels sous les champs, pour des
/// contributeurs qui ne lisent pas le JSON. Français clair, pas de jargon
/// (« strings », « payload », « slug »…). Les noms de clés n'apparaissent que
/// pour les formats saisis en JSON (format avancé), où ils aident à s'y
/// retrouver.

/// Nombre facultatif saisi dans un <input type="number"> : chaîne vide →
/// undefined. L'ordre de l'union compte : `z.coerce.number()` en premier
/// transformait "" en 0 (Number("") === 0), si bien qu'une « Réponse
/// correcte » oubliée était enregistrée comme 0 sans aucune erreur, et
/// qu'une tolérance laissée vide valait 0 au lieu de la valeur par défaut du
/// player.
const optionalNumber = () =>
  z
    .union([z.literal("").transform(() => undefined), z.coerce.number({ error: "Nombre attendu" })], {
      error: "Nombre attendu",
    })
    .optional();

export const indicatorEntrySchema = z.object({
  id: z.enum(INDICATOR_IDS, { error: "Indicateur inconnu" }),
  polarity: z.union([z.literal(1), z.literal(-1)], { error: "Polarité : +1 ou −1" }),
});

export const sourceSchema = z.object({
  nom: z.string().min(1, "Nom de la source requis"),
  /// URL doit explicitement commencer par http:// ou https:// pour empêcher
  /// d'injecter un schéma `javascript:` ou `data:` dans un <a href>. Sans cette
  /// regex, Zod accepterait `javascript:alert(1)` car son URL parser ne filtre
  /// pas les schémas. Defense-in-depth contre un admin compromis.
  url: z
    .string()
    .url("Adresse web invalide (ex. https://www.insee.fr/…)")
    .regex(/^https?:\/\//i, "L'adresse doit commencer par http:// ou https://"),
  type: z.enum(["primaire", "triangulation"], { error: "Type de source inconnu" }).default("primaire"),
  ordre: z.coerce.number({ error: "Ordre invalide" }).int("Ordre invalide").min(0, "Ordre invalide").default(0),
});

export const questionSchema = z
  .object({
    customId: z
      .string()
      .trim()
      .regex(/^[A-Z0-9\-_]*$/u, "Majuscules, chiffres, tirets et _ uniquement (ex. Q-IMM-001)")
      .optional()
      .or(z.literal("")),
    /// « Adresse courte » dans l'interface : slug des URLs publiques
    /// /q/[slug]. Optionnel. Minuscules, chiffres, tirets. Pas d'espaces, pas
    /// de tiret en début/fin.
    slug: z
      .string()
      .trim()
      .regex(
        /^([a-z0-9]+(-[a-z0-9]+)*)?$/u,
        "Minuscules, chiffres et tirets uniquement, sans tiret au début ni à la fin (ex. pourcentage-immigres)"
      )
      .max(60, "60 caractères maximum")
      .optional()
      .or(z.literal("")),
    theme: z.string().min(1, "Choisis un thème"),
    sousTheme: z.string().optional().or(z.literal("")),
    format: z.enum([
      "estimation_numerique",
      "qcm",
      "vrai_faux",
      "ab",
      "classement",
      "vraifaux_multi",
      "curseur_multi",
      "categorisation",
      "pondere",
    ], { error: "Format inconnu" }),
    statut: z
      .enum(["brouillon", "revue", "publie", "retire"], { error: "Statut inconnu" })
      .default("brouillon"),
    sensibilite: z
      .enum(["standard", "haute", "critique"], { error: "Sensibilité inconnue" })
      .default("standard"),
    difficulte: z.coerce
      .number({ error: "La difficulté est un nombre de 1 à 5" })
      .int("La difficulté est un nombre entier de 1 à 5")
      .min(1, "La difficulté va de 1 à 5")
      .max(5, "La difficulté va de 1 à 5")
      .default(3),

    question: z.string().min(5, "La question est requise (5 caractères au moins)"),
    precisions: z.string().optional().or(z.literal("")),
    explication: z.string().min(5, "L'explication est requise (5 caractères au moins)"),
    contextePedagogique: z.string().optional().or(z.literal("")),
    /// Mise en perspective (1 à 3 phrases) qui contextualise le chiffre :
    /// évolution temporelle, comparaison UE, trajectoire. Optionnel.
    miseEnPerspective: z.string().optional().or(z.literal("")),
    /// 0 à 3 indicateurs transverses avec polarité ±1. Stocké en JSON sur
    /// la colonne `Question.indicators`. Plafond aligné avec
    /// `parseQuestionIndicators` côté player.
    indicators: z
      .array(indicatorEntrySchema)
      .max(MAX_INDICATORS_PER_QUESTION, `Maximum ${MAX_INDICATORS_PER_QUESTION} indicateurs`)
      .default([]),

    unite: z.string().optional().or(z.literal("")),
    plageMin: optionalNumber(),
    plageMax: optionalNumber(),
    reponseNumerique: optionalNumber(),
    toleranceVerte: optionalNumber(),
    toleranceOrange: optionalNumber(),

    payload: z.string().optional().or(z.literal("")),

    dateDonnee: z
      .union(
        [
          z.literal("").transform(() => undefined),
          z.coerce.number().int().min(1900).max(2100),
        ],
        { error: "Année entre 1900 et 2100 (ex. 2023)" },
      )
      .optional(),
    auteur: z.string().min(1, "Auteur requis"),
    valideurs: z.string().optional().or(z.literal("")),

    sources: z.array(sourceSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const seenIndicatorIds = new Set<string>();
    for (let i = 0; i < data.indicators.length; i++) {
      const id = data.indicators[i].id;
      if (seenIndicatorIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["indicators"],
          message: `Indicateur « ${INDICATORS.find((i) => i.value === id)?.label ?? id} » en double : un seul par axe.`,
        });
        break;
      }
      seenIndicatorIds.add(id);
    }
    if (data.format === "estimation_numerique") {
      if (data.reponseNumerique === undefined || data.reponseNumerique === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reponseNumerique"],
          message: "Indique la réponse correcte",
        });
      }
      if (data.plageMin === undefined || data.plageMax === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["plageMin"],
          message: "Indique les bornes min et max du curseur",
        });
      }
    } else {
      if (!data.payload || data.payload.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payload"],
          message: "Les réponses sont requises pour ce format (choix et bonne réponse)",
        });
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.payload);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["payload"],
            message: "Format avancé : JSON invalide (virgule, guillemet ou accolade manquant ?)",
          });
          return;
        }
        const issue = validatePayloadShape(data.format, parsed);
        if (issue) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["payload"],
            message: issue,
          });
        }
      }
    }
  });

/// Validation du payload JSON par format. Sans cette vérification, un payload
/// mal formé passe Zod (juste "JSON parseable") puis disparaît silencieusement
/// côté player parce que `mapVariant` retourne `null` pour les payloads non
/// reconnus — l'utilisateur n'a aucun feedback côté admin. Cette fonction
/// renvoie le message d'erreur si la forme est incorrecte, ou `null` sinon.
///
/// On reste sur des contrôles minimums (présence + types des champs critiques),
/// pas une validation exhaustive : la rédaction admin doit pouvoir tester des
/// brouillons sans être bloquée par une trop-grande rigidité.
function validatePayloadShape(
  format: Exclude<QuestionInput["format"], "estimation_numerique">,
  raw: unknown,
): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return "Format avancé : le contenu doit être un objet JSON, entre accolades { … }";
  }
  const p = raw as Record<string, unknown>;

  switch (format) {
    case "ab":
    case "qcm": {
      if (!Array.isArray(p.choix) || p.choix.length < 2) {
        return "Il faut au moins 2 choix";
      }
      if (!p.choix.every((c) => typeof c === "string" && c.length > 0)) {
        return "Chaque choix doit avoir un texte";
      }
      if (typeof p.indexCorrect !== "number" || p.indexCorrect < 0 || p.indexCorrect >= p.choix.length) {
        return "Marque la bonne réponse parmi les choix";
      }
      return null;
    }
    case "vrai_faux": {
      if (typeof p.reponseCorrecte !== "boolean") {
        return "Indique si la bonne réponse est Vrai ou Faux";
      }
      return null;
    }
    case "classement": {
      if (!Array.isArray(p.items) || p.items.length < 3) {
        return "Il faut au moins 3 éléments à classer";
      }
      return null;
    }
    case "vraifaux_multi": {
      if (!Array.isArray(p.affirmations) || p.affirmations.length < 2) {
        return "Il faut au moins 2 affirmations (clé « affirmations »)";
      }
      for (let i = 0; i < p.affirmations.length; i++) {
        const a = p.affirmations[i];
        if (!a || typeof a !== "object" || Array.isArray(a)) {
          return `Affirmation n° ${i + 1} : objet JSON attendu, entre accolades { … }`;
        }
        const obj = a as Record<string, unknown>;
        const text = obj.texte ?? obj.text;
        const correct = obj.vrai ?? obj.correct;
        if (typeof text !== "string" || text.length === 0) {
          return `Affirmation n° ${i + 1} : texte manquant (clé « texte »)`;
        }
        if (typeof correct !== "boolean") {
          return `Affirmation n° ${i + 1} : indique si elle est vraie (clé « vrai » : true ou false)`;
        }
      }
      return null;
    }
    case "curseur_multi": {
      const echelle = p.echelle as Record<string, unknown> | undefined;
      if (!echelle || typeof echelle !== "object") {
        return "Échelle manquante (clé « echelle » : { min, max, unite })";
      }
      const min = Number(echelle.min);
      const max = Number(echelle.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        return "Échelle : min et max doivent être des nombres, avec min plus petit que max";
      }
      if (!Array.isArray(p.items) || p.items.length < 2) {
        return "Il faut au moins 2 points à placer sur l'échelle (clé « items »)";
      }
      return null;
    }
    case "categorisation": {
      if (!Array.isArray(p.categories) || p.categories.length < 2) {
        return "Il faut au moins 2 catégories (clé « categories »)";
      }
      if (!Array.isArray(p.etiquettes) || p.etiquettes.length < 2) {
        return "Il faut au moins 2 étiquettes à classer (clé « etiquettes »)";
      }
      return null;
    }
    case "pondere": {
      if (!Array.isArray(p.parts) || p.parts.length < 2) {
        return "Il faut au moins 2 parts à répartir (clé « parts »)";
      }
      return null;
    }
    default:
      return null;
  }
}

export type QuestionInput = z.infer<typeof questionSchema>;
export type SourceInput = z.infer<typeof sourceSchema>;
