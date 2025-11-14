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
        // Icons
        { url: '/icon/ormi.svg', revision: null },
        // Logos
        { url: '/logo/belgian-defense-logo.svg', revision: null },
        { url: '/logo/ras-lab-logo-dark.svg', revision: null },
        { url: '/logo/ras-lab-logo-light.svg', revision: null },
        { url: '/logo/rma-logo-dark.svg', revision: null },
        { url: '/logo/rma-logo-light.svg', revision: null },
        // Wallpapers/Backgrounds
        { url: '/wallpaper/air-sea-ground.jpeg', revision: null },
        { url: '/wallpaper/robots-field.jpeg', revision: null },
    ],
});

export default withSerwist({
    ...nextConfig,
});