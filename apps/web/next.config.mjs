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
	// Webpack WASM support (production builds — Turbopack handles dev differently).
	webpack(config) {
		config.experiments = {
			...config.experiments,
			asyncWebAssembly: true,
		};
		return config;
	},
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
