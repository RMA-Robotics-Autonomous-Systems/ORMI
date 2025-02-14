import { existsSync, readFileSync } from "fs";
import path from "path";
import { add } from "./add";

export async function init() {
  const pluginsPath = path.join(process.cwd(), "ormi-plugins.json");
  if (!existsSync(pluginsPath)) {
    console.log("No ormi-plugins.json found. Skipping plugin initialization.");
    return;
  }
  try {
    const pluginsContent = readFileSync(pluginsPath, "utf-8");
    const plugins = JSON.parse(pluginsContent);

    for (const [pluginName, { git }] of Object.entries<{ git: string }>(plugins)) {
      // Install each plugin with default options
      await add(pluginName, git, { yes: true, branch: "main" });
    }
    
    console.log("All plugins have been installed.");
  } catch (error) {
    console.error("Failed to initialize plugins:", error);
    process.exit(1);
  }
}