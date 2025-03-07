#!/usr/bin/env bun
import { Command } from "commander";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { init } from "./commands/init";
import { update } from "./commands/update";
var program = new Command();
program
    .name("ormi-plugins")
    .description("CLI tool for managing ORMI plugins")
    .version("0.0.1");
program
    .command("version")
    .description("Show the current version")
    .action(function () {
    console.log("0.0.1");
});
program
    .command("add")
    .description("Add a plugin to your project")
    .argument("<plugin>", "The plugin name")
    .argument("<git-url>", "The git repository URL")
    .option("-y, --yes", "Skip confirmation prompt", false)
    .option("-b, --branch <branch>", "Specify git branch", "main")
    .action(add);
program
    .command("remove")
    .description("Remove a plugin from your project")
    .argument("<plugin>", "The plugin name")
    .option("-y, --yes", "Skip confirmation prompt", false)
    .action(remove);
program
    .command("init")
    .description("Install all plugins in the ormi-plugins.json file")
    .action(init);
program
    .command("update")
    .description("Update all plugins in the ormi-plugins.json file")
    .option("-y, --yes", "Skip confirmation prompt", false)
    .option("-b, --branch <branch>", "Specify git branch", "main")
    .action(update);
program.parse(process.argv);
