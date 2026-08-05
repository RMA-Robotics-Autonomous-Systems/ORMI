import type { LoadgenGenerator } from "./index";

/**
 * Load intensity preset selector.
 *
 * `light` / `medium` / `heavy` map to fixed, curated generator mixes (see
 * {@link PRESETS}); `custom` hands control back to the user-authored
 * `generators` array in the datasource settings.
 */
export type LoadgenPreset = "light" | "medium" | "heavy" | "custom";

/**
 * Curated generator mixes for the non-custom presets.
 *
 * Single source of truth: the worker and the provider both resolve the
 * effective generator list through {@link resolveGenerators} rather than
 * duplicating these tables. `heavy` deliberately pushes past the plugin's
 * historical default mix and includes a duty-cycled burst generator so the
 * pipeline knee is easy to find.
 */
export const PRESETS: Record<"light" | "medium" | "heavy", LoadgenGenerator[]> =
	{
		light: [
			{
				topicPrefix: "/load/scalar",
				topicCount: 5,
				type: "scalar",
				rateHz: 10,
				payloadBytes: 64,
			},
			{
				topicPrefix: "/load/object",
				topicCount: 2,
				type: "object",
				rateHz: 10,
				payloadBytes: 2048,
			},
		],
		medium: [
			{
				topicPrefix: "/load/scalar",
				topicCount: 15,
				type: "scalar",
				rateHz: 30,
				payloadBytes: 256,
			},
			{
				topicPrefix: "/load/object",
				topicCount: 8,
				type: "object",
				rateHz: 20,
				payloadBytes: 8192,
			},
			{
				topicPrefix: "/load/cloud",
				topicCount: 1,
				type: "pointcloud",
				rateHz: 10,
				payloadBytes: 524288,
				transfer: true,
			},
		],
		heavy: [
			{
				topicPrefix: "/load/scalar",
				topicCount: 40,
				type: "scalar",
				rateHz: 60,
				payloadBytes: 256,
			},
			{
				topicPrefix: "/load/object",
				topicCount: 25,
				type: "object",
				rateHz: 30,
				payloadBytes: 8192,
			},
			{
				topicPrefix: "/load/cloud",
				topicCount: 6,
				type: "pointcloud",
				rateHz: 20,
				payloadBytes: 1258291,
				transfer: true,
			},
			{
				topicPrefix: "/load/burst",
				topicCount: 10,
				type: "object",
				rateHz: 60,
				payloadBytes: 4096,
				burst: { periodMs: 1000, dutyPct: 30 },
			},
		],
	};

/**
 * Resolve the effective generator list for a set of loadgen settings.
 *
 * - A known non-custom preset (`light` / `medium` / `heavy`) returns its fixed
 *   {@link PRESETS} mix.
 * - `custom` returns the user-authored `generators` array (or `[]` if absent).
 * - A missing `preset` with a non-empty `generators` array returns those
 *   generators (back-compat with pre-preset configs).
 * - Anything else (missing/unknown preset, no generators) falls back to the
 *   `medium` preset.
 *
 * @param settings - Loadgen settings subset carrying `preset` and/or
 *   `generators`.
 * @returns The generator list the worker should expand into topics.
 */
export function resolveGenerators(settings: {
	preset?: LoadgenPreset;
	generators?: LoadgenGenerator[];
}): LoadgenGenerator[] {
	const { preset, generators } = settings;

	if (preset === "light" || preset === "medium" || preset === "heavy") {
		return PRESETS[preset];
	}
	if (preset === "custom") {
		return generators ?? [];
	}
	// Missing or unknown preset: honour a pre-preset config's generators,
	// otherwise default to the medium mix.
	if (preset === undefined && generators && generators.length > 0) {
		return generators;
	}
	return PRESETS.medium;
}
