/** @type {import('next').NextConfig} */
const nextConfig = {
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


import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
    // Note: This is only an example. If you use Pages Router,
    // use something else that works, such as "service-worker/index.ts".
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    reloadOnOnline: true,
    cacheOnNavigation: true,
    additionalPrecacheEntries: [
        { url: '/', revision: null },
        { url: '/offline', revision: null },
        { url: '/manifest.webmanifest', revision: null },
    ],
});

export default withSerwist({
    ...nextConfig,
});