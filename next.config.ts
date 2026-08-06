import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin 은 동적 require 와 네이티브 의존성이 있어서 번들에 말아 넣으면
  // 서버리스 환경에서 모듈 로드 자체가 실패한다. 통째로 외부 패키지로 둔다.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
