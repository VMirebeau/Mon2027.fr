/// Types partagés entre les étapes du flow Défier.
///
/// `Source` désigne d'où viennent les questions du défi :
///   - "theme"   → tirage aléatoire dans un thème (étape A2)
///   - "favoris" → sélection multi-pick parmi les favoris (étape A2bis)

export type Source = "theme" | "favoris";

/// Minimum de favoris à sélectionner pour lancer un défi sur favoris.
/// 1 = sélection hand-picked d'une question marquante. Avant on imposait 3
/// par parallélisme avec le tirage thématique, mais ça avait peu de sens
/// pour une sélection intentionnelle.
export const FAV_MIN = 1;
/// Maximum pour ne pas surcharger le destinataire.
export const FAV_MAX = 10;
