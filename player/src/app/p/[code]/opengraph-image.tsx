import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import {
  decodePortraitCode,
  isCanonicalPortraitCode,
  type PortraitCodePayload,
} from "@/lib/portrait-url";
import { ogImageRateLimitOk } from "@/lib/page-rate-limit";
import { INDICATORS, INDICATOR_IDS } from "@/lib/indicators";

/// Image OpenGraph dynamique pour `/p/[code]` — preview affichée quand le
/// lien est partagé sur Twitter/Whatsapp/LinkedIn. Critique pour viraliser :
/// preview avec image = 5-10× plus d'engagement que preview texte seul.
///
/// Implémentation : Satori (le moteur next/og) a un support SVG inline
/// limité (certains attributs ne passent pas). Pour fiabilité maximale, on
/// SÉRIALISE le radar en SVG complet, encode en data URL base64, et inclut
/// via un <img>. Satori sait rendre une image en data URL.

export const alt = "Un portrait civique Mon2027";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/// Couleurs hardcoded (Satori ne lit pas les CSS vars). Doit rester aligné
/// avec globals.css.
const PALETTE = {
  cream: "#F5EFE2",
  paper: "#FAF5E6",
  ink: "#1A1A1A",
  inkSoft: "#4A4842",
  inkMute: "#8A877E",
  ruleSoft: "#E8DFC9",
  coral: "#FF6B6B",
  coralDeep: "#E15555",
};

// Radar dimensionné pour occuper le MAXIMUM de l'OG sans cropper les
// labels. Avec SIZE=660 et OG hauteur=630, le SVG dépasse de 15px haut
// et bas — mais les labels (à LABEL_R=300 du centre) restent à 315-300=15
// du bord de l'OG, juste visibles. Les axes radiaux du haut/bas sont
// légèrement cropped, mais ce sont des lignes droites secondaires —
// aucune perte d'info. Largeur utilisée passe de 600/1200=50% à 660/1200=55%.
const RADAR_SVG_SIZE = 660;
const RADAR_CENTER = RADAR_SVG_SIZE / 2;
const RADAR_MAX_R = 240;
const RADAR_LABEL_R = RADAR_MAX_R + 65;
const REAL_RATIO = 0.5;
/// Épaisseurs et tailles des éléments graphiques — agrandies par rapport
/// au radar in-app pour rester visibles au downscale social.
const POLY_STROKE = 4;
const DOT_RADIUS = 9;
const LABEL_FONT_SIZE = 26;
const RING_STROKE = 1.5;
const REAL_RING_STROKE = 2.5;

function axisAngle(i: number, total: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / total;
}

function pointOnAxis(
  i: number,
  total: number,
  normalizedR: number,
): { x: number; y: number } {
  const a = axisAngle(i, total);
  const r = RADAR_MAX_R * Math.max(0, Math.min(1, normalizedR));
  return { x: RADAR_CENTER + Math.cos(a) * r, y: RADAR_CENTER + Math.sin(a) * r };
}

function radiusFromScore(score: number): number {
  return (Math.max(-1, Math.min(1, score)) + 1) / 2;
}

/// Récupère le score Lucidité depuis le payload (encodé canoniquement
/// côté player). Retourne null si le sharer n'a pas eu assez d'indicateurs
/// mesurés (measuredCount=0 → décodeur retourne lucidity=null). Pour les
/// codes legacy 10 chars sans lucidity embed, on retourne aussi null —
/// pas de fallback recalcul car les scores 0 par défaut donneraient un
/// faux 100/100 trompeur.
function getLucidity(payload: PortraitCodePayload): number | null {
  return payload.lucidity ?? null;
}

