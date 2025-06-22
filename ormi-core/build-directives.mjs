import { readdir, readFile } from "fs/promises";
import { $ } from "bun";

const srcDir = "./src";
const outDir = "./dist/src";

async function processFiles() {
    try {
        const files = await readdir(srcDir, { recursive: true });

        for (const file of files) {
            const filePath = `${srcDir}/${file}`;
            if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
                const content = await readFile(filePath, "utf-8");
                if (content.trim().startsWith(`"use client"`) || content.trim().startsWith(`'use client'`)) {
                    await $`bun build ${filePath} --outdir ${outDir} --target node --banner '{"js": "\"use client\";"}'`;
                } else if (content.trim().startsWith(`"use server"`) || content.trim().startsWith(`'use server'`)) {
                    await $`bun build ${filePath} --outdir ${outDir} --target node --banner '{"js": "\"use server\";"}'`;
                } else {
                    await $`bun build ${filePath} --outdir ${outDir} --target node`;
                }
            }
        }
    } catch (err) {
        console.error("Error processing files:", err);
    }
}

processFiles();
