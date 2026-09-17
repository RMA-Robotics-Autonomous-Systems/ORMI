import * as fs from "fs";
import path from "path";
import chalk from "chalk"; // You may need to install this package

/**
 * Build-time opt-in that re-includes development-only plugins in a production
 * registry. Set to `1` or `true`.
 *
 * Gating happens when the registry is generated, so a plugin left out is not in
 * the bundle at all — no runtime switch can bring it back. Re-enabling it on a
 * staging or benchmarking deployment therefore requires rebuilding with this
 * variable set.
 */
export const DEV_PLUGINS_ENV_VAR = "ORMI_DEV_PLUGINS";

/** Options accepted by {@link init}. */
export interface InitOptions {
	/**
	 * Generate a production registry: plugins marked `ormi_plugin_dev_only` in
	 * their `package.json` are excluded unless `ORMI_DEV_PLUGINS` opts them
	 * back in. Defaults to false (development registry, everything included).
	 */
	production?: boolean;
}

/**
 * Whether development-only plugins belong in the registry about to be written.
 * @param options - Resolved CLI options.
 * @returns True when dev-only plugins must be registered.
 */
function shouldIncludeDevOnly(options: InitOptions): boolean {
	if (!options.production) return true;
	const optIn = process.env[DEV_PLUGINS_ENV_VAR];
	return optIn === "1" || optIn === "true";
}

/**
 * Find all node_modules directories by searching up the directory tree
 * This handles monorepo environments where node_modules might be hoisted
 * Returns an array of valid node_modules paths
 */
function findNodeModules(): string[] {
	const MAX_SEARCH_LEVELS = 10;
	const nodeModulesPaths: string[] = [];
	let currentDir = process.cwd();

	// Search up to MAX_SEARCH_LEVELS to avoid infinite loops
	for (let i = 0; i < MAX_SEARCH_LEVELS; i++) {
		// Check if package.json exists in current directory
		const packageJsonPath = path.join(currentDir, "package.json");

		if (fs.existsSync(packageJsonPath)) {
			const nodeModulesPath = path.join(currentDir, "node_modules");

			if (
				fs.existsSync(nodeModulesPath) &&
				fs.statSync(nodeModulesPath).isDirectory()
			) {
				nodeModulesPaths.push(nodeModulesPath);
			}

			// if the package.json has a "workspaces" field, we can assume it's a monorepo
			if (packageJsonPath) {
				const packageJson = JSON.parse(
					fs.readFileSync(packageJsonPath, "utf-8"),
				);

				if (packageJson.workspaces) {
					// If workspaces are defined, we can assume this is a monorepo
					const workspaceNodeModulesPath = path.join(
						currentDir,
						"node_modules",
						"@workspace",
					);

					if (
						fs.existsSync(workspaceNodeModulesPath) &&
						fs.statSync(workspaceNodeModulesPath).isDirectory() &&
						!nodeModulesPaths.includes(workspaceNodeModulesPath)
					) {
						nodeModulesPaths.push(workspaceNodeModulesPath);
					}
					break; // Stop searching further up the directory tree
				}
			}
		}

		const parentDir = path.dirname(currentDir);

		// If we've reached the root, stop searching
		if (parentDir === currentDir) {
			break;
		}

		currentDir = parentDir;
	}

	// Fallback: try the traditional approach
	const fallbackPath = path.resolve(process.cwd(), "node_modules");
	if (
		fs.existsSync(fallbackPath) &&
		fs.statSync(fallbackPath).isDirectory() &&
		!nodeModulesPaths.includes(fallbackPath)
	) {
		nodeModulesPaths.push(fallbackPath);
	}

	return nodeModulesPaths;
}

/**
 * Discover every installed ORMI plugin.
 *
 * A package is an ORMI plugin when its `package.json` carries
 * `"ormi_plugin": true`. A plugin that additionally carries
 * `"ormi_plugin_dev_only": true` is a development-only plugin (synthetic data,
 * benchmarking fixtures) and is skipped unless `includeDevOnly` is set.
 *
 * @param includeDevOnly - Include plugins marked `ormi_plugin_dev_only`.
 * @returns Package names of the plugins to register.
 */