/// Sérialise le radar en SVG complet (string). Inclut anneaux, axes,
/// polygone user, points. PAS de labels — le rasterizer SVG de Satori
/// n'a pas de font pour rendre les <text> inline, ils sortiraient en
/// rectangles "tofu" (glyph manquant). Les labels sont posés en overlay
/// JSX Satori absolu, qui a sa propre font Noto et rend le texte
/// correctement (cf. ImageResponse plus bas).
function buildRadarSvg(payload: PortraitCodePayload): string {
  const n = INDICATOR_IDS.length;
  const userPoints = INDICATOR_IDS.map((id, i) =>
    pointOnAxis(i, n, radiusFromScore(payload.scores[id] ?? 0)),
  );
  const userPath =
    "M " +
    userPoints
      .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" L ") +
    " Z";

  const rings = [0.25, 0.75]
    .map(
      (r) =>
        `<circle cx="${RADAR_CENTER}" cy="${RADAR_CENTER}" r="${
          RADAR_MAX_R * r
        }" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="${RING_STROKE}"/>`,
    )
    .join("");

  // Cercle "réalité" plus épais — c'est LE repère pédagogique du graphe,
  // doit être visible même quand l'image est downscalée.
  const realityCircle = `<circle cx="${RADAR_CENTER}" cy="${RADAR_CENTER}" r="${
    RADAR_MAX_R * REAL_RATIO
  }" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="${REAL_RING_STROKE}"/>`;

  const outerCircle = `<circle cx="${RADAR_CENTER}" cy="${RADAR_CENTER}" r="${RADAR_MAX_R}" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="${RING_STROKE}"/>`;

  const axisLines = INDICATOR_IDS.map((_, i) => {
    const end = pointOnAxis(i, n, 1);
    return `<line x1="${RADAR_CENTER}" y1="${RADAR_CENTER}" x2="${end.x.toFixed(
      1,
    )}" y2="${end.y.toFixed(
      1,
    )}" stroke="rgba(0,0,0,0.13)" stroke-width="${RING_STROKE}"/>`;
  }).join("");

  // Polygone : stroke épais (4) + fill opaque (0.3 au lieu de 0.22) pour
  // rester nettement identifiable au downscale.
  const polygon = `<path d="${userPath}" fill="${PALETTE.coral}" fill-opacity="0.3" stroke="${PALETTE.coralDeep}" stroke-width="${POLY_STROKE}" stroke-linejoin="round"/>`;

  const dots = userPoints
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(
          1,
        )}" r="${DOT_RADIUS}" fill="${PALETTE.coralDeep}" stroke="${
          PALETTE.paper
        }" stroke-width="2"/>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RADAR_SVG_SIZE}" height="${RADAR_SVG_SIZE}" viewBox="0 0 ${RADAR_SVG_SIZE} ${RADAR_SVG_SIZE}">${rings}${realityCircle}${outerCircle}${axisLines}${polygon}${dots}</svg>`;
}

/// Calcule les positions des 9 labels en POURCENTAGES du conteneur du
/// radar. Utilisé par le JSX Satori pour positionner les labels en
/// absolute par-dessus l'image du radar. L'overlay JSX sait rendre les
/// accents français (Satori a une font Noto par défaut).
function labelPositions() {
  const n = INDICATOR_IDS.length;
  return INDICATOR_IDS.map((id, i) => {
    const pt = pointOnAxis(i, n, RADAR_LABEL_R / RADAR_MAX_R);
    const xPct = (pt.x / RADAR_SVG_SIZE) * 100;
    const yPct = (pt.y / RADAR_SVG_SIZE) * 100;
    const a = axisAngle(i, n);
    const cos = Math.cos(a);
    // Décalage horizontal pour ancrer le texte selon sa position angulaire :
    //   - axe à l'horizontale gauche/droite (cos extreme) → on align bord
    //   - axe vertical (cos ~0) → on centre
    // Les valeurs % correspondent au translateX du label par rapport à son
    // point d'ancrage.
    const translateX =
      Math.abs(cos) < 0.3 ? "-50%" : cos > 0 ? "0%" : "-100%";
    return {
      id,
      label: INDICATORS[id].label.toUpperCase(),
      xPct,
      yPct,
      translateX,
    };
  });
}

function svgToDataUrl(svg: string): string {
  // Encodage Base64 safe pour les caractères Unicode (les labels FR ont
  // des accents → btoa direct planterait).
  const utf8 = unescape(encodeURIComponent(svg));
  return "data:image/svg+xml;base64," + Buffer.from(utf8, "binary").toString("base64");
}

export default async function PortraitOG({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isCanonicalPortraitCode(code) || !(await ogImageRateLimitOk())) notFound();
  const payload = decodePortraitCode(code);
  if (!payload) notFound();

  const lucidity = getLucidity(payload);
  const radarDataUrl = svgToDataUrl(buildRadarSvg(payload));
  const labels = labelPositions();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PALETTE.cream,
          display: "flex",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
          color: PALETTE.ink,
        }}
      >
        {/* Brand Mon2027 — coin haut-gauche, discret. Identifie l'origine
            de l'image sans imposer un header large. */}
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 36,
            display: "flex",
            alignItems: "center",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: -0.5,
          }}
        >
          <span>Mon</span>
          <span style={{ color: PALETTE.coral }}>2027</span>
        </div>

        {/* Score Lucidité — coin bas-gauche, en gros. Seul élément textuel
            qui accompagne le radar (= le hook viral). Si pas dispo, on
            ne met rien : le radar parle de lui-même. */}
        {lucidity != null ? (
          <div
            style={{
              position: "absolute",
              bottom: 32,
              left: 36,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 12,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: PALETTE.inkMute,
                fontWeight: 600,
              }}
            >
              Score Lucidité
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                marginTop: 2,
              }}
            >
              <span
                style={{
                  fontSize: 96,
                  fontWeight: 700,
                  color: PALETTE.coral,
                  letterSpacing: -4,
                  lineHeight: 1,
                }}
              >
                {lucidity}
              </span>
              <span
                style={{
                  fontSize: 26,
                  color: PALETTE.inkSoft,
                  fontWeight: 500,
                  marginLeft: 6,
                }}
              >
                / 100
              </span>
            </div>
          </div>
        ) : null}

        {/* Radar — centré dans toute la zone disponible. C'est LE focus
            visuel. Taille calibrée pour rentrer dans 630px de haut moins
            ~50px de marge haut/bas. */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              width: RADAR_SVG_SIZE,
              height: RADAR_SVG_SIZE,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={radarDataUrl}
              alt="Radar des biais"
              width={RADAR_SVG_SIZE}
              height={RADAR_SVG_SIZE}
            />
            {labels.map((lbl) => (
              <div
                key={lbl.id}
                style={{
                  position: "absolute",
                  left: `${lbl.xPct}%`,
                  top: `${lbl.yPct}%`,
                  transform: `translate(${lbl.translateX}, -50%)`,
                  fontSize: LABEL_FONT_SIZE,
                  fontWeight: 700,
                  color: PALETTE.ink,
                  letterSpacing: 1.4,
                  whiteSpace: "nowrap",
                  display: "flex",
                }}
              >
                {lbl.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
