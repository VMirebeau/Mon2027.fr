// JSX SVG du logo Mon2027 — réutilisé par les routes metadata
// (icon.tsx, apple-icon.tsx, opengraph-image.tsx) qui rendent via Satori,
// et par les badges in-app (header desktop/mobile, mini-badge défi).
// La source canonique reste public/icon.svg ; toute évolution doit être
// répercutée ici à l'identique.
//
// Deux variantes :
// - BrandIcon : version "any" avec squircle et padding transparent autour
//   (favicon, apple-icon, OG image, badges in-app).
// - BrandIconMaskable : version full-bleed pour le purpose "maskable" du
//   manifest PWA — Android applique un masque circulaire/squircle qui
//   couperait notre squircle padded. Ici le jaune sature toute la toile
//   et la bulle reste dans la safe zone (80% central).

type BrandIconProps = {
  size?: number;
};

function BubbleAndBars() {
  return (
    <>
      <path
        d="M 322 232 H 702 A 120 120 0 0 1 822 352 V 622 A 120 120 0 0 1 702 742 H 680 L 724 856 A 16 16 0 0 1 702 864 L 550 742 H 322 A 120 120 0 0 1 202 622 V 352 A 120 120 0 0 1 322 232 Z"
        fill="#FAF8F3"
      />
      <rect x="332" y="520" width="100" height="140" rx="50" fill="#1A1A1A" />
      <rect x="462" y="420" width="100" height="240" rx="50" fill="#1A1A1A" />
      <rect x="592" y="320" width="100" height="340" rx="50" fill="#FF6B6B" />
    </>
  );
}

export function BrandIcon({ size = 512 }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
    >
      <rect x="64" y="64" width="896" height="896" rx="224" fill="#FFC845" />
      <BubbleAndBars />
    </svg>
  );
}

export function BrandIconMaskable({ size = 512 }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
    >
      <rect x="0" y="0" width="1024" height="1024" fill="#FFC845" />
      <BubbleAndBars />
    </svg>
  );
}
