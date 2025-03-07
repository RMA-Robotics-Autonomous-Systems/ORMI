import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        port: '',
        pathname: '/9.x/**',
      },
    ],
    dangerouslyAllowSVG: true,
  },
  outputFileTracingRoot: path.join(__dirname, '../'),
  experimental: {
    reactCompiler: true,
  },
};

export default nextConfig;
