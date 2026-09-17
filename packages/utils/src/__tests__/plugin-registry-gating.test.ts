import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import path from "path";

import { init, DEV_PLUGINS_ENV_VAR } from "../cli/commands/init";

/**
 * Registry gating: development-only plugins must be discoverable in a
 * development registry and absent from a production one.
 *
 * The registry is the only module that imports plugin packages, so a plugin
 * missing from it is unreachable from the bundle — this is the gate that
 * actually stops dev fixtures shipping to a robot.
 */

/** Plugins that must never reach a production build. */
const DEV_ONLY_PLUGINS = ["ormi-loadgen", "ormi-randoms-datasources"];

/** Operator-facing plugins that must always reach a production build. */
const ALWAYS_SHIPPED_PLUGINS = [
	"ormi-std-widgets",
	"ormi-foxglove",
	"teodor-emi-extension",
];

const repoRoot = path.resolve(import.meta.dir, "../../../..");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ormi-registry-"));

/**
 * Generate a registry with the CLI and return its source.
 * @param options - Registry mode and opt-in override.
 * @returns The generated registry source.
 */
async function generateRegistry(options: {
	production?: boolean;
	devPluginsEnv?: string;
}): Promise<string> {
	const out = path.join(tmpDir, `registry-${Math.random()}.ts`);
	const previousCwd = process.cwd();
	const previousEnv = process.env[DEV_PLUGINS_ENV_VAR];
	const quiet = () => {};
	const realLog = console.log;
	const realError = console.error;

	if (options.devPluginsEnv === undefined) {
		delete process.env[DEV_PLUGINS_ENV_VAR];
	} else {
		process.env[DEV_PLUGINS_ENV_VAR] = options.devPluginsEnv;
	}

	process.chdir(repoRoot);
	console.log = quiet;
	console.error = quiet;
	// The CLI draws a scan progress bar straight to stdout.
	const realWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = (() => true) as typeof process.stdout.write;
	try {
		await init(out, { production: options.production });
	} finally {
		process.stdout.write = realWrite;
		console.log = realLog;
		console.error = realError;
		process.chdir(previousCwd);
		if (previousEnv === undefined) {
			delete process.env[DEV_PLUGINS_ENV_VAR];
		} else {
			process.env[DEV_PLUGINS_ENV_VAR] = previousEnv;
		}
	}

	return fs.readFileSync(out, "utf-8");
}

/**
 * Registry entry matcher — the generated file keys plugins by package name.
 * @param plugin - Plugin package name.
 * @returns The exact registry line for that plugin.
 */
const entryFor = (plugin: string) => `"${plugin}": import("${plugin}")`;

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("dev-only plugin manifests", () => {
	it.each(DEV_ONLY_PLUGINS)("%s declares ormi_plugin_dev_only", (plugin) => {
		const manifest = JSON.parse(
			fs.readFileSync(
				path.join(repoRoot, "plugins", plugin, "package.json"),
				"utf-8",
			),
		);
		expect(manifest.ormi_plugin).toBe(true);
		expect(manifest.ormi_plugin_dev_only).toBe(true);
	});

	it.each(ALWAYS_SHIPPED_PLUGINS)(
		"%s does not declare ormi_plugin_dev_only",
		(plugin) => {
			const manifest = JSON.parse(
				fs.readFileSync(
					path.join(repoRoot, "plugins", plugin, "package.json"),
					"utf-8",
				),
			);
			expect(manifest.ormi_plugin).toBe(true);
			expect(manifest.ormi_plugin_dev_only).toBeUndefined();
		},
	);
});

describe("generated plugin registry", () => {
	let devRegistry: string;
	let prodRegistry: string;
	let prodOptInRegistry: string;

	beforeAll(async () => {
		devRegistry = await generateRegistry({});
		prodRegistry = await generateRegistry({ production: true });
		prodOptInRegistry = await generateRegistry({
			production: true,
			devPluginsEnv: "1",
		});
	});

	it("registers dev-only plugins in a development registry", () => {
		for (const plugin of DEV_ONLY_PLUGINS) {
			expect(devRegistry).toContain(entryFor(plugin));
		}
	});

	it("omits dev-only plugins from a production registry", () => {
		for (const plugin of DEV_ONLY_PLUGINS) {
			expect(prodRegistry).not.toContain(plugin);
		}
	});

	it("keeps operator-facing plugins in a production registry", () => {
		for (const plugin of ALWAYS_SHIPPED_PLUGINS) {
			expect(prodRegistry).toContain(entryFor(plugin));
		}
	});

	it("re-includes dev-only plugins when the build opts in", () => {
		for (const plugin of DEV_ONLY_PLUGINS) {
			expect(prodOptInRegistry).toContain(entryFor(plugin));
		}
	});
});
