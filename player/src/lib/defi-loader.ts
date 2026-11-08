/// Loader serveur pour récupérer un défi + ses questions + ses réponses.
/// Utilisé par les pages /d/[shortCode] et /d/[shortCode]/resultats (SSR).
/// Le client passe par /api/defis/[shortCode] qui appelle la même logique.

import { prisma } from "./db";
import { isValidShortCode } from "./defi-shortcode";
import {
  parseAnswersMap,
  parseQuestionIds,
  playableQuestionIds,
  reorderQuestions,
  scoreFromAnswers,
} from "./defi";
import type { DefiAnswersMap } from "./defi";
import { HOME_THEMES, loadQuestionsByIds } from "./content";
import type { Question } from "./types";

/// Label thématique dérivé des questions d'un défi. Indépendant du flow de
/// création (theme/favoris/session) : c'est le contenu qui compte pour
/// expéditeur ET destinataire (cf. discussion produit de mai 2026).
///   - 1 seul thème commun → son label ("Économie") + son slug HOME_THEMES.id
///     (utile pour résoudre la couleur côté UI)
///   - 0 ou 2+ thèmes (incl. cas où des questions ont été dépubliées) →
///     "Questions diverses" + null
export type ThemeBucket = {
  themeLabel: string;
  themeId: string | null;
};

const SLUG_BY_LABEL = new Map(HOME_THEMES.map((t) => [t.label, t.id]));

/// Calcule le bucket thématique depuis une liste de noms de thèmes
/// (= `Question.theme` brut, ex. "Économie"). La déduplication est faite
/// ici — les appelants n'ont pas à s'en soucier.
export function computeThemeFromNames(themeNames: ReadonlyArray<string>): ThemeBucket {
  const set = new Set(themeNames.filter((s) => s.length > 0));
  if (set.size === 1) {
    const [only] = set;
    return { themeLabel: only, themeId: SLUG_BY_LABEL.get(only) ?? null };
  }
  return { themeLabel: "Questions diverses", themeId: null };
}

export type LoadedDefi = {
  shortCode: string;
  creatorPseudo: string;
  creatorClientId: string;
  creatorUserId: string | null;
  /// Source de création conservée pour les analytics / cohérence (snapshot du
  /// flow d'origine). Les surfaces d'affichage utilisent themeLabel/title à
  /// la place — la source brute n'a pas d'usage UI.
  source: "theme" | "favoris" | "session";
  /// Slug HOME_THEMES.id quand le défi est mono-thème, null sinon. Pour la
  /// couleur de pastille côté UI. Recalculé depuis les questions, pas issu
  /// du champ themeId stocké en DB (qui peut être stale ou trompeur).
  themeId: string | null;
  /// Label thématique calculé : "Économie" / "Questions diverses".
  themeLabel: string;
  /// Titre libre facultatif saisi par le militant (ex. "Pour ma sœur sceptique
  /// sur le climat"). Affiché EN PLUS du themeLabel, jamais à la place.
  title: string | null;
  questions: Question[];
  /// True si certaines questionIds référencées n'existent plus en base
  /// (dépubliées entre temps).
  stale: boolean;
  creatorAnswers: DefiAnswersMap;
  /// Score du créateur recalculé sur les questions encore jouables.
  creatorScore: number;
  /// Rang de niveau (1..10) du militant au moment de la création, snapshot
  /// figé. null pour les défis créés avant l'intro du système de niveaux.
  /// Le nom du niveau est résolu côté client via LEVELS (cf. lib/gamification).
  creatorLevelRank: number | null;
  /// Nombre de questions encore jouables (≤ questionIds stockés).
  total: number;
  createdAt: Date;
  expiresAt: Date;
  isExpired: boolean;
  responses: Array<{
    amiLabel: string;
    amiClientId: string;
    /// Compte de l'ami s'il était connecté à la soumission (ou rattaché en
    /// rétro-claim quand il se connecte ensuite et revient sur /resultats).
    /// null pour les réponses purement anonymes.
    amiUserId: string | null;
    answers: DefiAnswersMap;
    score: number;
    createdAt: Date;
    /// Timestamp où le créateur a "vu" cette réponse (= ouvert /resultats
    /// avec un cookie matchant creatorClientId). NULL tant qu'il n'a pas
    /// ouvert la page depuis qu'elle a été soumise. Exposé au client UNIQUE-
    /// MENT pour le créateur (vue militant) afin d'afficher une pastille
    /// "nouveau" sur le sélecteur d'amis dans /resultats.
    seenByCreatorAt: Date | null;
  }>;
};

/// Options de chargement. `includeResponses: false` économise une jointure
/// vers DefiResponse (qui peut grossir avec la viralité d'un défi) — utilisé
/// par les chemins qui n'ont pas besoin du détail des amis ayant joué :
///   - /d/[shortCode]/page.tsx : page de jeu, ne montre pas les réponses
///   - /d/[shortCode]/opengraph-image.tsx : image OG, méta seulement
///   - /d/[shortCode]/resultats/opengraph-image.tsx : idem
/// La page /resultats elle-même garde le défaut `true` (elle affiche tous
/// les amis ayant joué).
export type LoadDefiOptions = {
  /// Par défaut true (rétro-compat). Passer false évite de remonter la
  /// table DefiResponse côté serveur — utile sur les chemins de lecture
  /// qui n'en ont pas besoin.
  includeResponses?: boolean;
};

