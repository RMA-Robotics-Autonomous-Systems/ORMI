/**
 * Theme preset metadata (`themes/themes.json`): parsed on the server, never
 * allowed to break the page. Covers the parser, the merge with the CSS files
 * and the loader against fixture directories, plus the shipped file itself.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	THEME_METADATA_FILE,
	loadThemePresets,
	mergeThemeMetadata,
	parseThemeMetadata,
	themeMetadataSchema,
} from "@/server/theme-presets";

const THEMES_DIR = path.join(import.meta.dir, "..", "themes");

let errorSpy: ReturnType<typeof spyOn>;
let warnSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	errorSpy = spyOn(console, "error").mockImplementation(() => {});
	warnSpy = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	errorSpy.mockRestore();
	warnSpy.mockRestore();
});

describe("parseThemeMetadata", () => {
	test("parses a valid document", () => {
		expect(
			parseThemeMetadata(
				JSON.stringify({
					clay: {
						name: "Clay",
						movement: "Claymorphism",
						description: "Soft surfaces.",
					},
					amber: { name: "Amber" },
				}),
			),
		).toEqual({
			clay: {
				name: "Clay",
				movement: "Claymorphism",
				description: "Soft surfaces.",
			},
			amber: { name: "Amber" },
		});
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("a missing file yields no metadata, silently", () => {
		expect(parseThemeMetadata(null)).toEqual({});
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("invalid JSON yields no metadata and is logged", () => {
		expect(parseThemeMetadata("{ clay: ")).toEqual({});
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});

	test.each([
		["a non-object root", "[]"],
		["an entry with no name", '{"clay": {"movement": "Claymorphism"}}'],
		["an empty name", '{"clay": {"name": "  "}}'],
		["a non-string field", '{"clay": {"name": "Clay", "movement": 3}}'],
		["an unknown field", '{"clay": {"name": "Clay", "colour": "red"}}'],
	])("%s fails the schema, yields no metadata and is logged", (_, raw) => {
		expect(parseThemeMetadata(raw)).toEqual({});
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});
});

describe("mergeThemeMetadata", () => {
	const files = [
		{ id: "clay", css: ":root{}" },
		{ id: "night-ops", css: ".dark{}" },
	];

	test("a CSS file with no entry falls back to its title-cased id", () => {
		const presets = mergeThemeMetadata(files, {
			clay: { name: "Clay", movement: "Claymorphism" },
		});
		expect(presets).toEqual([
			{
				id: "clay",
				name: "Clay",
				movement: "Claymorphism",
				css: ":root{}",
			},
			{ id: "night-ops", name: "Night Ops", css: ".dark{}" },
		]);
		expect(presets[1]).not.toHaveProperty("movement");
	});

	test("an entry with no CSS file is ignored and logged", () => {
		const presets = mergeThemeMetadata(files, {
			ghost: { name: "Ghost" },
		});
		expect(presets.map((preset) => preset.id)).toEqual([
			"clay",
			"night-ops",
		]);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	test("follows the order themes.json lists, unlisted presets last in file order", () => {
		const presets = mergeThemeMetadata(
			[
				{ id: "amber", css: "" },
				{ id: "clay", css: "" },
				{ id: "nortern", css: "" },
				{ id: "zulu", css: "" },
				{ id: "alpha", css: "" },
			],
			{
				nortern: { name: "Nortern" },
				clay: { name: "Clay" },
				amber: { name: "Amber" },
			},
		);
		expect(presets.map((preset) => preset.id)).toEqual([
			"nortern",
			"clay",
			"amber",
			"zulu",
			"alpha",
		]);
	});

	test("an id that names an Object prototype member is not metadata", () => {
		const [preset] = mergeThemeMetadata(
			[{ id: "constructor", css: "" }],
			{},
		);
		expect(preset?.name).toBe("Constructor");
	});
});

describe("loadThemePresets", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), "ormi-themes-"));
		writeFileSync(path.join(dir, "b-theme.css"), ":root { --radius: 0; }");
		writeFileSync(
			path.join(dir, "a-theme.css"),
			".dark { --radius: 1rem; }",
		);
		writeFileSync(path.join(dir, "notes.txt"), "not a preset");
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	test("with metadata", async () => {
		writeFileSync(
			path.join(dir, THEME_METADATA_FILE),
			JSON.stringify({ "a-theme": { name: "Alpha", movement: "First" } }),
		);
		const presets = await loadThemePresets(dir);
		expect(
			presets.map(({ id, name, movement }) => ({ id, name, movement })),
		).toEqual([
			{ id: "a-theme", name: "Alpha", movement: "First" },
			{ id: "b-theme", name: "B Theme", movement: undefined },
		]);
		expect(presets[0]?.css).toBe(".dark { --radius: 1rem; }");
	});

	test("with no metadata file", async () => {
		const presets = await loadThemePresets(dir);
		expect(presets.map((preset) => preset.name)).toEqual([
			"A Theme",
			"B Theme",
		]);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("with an invalid metadata file the presets still load", async () => {
		writeFileSync(path.join(dir, THEME_METADATA_FILE), "{not json");
		const presets = await loadThemePresets(dir);
		expect(presets.map((preset) => preset.name)).toEqual([
			"A Theme",
			"B Theme",
		]);
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});
});

describe("the shipped themes.json", () => {
	const raw = readFileSync(
		path.join(THEMES_DIR, THEME_METADATA_FILE),
		"utf8",
	);
	const metadata = themeMetadataSchema.parse(JSON.parse(raw));
	const ids = readdirSync(THEMES_DIR)
		.filter((file) => file.endsWith(".css"))
		.map((file) => file.replace(/\.css$/u, ""));

	test("names only presets that exist, each with a movement", () => {
		for (const id of Object.keys(metadata)) expect(ids).toContain(id);
		for (const meta of Object.values(metadata)) {
			expect(meta.movement).toBeTruthy();
		}
	});

	test("opens the picker on nortern, then tactical, then clay", async () => {
		const presets = await loadThemePresets(THEMES_DIR);
		expect(presets.slice(0, 3).map((preset) => preset.id)).toEqual([
			"nortern",
			"tactical",
			"clay",
		]);
		expect(presets.map((preset) => preset.id).sort()).toEqual(
			[...ids].sort(),
		);
	});

	test("follows the UI copy rules: no em dash, no en dash", () => {
		for (const meta of Object.values(metadata)) {
			for (const text of [meta.name, meta.movement, meta.description]) {
				expect(text ?? "").not.toMatch(/[–—]/u);
			}
		}
	});
});
