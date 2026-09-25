import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";
import { z } from "zod";

import type {
	ThemePreset,
	ThemePresetMeta,
} from "@workspace/ui/lib/theme-presets";

export type { ThemePreset, ThemePresetMeta };

/** The metadata sidecar, next to the preset CSS files. */
export const THEME_METADATA_FILE = "themes.json";

const THEME_DIRECTORY_CANDIDATES = [
	path.join(process.cwd(), "themes"),
	path.join(process.cwd(), "apps/web/themes"),
];

const themeMetaSchema = z
	.object({
		name: z.string().trim().min(1),
		movement: z.string().trim().min(1).optional(),
		description: z.string().trim().min(1).optional(),
	})
	.strict();

/** `themes.json`: preset id (CSS file name without extension) → metadata. */
export const themeMetadataSchema = z.record(z.string(), themeMetaSchema);

export type ThemeMetadata = z.infer<typeof themeMetadataSchema>;

/** The fallback name of a preset with no metadata: the id, title-cased. */
export function formatThemeName(themeId: string) {
	return themeId
		.split(/[-_]+/)
		.filter(Boolean)
		.map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
		.join(" ");
}

/**
 * Parse the text of `themes.json`. Never throws: a missing file (`null`),
 * malformed JSON or a document that fails the schema is logged and yields
 * no metadata, so every preset falls back to its title-cased id.
 */
export function parseThemeMetadata(raw: string | null): ThemeMetadata {
	if (raw === null) return {};

	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch (error) {
		console.error(
			`[theme-presets] ${THEME_METADATA_FILE} is not valid JSON; using preset ids as names.`,
			error,
		);
		return {};
	}

	const parsed = themeMetadataSchema.safeParse(json);
	if (!parsed.success) {
		console.error(
			`[theme-presets] ${THEME_METADATA_FILE} does not match the schema; using preset ids as names.`,
			z.flattenError(parsed.error),
		);
		return {};
	}
	return parsed.data;
}

/**
 * Join CSS files with their metadata. A preset with no entry gets its
 * title-cased id and no movement; an entry with no CSS file is ignored
 * (logged), since there is nothing to apply.
 */
export function mergeThemeMetadata(
	files: { id: string; css: string }[],
	metadata: ThemeMetadata,
): ThemePreset[] {
	const ids = new Set(files.map((file) => file.id));
	const orphans = Object.keys(metadata).filter((id) => !ids.has(id));
	if (orphans.length > 0) {
		console.warn(
			`[theme-presets] ${THEME_METADATA_FILE} lists presets with no CSS file: ${orphans.join(", ")}`,
		);
	}

	return files.map(({ id, css }) => {
		const meta = Object.prototype.hasOwnProperty.call(metadata, id)
			? metadata[id]
			: undefined;
		const preset: ThemePreset = {
			id,
			name: meta?.name ?? formatThemeName(id),
			css,
		};
		if (meta?.movement) preset.movement = meta.movement;
		if (meta?.description) preset.description = meta.description;
		return preset;
	});
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

async function readOptionalFile(file: string): Promise<string | null> {
	try {
		return await readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`[theme-presets] cannot read ${file}`, error);
		}
		return null;
	}
}

/**
 * Read every preset CSS file in `directory` (sorted by file name) and its
 * metadata. Split from {@link getThemePresets} so it can be run against a
 * fixture directory.
 */
export async function loadThemePresets(
	directory: string,
): Promise<ThemePreset[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const cssFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
		.sort((left, right) => left.name.localeCompare(right.name));

	const [files, rawMetadata] = await Promise.all([
		Promise.all(
			cssFiles.map(async (entry) => ({
				id: entry.name.replace(/\.css$/u, ""),
				css: await readFile(path.join(directory, entry.name), "utf8"),
			})),
		),
		readOptionalFile(path.join(directory, THEME_METADATA_FILE)),
	]);

	return mergeThemeMetadata(files, parseThemeMetadata(rawMetadata));
}

/** Every theme preset the app ships, with its metadata. */
export async function getThemePresets(): Promise<ThemePreset[]> {
	noStore();

	const directory = await resolveThemeDirectory();
	if (!directory) {
		return [];
	}

	return loadThemePresets(directory);
}
