/** @type {import('next').NextConfig} */
const nextConfig = {
	reactCompiler: true,
	turbopack: {},
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
