import { ImageResponse } from "next/og";

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
          alignItems: "center",
          justifyContent: "center",
          fontSize: 300,
          background: "linear-gradient(150deg, #1a2333, #080b12)",
          borderRadius: 96,
        }}
      >
        🎰
      </div>
    ),
    size
  );
}
