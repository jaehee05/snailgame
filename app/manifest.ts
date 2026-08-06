import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "미니게임",
    short_name: "미니게임",
    description: "가상 코인으로 즐기는 달팽이게임 · 홀짝 · 그래프 · 빙고 · 즉석복권",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080b12",
    theme_color: "#080b12",
    lang: "ko",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
