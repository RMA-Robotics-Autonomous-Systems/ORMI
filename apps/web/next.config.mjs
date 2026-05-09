/** @type {import('next').NextConfig} */
const nextConfig = {
	reactCompiler: true,
	transpilePackages: ["@workspace/ui"],
	// Explicitly opt into Turbopack for production builds on Next 16.
	// Our worker assets are loaded via URL + fetch, so we do not need the
	// webpack-only asyncWebAssembly experiment here.
	turbopack: {},
	// Cross-Origin isolation — required for WebAssembly (PGlite) in DedicatedWorkers.
	// COOP: same-origin prevents cross-origin windows sharing a browsing context group.
	// COEP: require-corp ensures all subresources declare cross-origin permissions.
	async rewrites() {
		return [
			{
				source: "/api/dicebear/:path*",
				destination: "https://api.dicebear.com/:path*",
			},
		];
	},
	async headers() {
		return [
			{
				source: "/sw.js",
				headers: [
					{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
					{ key: "Service-Worker-Allowed", value: "/" },
				],
			},
			{
				source: "/(.*)",
				headers: [
					{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
					{
						key: "Cross-Origin-Embedder-Policy",
						value: "require-corp",
					},
				],
			},
		];
	},
	images: {
		localPatterns: [
			{
				pathname: "/icon/**",
			},
			{
				pathname: "/logo/**",
			},
			{
				pathname: "/wallpaper/**",
			},
			{
				pathname: "/api/dicebear/**",
			},
		],
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
