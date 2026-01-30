import * as fs from "fs";
import path from "path";
import chalk from "chalk"; // You may need to install this package

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

function get_plugins(): string[] {
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
				if (
					pckg["ormi_plugin"] !== undefined &&
					pckg["ormi_plugin"] === true
				) {
					return true;
				}
				return false;
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

export async function init(path: string) {
	console.log(chalk.magenta("🚀 Initializing ORMI Core..."));

	const startTime = Date.now();
	const plugins = get_plugins();
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
