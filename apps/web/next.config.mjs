import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build stamp shown in the navbar, as `YYYYMMDD-<short sha>`.
 *
 * The date is the *commit* date, not the build date, so the same commit always
 * produces the same string — two images built a week apart from one commit are
 * the same software and should say so.
 *
 * `APP_VERSION` is injected by the Docker build: `.dockerignore` excludes `.git`,
 * so the image build cannot read the repository and the CI workflow (which can)
 * passes it as a build argument. Outside Docker we read git directly, and a
 * checkout without git history falls back to `dev` rather than failing a build.
 *
 * Listed in turbo.json's `build.env` so changing it invalidates the build cache;
 * without that, turbo would replay a cached build and bake in a stale stamp.
 */
function resolveAppVersion() {
	if (process.env.APP_VERSION) return process.env.APP_VERSION;
	try {
		const git = (args) =>
			execSync(`git ${args}`, {
				cwd: __dirname,
				stdio: ["ignore", "pipe", "ignore"],
			})
				.toString()
				.trim();
		return `${git("show -s --format=%cd --date=format:%Y%m%d HEAD")}-${git(
			"rev-parse --short=7 HEAD",
		)}`;
	} catch {
		return "dev";
	}
}

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
		"ormi-c2-control": src("plugins/ormi-c2-control/src/index.ts")
	}
	: {};

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Emit a self-contained server bundle (`.next/standalone`) so the Docker
	// runtime stage needs neither the monorepo sources nor its `node_modules`.
	// Next traces only the modules the server actually imports; build-only
	// toolchains (@next/swc, turbo, typescript) and client-only libraries
	// (plotly, mermaid, echarts — already compiled into `.next/static`) are
	// left behind. `outputFileTracingRoot` must point at the workspace root or
	// tracing stops at `apps/web` and misses the symlinked `@workspace/*` and
	// `ormi-*` packages, producing a server that cannot resolve its plugins.
	output: "standalone",
	outputFileTracingRoot: path.join(__dirname, "../../"),
	// Inlined at build time. Not part of the validated runtime env in
	// config/env.js: that schema is for values a deployment supplies, and this
	// one is fixed when the bundle is compiled.
	env: {
		NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
	},
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
		"ormi-c2-control"
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
