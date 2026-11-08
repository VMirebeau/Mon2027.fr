/// Typographie française à l'affichage : espaces insécables là où un retour
/// à la ligne est fautif (« 30 » en bout de ligne et « % » au début de la
/// suivante, « « » orphelin, « 340 » / « 801 » coupés). Appliqué côté serveur
/// aux textes des questions (cf. content.ts) : le contenu en base reste tel
/// que saisi. Idempotent.
const NBSP = " ";

export function frenchSpaces(text: string): string {
  return (
    text
      // Avant ? ! ; : % » et après «
      .replace(/ +([?!;:%»])/g, `${NBSP}$1`)
      .replace(/« +/g, `«${NBSP}`)
      // Séparateur de milliers : « 340 801 », « 1 500 000 »
      .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
      // Nombre et unité monétaire courte : « 2,5 Md€ », « 12 € »
      .replace(/(\d) (?=(?:Md|M|k)?€)/g, `$1${NBSP}`)
  );
}
