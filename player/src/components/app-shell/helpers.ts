/// Helpers + constantes "pures" extraites d'`app-shell.tsx` pour alléger
/// le fichier principal. Tout ce qui vit ici ne dépend pas du state React
/// de l'AppShell — fonctions pures + types + Sets statiques.

import type {
  AbQuestion,
  Answer,
  CategorisationQuestion,
  ClassementQuestion,
  CurseurMultiQuestion,
  EstimationQuestion,
  NavTarget,
  PondereQuestion,
  QcmQuestion,
  Question,
  SceneId,
  VraiFauxMultiQuestion,
  VraiFauxQuestion,
} from "@/lib/types";

export const VALID_SCENES: readonly SceneId[] = [
  "onboarding",
  "home",
  "game",
  "q-estim",
  "q-tf",
  "q-ab",
  "q-qcm",
  "q-classement",
  "q-vftf-multi",
  "q-curseur-multi",
  "q-cat",
  "q-pondere",
  "recap",
  "challenge",
  "themes",
  "review",
  "favorites",
  "account",
  "profile",
  "stats",
  "rewards",
  "defis-history",
  "methode",
  "apropos",
];

export function isSceneId(s: string | null): s is SceneId {
  return s !== null && (VALID_SCENES as readonly string[]).includes(s);
}

/// Scène d'entrée d'AppShell à partir du `?s=` et de ce qu'on a pu
/// reconstituer (replay `?qs=` ou reprise de session).
///
/// `?s=game` sans partie à reprendre ne doit JAMAIS lancer une partie :
/// la scène game jouerait alors `activeQuestions` par défaut, c'est-à-dire
/// tout le catalogue publié (et persisterait cette « partie » de 450
/// questions comme session à reprendre). On retombe sur l'accueil.
export function initialSceneFor(
  sceneParam: string | null,
  hasPlayableSession: boolean,
): SceneId {
  if (hasPlayableSession) return "game";
  if (sceneParam === "game") return "home";
  return isSceneId(sceneParam) ? sceneParam : "onboarding";
}

/// Mode "canonique" associé à une scène — sert à initialiser activeMode
/// depuis la scène d'entrée. Pour les scènes transitoires (game, recap, q-*),
/// on garde "daily" comme valeur par défaut faute de contexte précédent ;
/// dans la vie courante, ces scènes sont atteintes via une nav explicite
/// qui aura déjà positionné activeMode au bon mode.
export function canonicalModeForScene(scene: SceneId): NavTarget {
  switch (scene) {
    case "home":
      return "home";
    case "themes":
      return "themes";
    case "review":
      return "review";
    case "favorites":
      return "favorites";
    case "account":
      return "account";
    case "stats":
      return "stats";
    case "profile":
      return "profile";
    case "rewards":
      return "rewards";
    case "defis-history":
      // L'historique des défis est rattaché à la nav "Défier" : on garde
      // l'underline sur "Défier" pour signaler "c'est dans la même section
      // que la création de défi".
      return "challenge";
    case "challenge":
      return "challenge";
    case "methode":
      return "methode";
    case "apropos":
      return "apropos";
    case "onboarding":
      // Landing : on ne veut pas souligner un des 4 tabs primaires
      // (sinon "Du jour" apparaît actif alors que l'utilisateur n'a rien
      // choisi). "home" n'est pas un tab, donc aucun item ne match.
      return "home";
    default:
      // game + recap + q-* : pas de mode canonique propre.
      return "daily";
  }
}

/** Convertit un id de scene « format solo » en question typée, pickée parmi
 *  les démos. Retourne null si la scene n'est pas un format ou si on n'a
 *  aucune question à montrer pour ce format. */
export function sceneToSoloQuestion(
  scene: SceneId,
  demos: {
    estim: EstimationQuestion | null;
    tf: VraiFauxQuestion | null;
    ab: AbQuestion | null;
    qcm: QcmQuestion | null;
    classement: ClassementQuestion | null;
    vftfMulti: VraiFauxMultiQuestion | null;
    curseurMulti: CurseurMultiQuestion | null;
    cat: CategorisationQuestion | null;
    pondere: PondereQuestion | null;
  },
): Question | null {
  switch (scene) {
    case "q-estim":
      return demos.estim;
    case "q-tf":
      return demos.tf;
    case "q-ab":
      return demos.ab;
    case "q-qcm":
      return demos.qcm;
    case "q-classement":
      return demos.classement;
    case "q-vftf-multi":
      return demos.vftfMulti;
    case "q-curseur-multi":
      return demos.curseurMulti;
    case "q-cat":
      return demos.cat;
    case "q-pondere":
      return demos.pondere;
    default:
      return null;
  }
}

/// Réponses de démo pour les écrans recap/challenge atteints via dev nav.
export function synthAnswers(questions: Question[]): Answer[] {
  return questions.map((q, i) => {
    if (q.format === "estimation") {
      if (i === 0) return q.answer + 1;
      if (i === 2) return q.answer - 500;
      return q.answer - 14;
    }
    if (q.format === "ab") return q.correctIndex;
    if (q.format === "vraifaux") return !q.correctAnswer;
    if (q.format === "qcm") return q.correctIndex;
    // Composite formats: synthetic answer not implemented — return null.
    return null;
  });
}

/// Scènes "tab principal" qui partagent le HomeHeader commun (logo + UserMenu).
/// L'AppShell le rend une seule fois, persistant à travers les changements de
/// scène — même pattern que l'AppNav desktop. Cf. app-shell.tsx où la liste
/// est consommée et où on retire le rendu interne des screens correspondants.
/// Les autres scènes (onboarding linéaire, wizard défi avec ses propres
/// titres/back, methode/apropos/recap/defis-history) gardent leur header
/// spécifique.
export const SCENES_WITH_HOME_HEADER: ReadonlySet<SceneId> = new Set<SceneId>([
  "onboarding",
  "home",
  "themes",
  "review",
  "favorites",
  "account",
  "stats",
  "rewards",
  // Portrait (« Mon portrait », menu utilisateur) : même famille que Stats et
  // Récompenses. Il avait été oublié ici, d'où un écran mobile sans logo ni
  // menu utilisateur.
  "profile",
]);

/// Scènes "immersives" : on retire la tab bar pendant le jeu (focus sur la
/// question) et pendant le recap (qui a ses propres CTAs). Onboarding garde
/// la bar : c'est la première impression, l'utilisateur doit voir qu'il
/// y a 4 modes accessibles dès l'entrée.
export const SCENES_WITHOUT_BAR: ReadonlySet<SceneId> = new Set<SceneId>([
  "game",
  // `recap` retiré : on veut la BottomTabBar visible sur le récap pour
  // que l'utilisateur ait directement accès aux modes (Du jour /
  // Découvrir / Réviser / Défier) au lieu d'un AppHeader « Fin de
  // partie » + back arrow. Cf. Recap mobile qui n'affiche plus son
  // propre header.
  "q-estim",
  "q-tf",
  "q-ab",
  "q-qcm",
  "q-classement",
  "q-vftf-multi",
  "q-curseur-multi",
  "q-cat",
  "q-pondere",
]);
