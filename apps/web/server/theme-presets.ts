import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";

export interface ThemePreset {
	id: string;
	name: string;
	css: string;
}

const THEME_DIRECTORY_CANDIDATES = [
	path.join(process.cwd(), "themes"),
	path.join(process.cwd(), "apps/web/themes"),
];

function formatThemeName(themeId: string) {
	return themeId
		.split(/[-_]+/)
		.filter(Boolean)
		.map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
		.join(" ");
}

async function resolveThemeDirectory() {
	for (const directory of THEME_DIRECTORY_CANDIDATES) {
		try {
			const entries = await readdir(directory, { withFileTypes: true });
			if (
				entries.some(
					(entry) => entry.isFile() && entry.name.endsWith(".css"),
				)
			) {
				return directory;
			}
		} catch {
			continue;
		}
	}

	return null;
}

export async function getThemePresets(): Promise<ThemePreset[]> {
	noStore();

	const directory = await resolveThemeDirectory();
	if (!directory) {
		return [];
	}

	const entries = await readdir(directory, { withFileTypes: true });
	const cssFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
		.sort((left, right) => left.name.localeCompare(right.name));

	return Promise.all(
		cssFiles.map(async (entry) => {
			const css = await readFile(
				path.join(directory, entry.name),
				"utf8",
			);
			const id = entry.name.replace(/\.css$/u, "");

			return {
				id,
				name: formatThemeName(id),
				css,
			};
		}),
	);
}
