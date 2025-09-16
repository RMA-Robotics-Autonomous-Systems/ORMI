import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
} from "serwist";

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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...defaultCache,

    // Next.js Image optimization
    {
      matcher: ({ url }) => {
        const isNextImage = url.pathname.startsWith("/_next/image");
        console.log("next image matcher", url.pathname, isNextImage);
        return isNextImage;
      },
      handler: new CacheFirst({
        cacheName: "next-images",
        plugins: [
          {
            cacheKeyWillBeUsed: async ({ request }) => {
              // Use the full URL with parameters for cache key
              return request.url;
            },
          },
        ],
      }),
    },

    // Images - cache first with long expiration
    {
      matcher: ({ request }) => {
        const isImage = request.destination === "image";
        console.log("image request", request.destination, isImage);
        return isImage;
      },
      handler: new CacheFirst({
        cacheName: "images",
        plugins: [
          {
            cacheKeyWillBeUsed: async ({ request }) => {
              return `${request.url}?version=1`;
            },
          },
        ],
      }),
    },

    // Scripts and Styles - stale while revalidate
    {
      matcher: ({ request }) => {
        const isScriptOrStyle =
          request.destination === "script" || request.destination === "style";
        console.log(
          "script/style request",
          request.destination,
          isScriptOrStyle
        );
        return isScriptOrStyle;
      },
      handler: new StaleWhileRevalidate({
        cacheName: "static-resources",
      }),
    },

    // Documents - network first with fallback
    {
      matcher: ({ request }) => {
        const isDocument = request.destination === "document";
        console.log("document request", request.destination, isDocument);
        return isDocument;
      },
      handler: new NetworkFirst({
        cacheName: "documents",
        networkTimeoutSeconds: 3,
      }),
    },

    // Font files - cache first
    {
      matcher: ({ request }) => {
        const isFont = request.destination === "font";
        console.log("font request", request.destination, isFont);
        return isFont;
      },
      handler: new CacheFirst({
        cacheName: "fonts",
      }),
    },

    // Other static assets by file extension
    {
      matcher: ({ url }) => {
        const isStaticAsset =
          url.pathname.match(
            /\.(js|css|woff|woff2|ttf|eot|ico|png|jpg|jpeg|gif|svg|webp)$/i
          ) && !url.pathname.startsWith("/api/");
        console.log("static asset request", url.pathname, isStaticAsset);
        return isStaticAsset;
      },
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
  ],
  precacheOptions: {
    cleanupOutdatedCaches: true,
    navigateFallback: "/offline",
    navigateFallbackDenylist: [/^\/api\//],
  },
});

serwist.addEventListeners();
