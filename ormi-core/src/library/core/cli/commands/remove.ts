import { existsSync, readFileSync, writeFileSync } from "fs";
import { rm } from "fs/promises";
import path from "path";
import ora from "ora";
import inquirer from "inquirer";

interface RemoveOptions {
  yes: boolean;
}

export async function remove(pluginName: string, options: RemoveOptions) {
  const spinner = ora(`Removing plugin ${pluginName}`).start();
  
  try {
    const targetDir = path.join(process.cwd(), "plugins", pluginName);

    console.log(targetDir);

    if (!existsSync(targetDir)) {
      spinner.fail(`Plugin "${pluginName}" does not exist`);
      process.exit(1);
    }

    // Confirm removal if --yes flag is not set
    if (!options.yes) {
      spinner.stop();
      const { confirm } = await inquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to remove plugin "${pluginName}"?`,
        default: false
      });

      if (!confirm) {
        console.log('Operation cancelled');
        process.exit(0);
      }
      spinner.start();
    }

    // Remove the plugin directory
    await rm(targetDir, { recursive: true, force: true });

    // Update the ormi-plugins.json file to remove the plugin entry
    try {
      const pluginsFilePath = path.join(process.cwd(), "ormi-plugins.json");
      if (existsSync(pluginsFilePath)) {
        const content = readFileSync(pluginsFilePath, "utf-8");
        const plugins: Record<string, any> = JSON.parse(content);
        if (plugins[pluginName]) {
          delete plugins[pluginName];
          writeFileSync(pluginsFilePath, JSON.stringify(plugins, null, 2));
        }
      }
    } catch (err) {
      console.error("Failed to update ormi-plugins.json:", err);
    }

    spinner.succeed(`Successfully removed plugin "${pluginName}"`);
  } catch (error) {
    spinner.fail(`Failed to remove plugin: ${(error as Error).message}`);
    process.exit(1);
  }
}