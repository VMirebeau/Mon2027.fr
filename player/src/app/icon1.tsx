import { ImageResponse } from "next/og";
import { BrandIconMaskable } from "@/components/brand-icon";

// Variante "maskable" du manifest PWA — full-bleed jaune, bulle dans la
// safe zone (80% central). Référencée par manifest.ts avec
// purpose: "maskable". Sur Android, l'OS applique un masque circulaire ou
// squircle ; la version padded (icon.tsx) y serait coupée.

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function IconMaskable() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        <BrandIconMaskable size={512} />
      </div>
    ),
    { ...size },
  );
}
