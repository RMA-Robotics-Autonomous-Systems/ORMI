#!/usr/bin/env bun
import { Command } from "commander";
import { init } from "./commands/init";

const program = new Command();

program
  .name("ormi-plugins")
  .description("CLI tool for managing ORMI plugins")
  .version("0.0.1");

program
    .command("version")
    .description("Show the current version")
    .action(() => {
        console.log("0.0.1");
    });
program
    .command("init")
    .argument("<path>", "The path of the output source file")
    .description("Generate a typescript file containing the imports for all the plugins")
    .action(init);

program.parse(process.argv);