/// Libellés « sujet du défi » partagés par les pages /d/[code] (accueil du
/// défi, résultats, aperçus de partage). Client-safe, sans dépendance.
///
/// defi-loader renvoie « Questions diverses » quand les questions du défi ne
/// partagent pas un même thème. Ce libellé sert de catégorie dans les listes,
/// mais se lit mal dans une phrase (« Camille te défie sur Questions
/// diverses ») : ces helpers le remplacent par une formulation naturelle.

/// Doit rester identique au libellé de repli de `computeThemeFromNames`
/// (lib/defi-loader.ts).
export const MIXED_THEME_LABEL = "Questions diverses";

export function isMixedTheme(themeLabel: string): boolean {
  return themeLabel === MIXED_THEME_LABEL;
}

/// Complément pour « X te défie sur … » : le thème, ou le nombre de
/// questions quand le défi mélange les thèmes.
export function defiTopicPhrase(themeLabel: string, total: number): string {
  return isMixedTheme(themeLabel)
    ? `${total} question${total > 1 ? "s" : ""}`
    : themeLabel;
}