export async function loadDefi(
  shortCode: string,
  options: LoadDefiOptions = {},
): Promise<LoadedDefi | null> {
  if (!isValidShortCode(shortCode)) return null;
  const { includeResponses = true } = options;

  const defi = await prisma.defi.findUnique({
    where: { shortCode },
    include: includeResponses
      ? {
          responses: {
            // DESC : plus récent d'abord. Le switcher de la page /resultats
            // affiche les pills dans cet ordre — les nouveaux amis arrivent
            // en tête, plus intuitif que de scroller jusqu'au bout pour
            // voir la dernière réponse.
            orderBy: { createdAt: "desc" },
            // Cap défensif : un défi qui devient viral (au-delà du cercle
            // d'amis) pourrait accumuler des milliers de réponses. Sans
            // limite, chaque chargement de page tirerait tout en mémoire +
            // payload. 50 couvre 99% des défis amicaux ; au-delà on tronque
            // silencieusement aux plus récents (le militant voit `N` réponses
            // dans MyDefisList mais ne peut switcher que sur les 50 dernières
            // — limitation acceptable pour ce volume).
            take: 50,
          },
        }
      : undefined,
  });
  if (!defi) return null;

  let questionIds: string[];
  let creatorAnswers: DefiAnswersMap;
  try {
    questionIds = parseQuestionIds(defi.questionIds);
    creatorAnswers = parseAnswersMap(defi.creatorAnswers);
  } catch {
    return null;
  }

  // Charge UNIQUEMENT les 5 questions du défi via leur customId (au lieu de
  // tout fetcher puis filtrer). Pour 5 ids, c'est ~80× plus rapide.
  const picked = await loadQuestionsByIds(questionIds);
  // Une question retirée depuis la création ne rend pas le défi injouable :
  // on garde les questions de `questionIds` encore chargées (ordre conservé,
  // sans doublon), et total + scores se recalculent sur elles (cf. plus bas).
  const playable = playableQuestionIds(
    questionIds,
    picked.map((q) => q.id),
  );
  const questions = reorderQuestions(picked, playable);

  // Si on n'a pas inclus la relation, Prisma ne retourne pas le champ
  // `responses` — son type n'inclut pas la clé. On lit défensivement via
  // un cast plat : présent → on mappe, absent → []. Les chemins qui
  // sautent l'include ne consomment de toute façon pas le champ côté UI.
  type RawResponse = {
    amiLabel: string;
    amiClientId: string;
    amiUserId: string | null;
    answers: string;
    score: number;
    createdAt: Date;
    seenByCreatorAt: Date | null;
  };
  const rawResponses = (defi as { responses?: RawResponse[] }).responses;
  const responses = rawResponses
    ? rawResponses.map((r) => {
        let answers: DefiAnswersMap = {};
        try {
          answers = parseAnswersMap(r.answers);
        } catch {
          // Ligne corrompue : on garde le score brut, on rend les détails vides.
        }
        return {
          amiLabel: r.amiLabel,
          amiClientId: r.amiClientId,
          amiUserId: r.amiUserId,
          answers,
          score: r.score,
          createdAt: r.createdAt,
          seenByCreatorAt: r.seenByCreatorAt,
        };
      })
    : [];

  // Label thématique recalculé depuis les vraies questions chargées : c'est
  // la source de vérité pour l'UI. Le champ Defi.themeId stocké en DB n'est
  // utilisé que pour les analytics (et garderait un slug "économie" même si
  // une question du défi a été déplacée vers un autre thème côté admin).
  const bucket = computeThemeFromNames(questions.map((q) => q.theme));

  // Scores recalculés sur les seules questions jouables : sans ça, l'ami
  // jouait 4 questions « sur 5 » face à un score créateur qui comptait
  // encore la 5e. Le score stocké est conservé si le détail est illisible.
  const rescore = (answers: DefiAnswersMap, stored: number) =>
    Object.keys(answers).length > 0 ? scoreFromAnswers(answers, playable) : stored;

  return {
    shortCode: defi.shortCode,
    creatorPseudo: defi.creatorPseudo,
    creatorClientId: defi.creatorClientId,
    creatorUserId: defi.creatorUserId,
    source:
      defi.source === "favoris"
        ? "favoris"
        : defi.source === "session"
          ? "session"
          : "theme",
    themeId: bucket.themeId,
    themeLabel: bucket.themeLabel,
    title: defi.title,
    questions,
    stale: playable.length < new Set(questionIds).size,
    creatorAnswers,
    creatorScore: rescore(creatorAnswers, defi.creatorScore),
    creatorLevelRank: defi.creatorLevelRank,
    total: playable.length,
    createdAt: defi.createdAt,
    expiresAt: defi.expiresAt,
    isExpired: defi.expiresAt.getTime() < Date.now(),
    responses: responses.map((r) => ({ ...r, score: rescore(r.answers, r.score) })),
  };
}
