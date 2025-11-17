/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        reactCompiler: true,
    },
    transpilePackages: ["@workspace/ui"],
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
}

export default nextConfig
