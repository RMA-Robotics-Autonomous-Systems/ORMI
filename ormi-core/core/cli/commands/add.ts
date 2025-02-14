import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import ora from "ora";
import rimraf from "rimraf";

interface AddOptions {
  yes: boolean;
  branch: string;
}

export async function add(pluginName: string, gitUrl: string, options: AddOptions) {
  const spinner = ora(`Installing plugin ${pluginName}`).start();

  try {
    const targetDir = path.join(process.cwd(), "plugins", pluginName);

    if (existsSync(targetDir) && !options.yes) {
      spinner.fail(`Plugin "${pluginName}" already exists`);
      process.exit(1);
    }

    // Create plugin directory
    mkdirSync(targetDir, { recursive: true });

    // Clone the repository
    execSync(
      `git clone --depth 1 --branch ${options.branch} ${gitUrl} ${targetDir}`,
      { stdio: "pipe" }
    );

    // remove .git directory and .gitignore file
    rimraf.sync(path.join(targetDir, ".git"));
    rimraf.sync(path.join(targetDir, ".gitignore"));

    // remove file in root directory that contains the word "lock"
    const files = readdirSync(targetDir);
    for (const file of files) {
      if (file.includes("lock")) {
        rimraf.sync(path.join(targetDir, file));
      }
    }

    // remove the tsconfig.json file
    rimraf.sync(path.join(targetDir, "tsconfig.json"));

    // Install plugin dependencies in the main package.json if it exists
    const mainPackageJsonPath = path.join(process.cwd(), "package.json");
    if (existsSync(mainPackageJsonPath)) {
      const pluginPackageJsonPath = path.join(targetDir, "package.json");
      if (existsSync(pluginPackageJsonPath)) {
        spinner.text = "Installing plugin dependencies...";
        const pluginPackageJson = JSON.parse(
          readFileSync(pluginPackageJsonPath, "utf-8")
        );
        if (pluginPackageJson.dependencies) {
          const deps = Object.entries(pluginPackageJson.dependencies)
            .map(([dep, version]) => `${dep}@${version}`)
            .join(" ");
          execSync(`bun add ${deps}`, {
            cwd: process.cwd(),
            stdio: "pipe",
          });
        }
      }
    }

    // remove the package.json file
    rimraf.sync(path.join(targetDir, "package.json"));

    // Update or create the ormi-plugins.json file with the new plugin entry
    try {
      const pluginsFilePath = path.join(process.cwd(), "ormi-plugins.json");
      let plugins: Record<string, { git: string }> = {};
      if (existsSync(pluginsFilePath)) {
        const content = readFileSync(pluginsFilePath, "utf-8");
        plugins = JSON.parse(content);
      }
      if (!plugins[pluginName]) {
        plugins[pluginName] = { git: gitUrl };
        writeFileSync(pluginsFilePath, JSON.stringify(plugins, null, 2));
      }
    } catch (err) {
      console.error("Failed to update ormi-plugins.json:", err);
    }

    spinner.succeed(`Successfully installed plugin "${pluginName}"`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    spinner.fail(`Failed to install plugin: ${err.message}`);
    process.exit(1);
  }
}