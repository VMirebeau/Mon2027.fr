/// Export du radar (SVG) en image PNG partageable.
///
/// Pourquoi pas juste sérialiser le SVG ?
///   - Le SVG utilise des CSS vars (`var(--coral)`, `var(--paper)`, etc.)
///     définies sur `:root` du document. Hors du DOM parent, ces vars
///     ne sont pas résolues — l'image rendue serait sans couleur.
///   - On veut aussi composer un en-tête + footer "Mon portrait Mon2027 ·
///     mon2027.fr" pour que l'image partagée s'identifie d'elle-même.
///   - Pour le partage social, PNG est universel (Twitter/Insta/Whatsapp)
///     alors que SVG ne l'est pas.
///
/// Stratégie :
///   1. Clone le SVG, injecte un `<style>:root{}</style>` avec les vars
///      utilisées (résolues depuis getComputedStyle(document.documentElement)).
///   2. Sérialise en XML, encode en data URL.
///   3. Charge dans une <Image>, dessine dans un <canvas> dimensionné
///      pour inclure header + radar + footer.
///   4. Exporte le canvas en blob PNG.
///
/// Retourne un Blob PNG prêt à être partagé via navigator.share({files})
/// ou téléchargé via a[download].

const CSS_VARS_TO_INLINE = [
  "--coral",
  "--paper",
  "--cream",
  "--cream-warm",
  "--cream-deep",
  "--ink",
  "--ink-soft",
  "--ink-mute",
  "--rule-soft",
  "--signal-bad",
  "--signal-mid",
  "--signal-good",
  "--yellow",
];

/// Récupère les vars CSS du :root sous forme de string `--name: value;`,
/// pour injection dans le SVG cloné. Seules les vars effectivement utilisées
/// par le radar sont incluses (évite de poluer avec tout le système).
function getCssVarsBlock(): string {
  const root = window.getComputedStyle(document.documentElement);
  const decls = CSS_VARS_TO_INLINE.map((name) => {
    const v = root.getPropertyValue(name).trim();
    return v ? `${name}: ${v};` : "";
  })
    .filter(Boolean)
    .join(" ");
  return `:root { ${decls} }`;
}

export type RadarExportOptions = {
  /// Titre affiché en haut de l'image (par défaut "Mon portrait Mon2027").
  title?: string;
  /// Pied de page (par défaut "mon2027.fr").
  footer?: string;
  /// Largeur canvas finale en px (1080 = format carré social par défaut).
  size?: number;
  /// Score Lucidité (0-100) à afficher en grand sous le titre. Null = pas
  /// d'affichage. C'est LE hook viral de l'image — un chiffre simple,
  /// flatteur, partageable.
  lucidity?: number | null;
  /// Nombre d'indicateurs effectivement comptés (≥ 3). Affiché sous le
  /// score pour honnêteté : "sur 5 / 9 dimensions". Null/undefined = pas
  /// d'affichage.
  measuredCount?: number | null;
  /// Nombre total d'indicateurs de la taxonomie.
  totalCount?: number | null;
};

