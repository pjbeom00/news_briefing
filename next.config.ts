import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /**
   * Next.js 16에서는 Turbopack이 기본 빌더이다.
   * webpack 설정을 쓰지 말고 turbopack 설정을 써야 한다.
   */
  turbopack: {
    resolveAlias: {
      "@": path.resolve(__dirname),
    }
  },

  experimental: {
    // turbo: true  ❌ 제거
  },
};

export default nextConfig;
