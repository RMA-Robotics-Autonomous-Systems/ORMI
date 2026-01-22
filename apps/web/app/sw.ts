import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst } from "serwist";
import { OfflineProxy, API_ENDPOINTS } from "../proxy";

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest. By default, this string is set to
// `"self.__SW_MANIFEST"`.
declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

declare const self: ServiceWorkerGlobalScope;

// Initialize the offline proxy system
const offlineProxy = new OfflineProxy();

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        // Offline Database API Interceptor (HIGHEST PRIORITY)
        {
            matcher: ({ url }) => {
                if (url.origin !== self.location.origin) {
                    return false;
                }

                const pathname =
                    url.pathname.length > 1 && url.pathname.endsWith("/")
                        ? url.pathname.replace(/\/+$/, "")
                        : url.pathname;

                const isOfflineHandled =
                    pathname === API_ENDPOINTS.WORKSPACES ||
                    API_ENDPOINTS.WORKSPACE_BY_ID.test(pathname) ||
                    pathname === API_ENDPOINTS.TEMPLATES ||
                    API_ENDPOINTS.TEMPLATE_BY_ID.test(pathname) ||
                    API_ENDPOINTS.USERS.test(pathname) ||
                    API_ENDPOINTS.AUTH.test(pathname);

                if (isOfflineHandled) {
                    console.log(
                        "🔄 API request intercepted by offline proxy:",
                        pathname,
                    );
                    return true;
                }
                return false;
            },
            handler: async ({ request }) => {
                try {
                    // Let the offline proxy handle the request
                    const response = await offlineProxy.handleRequest(request);
                    if (response) {
                        return response;
                    }
                } catch (error) {
                    console.error("❌ Offline proxy error:", error);
                }

                // Fallback to network if proxy can't handle it
                return fetch(request);
            },
        },

        // Debug matcher - log all requests
        {
            matcher: ({ request, url }) => {
                console.log("🔍 DEBUG: Request intercepted", {
                    url: url.href,
                    pathname: url.pathname,
                    destination: request.destination,
                    method: request.method,
                });
                return false; // Don't handle, just log
            },
            handler: new NetworkFirst({ cacheName: "debug" }),
        },

        // Next.js Image optimization with fallback (BEFORE defaultCache)
        {
            matcher: ({ url }) => {
                const isNextImage = url.pathname.startsWith("/_next/image");
                console.log(
                    "🖼️ Next.js image matcher",
                    url.pathname,
                    isNextImage,
                );
                return isNextImage;
            },
            handler: new NetworkFirst({
                cacheName: "next-images",
                networkTimeoutSeconds: 3,
                plugins: [
                    {
                        cacheKeyWillBeUsed: async ({ request }) => {
                            return request.url;
                        },
                        handlerDidError: async ({ request }) => {
                            console.log(
                                "⚠️ Next.js image failed, trying fallback",
                            );
                            // Extract original image path from Next.js image URL
                            const url = new URL(request.url);
                            const originalImageUrl =
                                url.searchParams.get("url");

                            if (originalImageUrl) {
                                console.log(
                                    "📷 Falling back to original image:",
                                    originalImageUrl,
                                );

                                // Try to get the original image from cache or precache
                                const originalImagePath =
                                    decodeURIComponent(originalImageUrl);
                                const fallbackUrl = new URL(
                                    originalImagePath,
                                    url.origin,
                                ).href;

                                try {
                                    const fallbackResponse =
                                        await caches.match(fallbackUrl);
                                    if (fallbackResponse) {
                                        console.log(
                                            "✅ Found original image in cache:",
                                            fallbackUrl,
                                        );
                                        return fallbackResponse;
                                    }

                                    // If not in cache, try to fetch original (this will only work if online)
                                    const originalResponse =
                                        await fetch(fallbackUrl);
                                    if (originalResponse.ok) {
                                        console.log(
                                            "✅ Fetched original image:",
                                            fallbackUrl,
                                        );
                                        return originalResponse;
                                    }
                                } catch (error) {
                                    console.log(
                                        "❌ Failed to fetch original image:",
                                        error,
                                    );
                                }
                            }

                            // Return null to let the default error handling take over
                            return null;
                        },
                    },
                ],
            }),
        },

        ...defaultCache,
    ],
    precacheOptions: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/offline",
        navigateFallbackDenylist: [/^\/api\//],
    },
});

serwist.addEventListeners();
