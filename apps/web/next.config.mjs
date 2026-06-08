/** @type {import('next').NextConfig} */
const nextConfig = {
	reactCompiler: true,
	transpilePackages: [
		"@workspace/ui",
		"@workspace/ormi-core",
		"@workspace/ormi-jsonforms",
		"@workspace/ormi-plugins",
		"@workspace/utils",
		"ormi-emi-bag-analyzer",
		"ormi-flight-indicator",
		"ormi-foxglove",
		"ormi-randoms-datasources",
		"ormi-rest-bags",
		"ormi-rosbridge-suite",
		"ormi-std-widgets",
		"ormi-tello",
		"teodor-emi-extension",
	],
	// Explicitly opt into Turbopack for production builds on Next 16.
	// Our worker assets are loaded via URL + fetch, so we do not need the
	// webpack-only asyncWebAssembly experiment here.
	turbopack: {},
	async rewrites() {
		return [
			{
				source: "/api/dicebear/:path*",
				destination: "https://api.dicebear.com/:path*",
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
