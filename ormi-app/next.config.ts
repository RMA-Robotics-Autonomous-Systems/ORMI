import type { NextConfig } from "next";

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
  experimental: {
    // reactCompiler: true,
  },
};

export default nextConfig;