/// Génère un Blob PNG du radar enrichi d'un titre et d'un footer.
/// Doit être appelé côté client (utilise document, Image, canvas).
export async function exportRadarAsPng(
  svgElement: SVGElement,
  options: RadarExportOptions = {},
): Promise<Blob> {
  const size = options.size ?? 1080;
  const title = options.title ?? "Mon portrait · Mon2027";
  const footer = options.footer ?? "mon2027.fr";

  // 1. Clone du SVG + injection des vars CSS résolues.
  const cloned = svgElement.cloneNode(true) as SVGElement;
  // Forcer le SVG à avoir un namespace explicite (data URL standalone).
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const styleEl = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "style",
  );
  styleEl.textContent = getCssVarsBlock();
  cloned.insertBefore(styleEl, cloned.firstChild);

  // 2. Sérialisation XML → data URL.
  const xml = new XMLSerializer().serializeToString(cloned);
  // btoa ne gère pas les caractères Unicode hors-Latin1 → on encode UTF-8
  // d'abord en bytes puis en base64.
  const utf8 = unescape(encodeURIComponent(xml));
  const dataUrl = "data:image/svg+xml;base64," + btoa(utf8);

  // 3. Charge dans une Image, dessine dans canvas dimensionné.
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  // Fond couleur "paper" (cohérence visuelle avec l'app).
  const rootStyle = window.getComputedStyle(document.documentElement);
  const paper = rootStyle.getPropertyValue("--paper").trim() || "#fff";
  const ink = rootStyle.getPropertyValue("--ink").trim() || "#000";
  const inkSoft = rootStyle.getPropertyValue("--ink-soft").trim() || "#444";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, size, size);

  const coral = rootStyle.getPropertyValue("--coral").trim() || "#d95550";

  // Header — titre éditorial
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(size * 0.038)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, size / 2, size * 0.05);

  // Score Lucidité en gros sous le titre — le hook visuel principal.
  // Permet aux gens qui scrollent de comprendre le portrait en 0.5s.
  let radarTop = size * 0.12;
  if (options.lucidity != null) {
    const yScore = size * 0.125;
    const labelY = yScore;
    const valueY = yScore + size * 0.04;
    // Eyebrow "LUCIDITÉ"
    ctx.fillStyle = inkSoft;
    ctx.font = `600 ${Math.round(size * 0.022)}px ui-monospace, monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillText("LUCIDITÉ", size / 2, labelY);
    // Chiffre principal + "/100" — composé manuellement pour alignement
    // baseline correct (gros chiffre + petit suffixe sur la même ligne).
    const scoreText = `${options.lucidity}`;
    const suffixText = " / 100";
    ctx.font = `700 ${Math.round(size * 0.11)}px Inter, system-ui, sans-serif`;
    const scoreWidth = ctx.measureText(scoreText).width;
    ctx.font = `500 ${Math.round(size * 0.038)}px Inter, system-ui, sans-serif`;
    const suffixWidth = ctx.measureText(suffixText).width;
    const totalWidth = scoreWidth + suffixWidth;
    const baselineY = valueY + size * 0.095;
    // Chiffre principal (coral)
    ctx.fillStyle = coral;
    ctx.font = `700 ${Math.round(size * 0.11)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(scoreText, (size - totalWidth) / 2, baselineY);
    // Suffixe "/100" en plus petit, aligné sur la baseline
    ctx.fillStyle = inkSoft;
    ctx.font = `500 ${Math.round(size * 0.038)}px Inter, system-ui, sans-serif`;
    ctx.fillText(suffixText, (size - totalWidth) / 2 + scoreWidth, baselineY);
    ctx.textAlign = "center";
    // Sub : "sur X / Y dimensions" pour honnêteté épistémique
    if (options.measuredCount != null && options.totalCount != null) {
      ctx.fillStyle = inkSoft;
      ctx.font = `500 ${Math.round(size * 0.02)}px ui-monospace, monospace`;
      ctx.textBaseline = "top";
      ctx.fillText(
        `sur ${options.measuredCount} / ${options.totalCount} dimensions`,
        size / 2,
        baselineY + size * 0.012,
      );
    }
    radarTop = size * 0.29;
  }

  // Footer
  ctx.fillStyle = inkSoft;
  ctx.font = `500 ${Math.round(size * 0.026)}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.fillText(footer, size / 2, size * 0.965);

  // Radar centré, prend l'espace restant entre header (et éventuel score)
  // et le footer. Hauteur calibrée pour rester carré.
  const radarMaxBottom = size * 0.92;
  const availableHeight = radarMaxBottom - radarTop;
  const radarSize = Math.min(size * 0.78, availableHeight);
  const radarX = (size - radarSize) / 2;
  const radarY = radarTop + (availableHeight - radarSize) / 2;
  ctx.drawImage(img, radarX, radarY, radarSize, radarSize);

  // 4. Canvas → blob PNG.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("canvas toBlob a échoué");
  return blob;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/// Helper pour télécharger un Blob comme fichier (fallback quand
/// navigator.share n'est pas disponible).
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Libère la mémoire après un petit délai (sinon le download échoue parfois
  // car l'URL est révoquée avant que le navigateur initie le téléchargement).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/// Tente de partager via Web Share API (idéal sur mobile), avec fallback
/// download. Retourne true si l'action a réussi (partage ou download).
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  shareText: string,
): Promise<boolean> {
  const file = new File([blob], filename, { type: "image/png" });
  const navAny = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };
  if (
    typeof navAny.canShare === "function" &&
    typeof navAny.share === "function" &&
    navAny.canShare({ files: [file] })
  ) {
    try {
      await navAny.share({
        files: [file],
        title: "Mon portrait Mon2027",
        text: shareText,
      });
      return true;
    } catch {
      // User a annulé ou refus permission → fallback download.
    }
  }
  downloadBlob(blob, filename);
  return true;
}
