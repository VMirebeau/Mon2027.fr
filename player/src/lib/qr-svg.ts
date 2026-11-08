/// Wrapper minimaliste autour de `qrcode` pour produire des SVG inline.
///
/// Côté serveur : la page /livret en utilise un par question (impression à
/// imprimer / scanner pour rejouer en ligne). Côté client : ShareSessionModal
/// en affiche un pour le lien défi (partage en présentiel).
///
/// On force `errorCorrectionLevel: 'L'` (le plus faible) : les URLs sont
/// courtes et le contexte d'impression est de qualité correcte (encre, A4).
/// 'L' = QR plus petit donc plus compact dans la maquette.

import QRCode from "qrcode";

const QR_OPTS = {
  errorCorrectionLevel: "L" as const,
  margin: 0,
  // Pas de couleur — on hérite via currentColor pour suivre le print stylesheet.
  // qrcode SVG met "stroke" et "fill" hard-codés, on les remplace post-hoc.
};

/// Génère un SVG inline pour un payload (URL typiquement). Le SVG retourné
/// n'a pas de couleur fixe : les `fill` sont remplacés par `currentColor`
/// pour respecter le thème de la page (impression noire, écran ink).
/// `size` : taille en px de l'attribut width/height (override la taille
/// auto-calculée par qrcode).
export async function qrSvg(text: string, size = 80): Promise<string> {
  const raw = await QRCode.toString(text, { type: "svg", ...QR_OPTS });
  return raw
    .replace(/fill="#000000"/g, 'fill="currentColor"')
    .replace(/<svg /, `<svg width="${size}" height="${size}" `)
    .replace(/width="\d+" width=/, "width=")
    .replace(/height="\d+" height=/, "height=");
}
