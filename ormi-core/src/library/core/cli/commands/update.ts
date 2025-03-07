import { existsSync, readFileSync } from "fs";
import path from "path";
import { rm } from "fs/promises";
import ora from "ora";
import { add } from "./add";

export async function update(options: { branch?: string; yes?: boolean } = {}) {
  const spinner = ora("Updating all plugins").start();
  try {
    const pluginsFilePath = path.join(process.cwd(), "ormi-plugins.json");
    if (!existsSync(pluginsFilePath)) {
      spinner.fail("ormi-plugins.json not found");
      process.exit(1);
    }
    const content = readFileSync(pluginsFilePath, "utf-8");
    const plugins: Record<string, { git: string }> = JSON.parse(content);
    const branch = options.branch || "main";
    let allUpdated = true;

    for (const [pluginName, { git }] of Object.entries(plugins)) {
      spinner.text = `Updating plugin ${pluginName}`;
      const targetDir = path.join(process.cwd(), "plugins", pluginName);
      if (!existsSync(targetDir)) {
        spinner.warn(`Plugin "${pluginName}" is not installed locally. Skipping.`);
        continue;
      }
      try {
        await rm(targetDir, { recursive: true, force: true });
        await add(pluginName, git, { yes: true, branch });
      } catch (e) {
        spinner.fail(`Failed updating plugin "${pluginName}": ${e instanceof Error ? e.message : e}`);
        allUpdated = false;
      }
    }
    if (allUpdated) {
      spinner.succeed("Successfully updated all plugins");
      process.exit(0);
    } else {
      console.log("Some plugins were not updated successfully.");
    }
  } catch (error) {
    spinner.fail(`Failed to update plugins: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
