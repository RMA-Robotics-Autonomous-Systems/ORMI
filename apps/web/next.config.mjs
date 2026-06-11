// Dev-only: resolve internal workspace packages and plugins to their TypeScript
// source instead of their prebuilt `dist/`. The packages declare a
// `"development"` export condition for exactly this, but Turbopack (Next 16)
// has no way to activate custom resolve conditions, so it falls through to the
// `"import"` condition (`dist/index.js`). That means editing a plugin's `src`
// does nothing until `dist` is rebuilt — breaking hot reload. Aliasing the
// source here (with `transpilePackages` compiling it) restores real HMR.
// Production builds are untouched: aliases are empty when NODE_ENV=production,
// so the prebuilt `dist/` is used as before. Keep in sync with each package's
// `exports` map; subpath exports need their own entry.
// Turbopack resolves `resolveAlias` values as import requests relative to the
// project root (apps/web), so paths must be relative (`../../…`) — an absolute
// path is misread as a root-relative URL ("server relative imports").
const isDev = process.env.NODE_ENV !== "production";
const src = (p) => `../../${p}`;

const devSourceAliases = isDev
	? {
			"@workspace/ormi-core": src("packages/ormi-core/src/index.ts"),
			"@workspace/ormi-core/datasources": src(
				"packages/ormi-core/src/datasources/index.ts",
			),
			"@workspace/ormi-core/datasources/worker": src(
				"packages/ormi-core/src/datasources/worker/index.ts",
			),
			"@workspace/ormi-core/widgets": src(
				"packages/ormi-core/src/widgets/index.ts",
			),
			"@workspace/ormi-core/dashboard": src(
				"packages/ormi-core/src/dashboard/index.ts",
			),
			"@workspace/ormi-core/templates": src(
				"packages/ormi-core/src/templates/index.ts",
			),
			"@workspace/ormi-core/types": src(
				"packages/ormi-core/src/types/index.ts",
			),
			"@workspace/ormi-core/renderers": src(
				"packages/ormi-core/src/renderers/index.ts",
			),
			"@workspace/ormi-core/transforms": src(
				"packages/ormi-core/src/transforms/index.ts",
			),
			"@workspace/ormi-jsonforms": src("packages/ormi-jsonforms/src/index.ts"),
			"@workspace/ormi-plugins": src("packages/ormi-plugins/src/index.ts"),
			"@workspace/utils": src("packages/utils/src/index.ts"),
			"ormi-emi-bag-analyzer": src("plugins/ormi-emi-bag-analyzer/src/index.ts"),
			"ormi-flight-indicator": src("plugins/ormi-flight-indicator/src/index.ts"),
			"ormi-foxglove": src("plugins/ormi-foxglove/src/index.ts"),
			"ormi-randoms-datasources": src(
				"plugins/ormi-randoms-datasources/src/index.ts",
			),
			"ormi-rest-bags": src("plugins/ormi-rest-bags/src/index.ts"),
			"ormi-rosbridge-suite": src("plugins/ormi-rosbridge-suite/src/index.ts"),
			"ormi-std-widgets": src("plugins/ormi-std-widgets/src/index.ts"),
			"ormi-tello": src("plugins/ormi-tello/src/index.ts"),
			"teodor-emi-extension": src("plugins/teodor-emi-extension/src/index.ts"),
		}
	: {};

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
	// `resolveAlias` is empty in production (see `devSourceAliases` above).
	turbopack: {
		resolveAlias: devSourceAliases,
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
		],
		dangerouslyAllowSVG: true,
	},
};

export default nextConfig;
