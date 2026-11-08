/// Génère un short code lisible pour un défi, type "vague-rouge-942".
///
/// Format : <mot1>-<mot2>-<chiffre>
///   - mot1, mot2 : dictionnaires de mots courts, mémorisables, lisibles à l'oral.
///     Choisis pour éviter ambiguïtés audio (pas d'homophones, pas de "x" ou "y").
///   - chiffre    : 100 à 999 — 3 chiffres pour pousser l'espace combinatoire
///                  hors de portée d'un scan exhaustif (cf. plus bas).
///
/// L'unicité est garantie par retry au niveau du caller (cf. createDefi).
/// Espace combinatoire = ADJECTIFS.length × NOMS.length × 900
/// ≈ 50 × 50 × 900 = 2,25M — assez pour rendre l'énumération coûteuse
/// face à un rate-limit IP.
///
/// On utilise `crypto.randomInt` (CSPRNG node) et pas `Math.random()`,
/// pour qu'un attaquant ne puisse pas prédire les codes à partir d'un
/// échantillon. Le coût est négligeable.

import { randomInt } from "node:crypto";

const ADJECTIFS = [
  "vague", "tendre", "calme", "vive", "claire", "douce", "fière",
  "ronde", "haute", "basse", "neuve", "vieille", "rouge", "verte",
  "noire", "blanche", "grise", "jaune", "rose", "fraîche",
  "longue", "courte", "large", "fine", "lourde", "légère", "rapide",
  "lente", "forte", "fragile", "simple", "drôle", "grave", "sage",
  "vraie", "pure", "nette", "souple", "ferme", "douce", "dure",
  "belle", "noble", "libre", "gaie", "vaste", "épaisse", "mince",
  "tiède", "vide",
];

const NOMS = [
  "rouge", "rose", "ciel", "mer", "vent", "pluie", "neige", "feu",
  "lune", "soleil", "étoile", "nuage", "terre", "pierre", "arbre",
  "fleur", "herbe", "graine", "fruit", "branche", "racine", "feuille",
  "rivière", "source", "montagne", "vallée", "plage", "île", "ville",
  "rue", "porte", "fenêtre", "toit", "chemin", "pont", "champ",
  "forêt", "colline", "vague", "marée", "brume", "ombre", "lueur",
  "flamme", "écho", "souffle", "rumeur", "matin", "soir", "aube",
];

export function generateShortCode(): string {
  const adj = ADJECTIFS[randomInt(0, ADJECTIFS.length)];
  const nom = NOMS[randomInt(0, NOMS.length)];
  const num = randomInt(100, 1000); // [100, 999]
  // ASCII-safe slug : on retire les accents pour que le code passe sans
  // encodage dans une URL et soit dictable par téléphone.
  const slug = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${slug(adj)}-${slug(nom)}-${num}`;
}

/// Validation : tester qu'un short code soumis par le client correspond
/// bien au format attendu, pour éviter de balader des strings arbitraires
/// vers Prisma (qui les accepterait mais ouvrirait à des collisions
/// inattendues et à de la pollution d'index).
///
/// Le format historique acceptait 1-2 chiffres ; on garde la rétro-compat
/// pour les défis créés avant la migration vers 3 chiffres.
export function isValidShortCode(code: string): boolean {
  return /^[a-z]+-[a-z]+-[1-9][0-9]{0,2}$/.test(code);
}
