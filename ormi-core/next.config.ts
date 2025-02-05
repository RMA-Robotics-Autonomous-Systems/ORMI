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
  },
  experimental: {
    reactCompiler: true,
  },
};

export default nextConfig;
