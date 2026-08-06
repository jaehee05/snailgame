import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "미니게임",
  description: "가상 코인으로 즐기는 달팽이 레이싱 · 홀짝 · 그래프",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 확대는 막지 않는다 (접근성). 대신 입력 시 자동 확대만 CSS 로 막는다.
  maximumScale: 5,
  themeColor: "#080b12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
