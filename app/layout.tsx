import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "미니게임",
  description: "가상 코인으로 즐기는 달팽이게임 · 홀짝 · 그래프 · 빙고 · 즉석복권",
  applicationName: "미니게임",
  // 홈 화면에 추가하면 브라우저 껍데기 없이 앱처럼 열린다.
  appleWebApp: { capable: true, title: "미니게임", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
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
