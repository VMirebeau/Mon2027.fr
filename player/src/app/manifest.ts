import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mon2027",
    short_name: "Mon2027",
    description:
      "Teste ce que tu crois savoir sur la France. Prépare ton vote.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF8F3",
    theme_color: "#FAF8F3",
    categories: ["education", "news", "politics"],
    icons: [
      // SVG vectoriel — utilisé par Chrome/Edge desktop et navigateurs
      // modernes qui supportent les icônes vectorielles dans le manifest.
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      // PNG 512×512 padded (squircle visible) — fallback pour les
      // navigateurs qui n'acceptent pas le SVG en manifest, et pour
      // l'affichage "any" sur Android.
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // PNG 512×512 full-bleed — Android applique son propre masque
      // (cercle, squircle, etc.) sur l'icône maskable. Le jaune sature
      // toute la toile pour éviter les bords coupés.
      {
        src: "/icon1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
