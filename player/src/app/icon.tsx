import { ImageResponse } from "next/og";
import { BrandIcon } from "@/components/brand-icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        <BrandIcon size={512} />
      </div>
    ),
    { ...size },
  );
}