function get_plugins(includeDevOnly: boolean): string[] {
	// Find node_modules paths in monorepo environment
	const nodeModulesPaths = findNodeModules();

	if (nodeModulesPaths.length === 0) {
		console.log(chalk.red("✗ No node_modules directories found."));
		return [];
	}

	console.log(
		chalk.cyan(
			`🔍 Scanning ${nodeModulesPaths.length} node_modules directories for ORMI plugins...`,
		),
	);
	nodeModulesPaths.forEach((path, index) => {
		console.log(chalk.gray(`  ${index + 1}. ${path}`));
	});

	const allPlugins: string[] = [];
	const skippedDevOnly: string[] = [];
	let totalScannedCount = 0;

	// Check each node_modules directory for plugins
	for (const nodeModulesPath of nodeModulesPaths) {
		console.log(chalk.cyan(`\n📂 Scanning ${nodeModulesPath}...`));

		const dirs = fs
			.readdirSync(nodeModulesPath, { withFileTypes: true })
			.filter((dirent) => {
				try {
					const fullPath = path.join(nodeModulesPath, dirent.name);
					// Check if it's a directory or a symlink that points to a directory
					return (
						dirent.isDirectory() ||
						(dirent.isSymbolicLink() &&
							fs.statSync(fullPath).isDirectory())
					);
				} catch (err) {
					return false;
				}
			})
			.map((dirent) => dirent.name);

		let scannedCount = 0;
		const totalDirs = dirs.length;

		console.log(
			chalk.yellow(
				`📦 Found ${totalDirs} potential packages to check in this directory`,
			),
		);

		const plugins = dirs.filter((dir) => {
			const dirPath = path.join(nodeModulesPath, dir);
			const package_json = path.join(dirPath, "package.json");
			if (!fs.existsSync(package_json)) {
				return false;
			}

			// Show progress periodically
			scannedCount++;
			totalScannedCount++;
			if (scannedCount % 50 === 0 || scannedCount === totalDirs) {
				process.stdout.write(
					`\r${chalk.blue("⏳")} Scanning packages: ${chalk.green(scannedCount)}/${chalk.green(totalDirs)} [${Math.round((scannedCount / totalDirs) * 100)}%]`,
				);
			}

			try {
				const pckg = JSON.parse(fs.readFileSync(package_json, "utf-8"));
				if (pckg["ormi_plugin"] !== true) {
					return false;
				}
				if (pckg["ormi_plugin_dev_only"] === true && !includeDevOnly) {
					if (!skippedDevOnly.includes(dir)) {
						skippedDevOnly.push(dir);
					}
					return false;
				}
				return true;
			} catch (err) {
				return false;
			}
		});

		process.stdout.write(
			`\r${chalk.blue("⏳")} Scanning packages: ${chalk.green(totalDirs)}/${chalk.green(totalDirs)} [100%]`,
		);

		if (totalDirs > 0) {
			console.log("\n");
		}

		// Add plugins from this directory, avoiding duplicates
		plugins.forEach((plugin) => {
			if (!allPlugins.includes(plugin)) {
				allPlugins.push(plugin);
			}
		});
	}

	if (skippedDevOnly.length > 0) {
		console.log(
			chalk.yellow(
				`\n🚫 Excluded ${skippedDevOnly.length} development-only plugin(s) from this registry:`,
			),
		);
		skippedDevOnly.forEach((plugin) => {
			console.log(chalk.gray(`  - ${plugin}`));
		});
		console.log(
			chalk.gray(
				`  Set ${DEV_PLUGINS_ENV_VAR}=1 to include them in a production registry.`,
			),
		);
	}

	return allPlugins;
}

function save_source_file(source: string, path: string) {
	const source_file = path;
	try {
		fs.writeFileSync(source_file, source);
		console.log(chalk.green("💾 Source file saved successfully!"));
	} catch (err) {
		console.error(
			chalk.red(`🚨 Error saving source file: ${(err as any).message}`),
		);
	}
}

function generate_source_file(plugins: string[]): string {
	/*
        "use client"

        import { PluginRegistry } from "ormi-core/plugins";


        const registry : PluginRegistry = {
            "ormi-standard-widgets": import("ormi-standart-widgets") as any,
            "ormi-ros-2": import("ormi-ros-2") as any,
            "ormi-random": import("ormi-random") as any,
            "ormi-fligth-indicator" : import("ormi-fligth-indicator") as any,
        }

        export default registry;
    */

	let source = "/* eslint-disable @typescript-eslint/no-explicit-any */\n";
	source += `"use client"\n\n`;
	source += `// This file is auto-generated by the ORMI CLI\n\n`;
	source += `import { PluginRegistry } from "@workspace/ormi-plugins";\n\n`;
	source += `const registry : PluginRegistry = {\n`;
	plugins.forEach((plugin) => {
		source += `    "${plugin}": import("${plugin}") as any,\n`;
	});
	source += `}\n\n`;
	source += `export default registry;`;

	return source;
}

/**
 * Generate the plugin registry source file consumed by the web app.
 *
 * @param path - Output path of the generated TypeScript registry.
 * @param options - CLI options; `production` excludes dev-only plugins.
 */
export async function init(path: string, options: InitOptions = {}) {
	const includeDevOnly = shouldIncludeDevOnly(options);

	console.log(
		chalk.magenta(
			`🚀 Initializing ORMI Core (${options.production ? "production" : "development"} registry${
				options.production && includeDevOnly
					? `, ${DEV_PLUGINS_ENV_VAR} opt-in active`
					: ""
			})...`,
		),
	);

	const startTime = Date.now();
	const plugins = get_plugins(includeDevOnly);
	const endTime = Date.now();

	console.log(
		chalk.green(
			`\n✨ Found ${plugins.length} ORMI plugins in ${((endTime - startTime) / 1000).toFixed(2)}s`,
		),
	);

	if (plugins.length > 0) {
		console.log(chalk.yellow("📋 Discovered plugins:"));
		plugins.forEach((plugin, index) => {
			console.log(chalk.cyan(`  ${index + 1}. ${plugin}`));
		});
	} else {
		console.log(
			chalk.yellow(
				"⚠️  No ORMI plugins found. You can install plugins to extend functionality.",
			),
		);
	}

	console.log(chalk.magenta("\n📝 Generating source file..."));
	const source = generate_source_file(plugins);

	console.log(chalk.magenta("💾 Saving source file..."));
	save_source_file(source, path);
}
