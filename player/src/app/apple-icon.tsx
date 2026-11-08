import { ImageResponse } from "next/og";
import { BrandIcon } from "@/components/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        <BrandIcon size={180} />
      </div>
    ),
    { ...size },
  );
}
