/** @type {import('next').NextConfig} */
const nextConfig = {
    reactCompiler: true,
    turbopack: {
        // Disable CSS Modules "pure" mode — Tailwind preflight element selectors
        // (small, svg, ul, etc.) are valid in global CSS but fail the purity check
        // when bundled alongside CSS module files in the import chain.
        cssModules: {
            pure: false,
        },
    },
    transpilePackages: ["@workspace/ui"],
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "api.dicebear.com",
                port: "",
                pathname: "/9.x/**",
            },
        ],
        dangerouslyAllowSVG: true,
    },
};

export default nextConfig;
