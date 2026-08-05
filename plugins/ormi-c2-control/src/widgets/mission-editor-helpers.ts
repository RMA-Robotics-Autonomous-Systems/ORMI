import {
	MissionBehavior,
	MissionConfig,
	MissionGeometry,
} from "../types/c2-types";
import { generateMissionId } from "./mission-list";
import type { DraftGeometry } from "../state/map-editing-store";

/**
 * F5 — pure mission-editor draft logic (build / hydrate / push-geometry /
 * merge-vehicles).
 *
 * No React, no fetch — the editor widget owns the draft via `useState` and calls
 * these to mutate it immutably, so each step is unit-testable.
 *
 * ⚠ COORDINATE RULE — inline geometries are GeoJSON `[lng, lat]` end-to-end (the
 * map hands off `[lng, lat]`; no swap here). See `feature-geojson.ts`.
 */

/** A draft mission carries a guaranteed string id + name (ORMI-side). */
export type MissionDraft = MissionConfig & {
	mission_id: string;
	name: string;
};

/**
 * Decide whether the editor should (re)load the active mission into the draft.
 *
 * The F5 editor follows the active mission from the selection store: it loads a
 * mission whenever the active id is a non-empty id that differs from the one
 * already loaded in the draft. A `null`/empty active id (no selection) and an
 * active id that already matches the draft both yield `false` — the latter is
 * the loop-avoidance guard, so a hydrate that sets the draft to the active id
 * does not re-trigger another load.
 *
 * Pure (no React) so the follow decision is unit-testable in isolation.
 *
 * @param activeId - The active mission id from the selection store.
 * @param draftMissionId - The mission id currently loaded in the draft.
 * @returns `true` when a different, non-empty mission should be loaded.
 */
export function shouldLoadActiveMission(
	activeId: string | null | undefined,
	draftMissionId: string | null | undefined,
): boolean {
	if (!activeId) return false;
	return activeId !== draftMissionId;
}

/**
 * Build a fresh, minimal mission draft.
 *
 * Mirrors `newMissionStub` but typed for the editor: a fresh id, a name, a
 * behavior, an empty objective (no geometries yet) and an empty vehicle
 * allocation. The operator fills the rest in via the editor form.
 *
 * @param name - Display name (defaults to "New mission").
 * @param behavior - Mission behavior (defaults to NAVIGATE).
 * @returns A new {@link MissionDraft}.
 */
export function buildMissionDraft(
	name = "New mission",
	behavior: MissionBehavior = MissionBehavior.NAVIGATE,
): MissionDraft {
	return {
		mission_id: generateMissionId(),
		name,
		behavior,
		objective: { geometries: [] },
		vehicles: [],
	};
}

/**
 * Hydrate a draft from an existing stored mission object (the "Load active
 * mission" flow).
 *
 * Defensively normalizes the stored shape: tolerates a missing/!string id
 * (mints one), a missing name (falls back to the id), a non-numeric behavior
 * (defaults to NAVIGATE), a missing objective (empty geometries), and a
 * non-array vehicles list (empties it). Mongo's own `_id` is dropped so a later
 * save inserts cleanly under `mission_id`. All other fields are carried through
 * verbatim so the operator edits the real config.
 *
 * @param raw - The stored mission object (any shape).
 * @returns A {@link MissionDraft} hydrated from `raw`.
 */
export function hydrateMissionDraft(raw: unknown): MissionDraft {
	const obj =
		raw && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};

	const { _id: _omitMongoId, ...rest } = obj;
	void _omitMongoId;

	const idCandidate = rest.mission_id ?? rest.id;
	const mission_id =
		typeof idCandidate === "string" && idCandidate.length > 0
			? idCandidate
			: generateMissionId();

	const name =
		typeof rest.name === "string" && rest.name.length > 0
			? rest.name
			: mission_id;

	const behavior =
		typeof rest.behavior === "number"
			? (rest.behavior as MissionBehavior)
			: MissionBehavior.NAVIGATE;

	const objective =
		rest.objective &&
		typeof rest.objective === "object" &&
		!Array.isArray(rest.objective)
			? {
					...(rest.objective as Record<string, unknown>),
					geometries: Array.isArray(
						(rest.objective as { geometries?: unknown }).geometries,
					)
						? ((rest.objective as { geometries: MissionGeometry[] })
								.geometries as MissionGeometry[])
						: [],
				}
			: { geometries: [] };

	const vehicles = Array.isArray(rest.vehicles)
		? (rest.vehicles.filter(
				(v): v is string => typeof v === "string",
			) as string[])
		: [];

	return {
		...(rest as Record<string, unknown>),
		mission_id,
		name,
		behavior,
		objective,
		vehicles,
	} as MissionDraft;
}

/**
 * Structural-equality check for the advanced (deep-optional) slice fed to
 * JSON-Forms (`arrival_time` / `transit` / `start`).
 *
 * JSON-Forms fires `onChange` on mount with the data it was handed, so the
 * editor must NOT treat that echo as an operator edit (it would falsely mark a
 * freshly-loaded mission dirty). This compares the incoming slice against the
 * draft's current slice so the dirty flag flips only on a real change. Compares
 * by stable JSON serialization — the slice is small and JSON-safe.
 *
 * @param a - One advanced slice.
 * @param b - The other advanced slice.
 * @returns `true` when both slices are structurally equal.
 */
export function advancedSliceEquals(a: unknown, b: unknown): boolean {
	return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

/**
 * Return a new draft with an objective geometry appended that REFERENCES a
 * stored MapDB feature by id (`{ feature_id }`).
 *
 * @param draft - The current draft.
 * @param featureId - The MapDB feature id to reference.
 * @returns A new draft (the original is not mutated).
 */
export function pushFeatureRef(
	draft: MissionDraft,
	featureId: string,
): MissionDraft {
	const geometry: MissionGeometry = { feature_id: featureId };
	return {
		...draft,
		objective: {
			...draft.objective,
			geometries: [...draft.objective.geometries, geometry],
		},
	};
}

/**
 * Return `true` only when `coords` contains at least one usable leaf `[lon, lat]`
 * pair (two numbers) somewhere in its GeoJSON nesting.
 *
 * Walks the same nesting as the validator's `checkCoordinates`: a leaf is reached
 * when the first element is a number (then it must be ≥2 numbers); otherwise each
 * element is recursed into. Empty arrays (including a degenerate ring `[[]]`),
 * single-number pairs (`[5]`), and non-array inputs all yield `false`.
 *
 * This is the authoring-side counterpart to the validator — it stops a degenerate
 * draw from ever being appended to a draft (audit #10).
 *
 * @param coords - The drawn geometry's coordinates (any nesting depth).
 * @returns `true` when at least one valid `[lon, lat]` leaf exists.
 */
export function hasUsableCoordinates(coords: unknown): boolean {
	if (!Array.isArray(coords) || coords.length === 0) return false;
	// Leaf pair `[lon, lat]` — first element is a number.
	if (typeof coords[0] === "number") {
		return (
			coords.length >= 2 &&
			typeof coords[0] === "number" &&
			typeof coords[1] === "number"
		);
	}
	// Nested — usable when ANY child yields a usable leaf.
	return coords.some((entry) => hasUsableCoordinates(entry));
}

/**
 * Return a new draft with an INLINE objective geometry appended
 * (`{ geometry: { geometry_type, coordinates } }`).
 *
 * Coordinates pass through unchanged (`[lng, lat]`). A drawn geometry whose
 * coordinates have no usable `[lon, lat]` leaf (an empty or degenerate draw) is
 * REFUSED — the draft is returned unchanged so a degenerate geometry can never be
 * added (audit #10). Does not throw.
 *
 * @param draft - The current draft.
 * @param drawn - The drawn geometry handed off from the map (F6).
 * @returns A new draft (the original is not mutated); unchanged if the draw is unusable.
 */
export function pushInlineGeometry(
	draft: MissionDraft,
	drawn: DraftGeometry,
): MissionDraft {
	if (!hasUsableCoordinates(drawn.coordinates)) {
		return draft;
	}
	const geometry: MissionGeometry = {
		geometry: {
			geometry_type: drawn.geometry_type,
			coordinates: drawn.coordinates,
		},
	};
	return {
		...draft,
		objective: {
			...draft.objective,
			geometries: [...draft.objective.geometries, geometry],
		},
	};
}

/**
 * Return a new draft with an objective geometry removed by index. Out-of-range
 * indices yield the draft unchanged (new identity).
 *
 * @param draft - The current draft.
 * @param index - The geometry index to remove.
 * @returns A new draft.
 */
export function removeGeometryAt(
	draft: MissionDraft,
	index: number,
): MissionDraft {
	return {
		...draft,
		objective: {
			...draft.objective,
			geometries: draft.objective.geometries.filter(
				(_, i) => i !== index,
			),
		},
	};
}

/**
 * Return a new draft whose `vehicles` is set to the given allocation, deduped
 * and order-preserving (the multi-select hands the full checked set on each
 * change, so this is a replace, not a merge-append).
 *
 * @param draft - The current draft.
 * @param vehicleIds - The full set of allocated vehicle ids.
 * @returns A new draft.
 */
export function mergeVehicles(
	draft: MissionDraft,
	vehicleIds: string[],
): MissionDraft {
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const id of vehicleIds) {
		if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
		seen.add(id);
		deduped.push(id);
	}
	return { ...draft, vehicles: deduped };
}

/**
 * Toggle a single vehicle id in the draft allocation (checkbox handler helper):
 * add it when absent, remove it when present.
 *
 * @param draft - The current draft.
 * @param vehicleId - The vehicle id to toggle.
 * @returns A new draft.
 */
export function toggleVehicle(
	draft: MissionDraft,
	vehicleId: string,
): MissionDraft {
	const present = draft.vehicles.includes(vehicleId);
	const next = present
		? draft.vehicles.filter((id) => id !== vehicleId)
		: [...draft.vehicles, vehicleId];
	return { ...draft, vehicles: next };
}

/**
 * The drawable shapes the map toolbar offers. `point` is a single-vertex mission
 * objective geometry only — C2 map features stay line/polygon (the C2 rejects
 * `Point` map features), so the map-editor context never offers it.
 */
export type DrawShape = "point" | "line" | "polygon" | "rectangle";

/** terra-draw mode strings (verified against terra-draw 1.31.2). */
export type DrawGeometryMode = "point" | "linestring" | "polygon" | "rectangle";

/**
 * Map a toolbar {@link DrawShape} to the terra-draw mode string the Draw tool
 * activates. `rectangle` is an axis-aligned bounding rectangle (a fast polygon);
 * it produces a `Polygon` geometry just like `polygon`. `point` activates the
 * single-vertex point mode (mission objective geometry only).
 *
 * Pure (no React / no map) so the mapping is unit-testable in isolation.
 *
 * @param shape - The operator-selected shape.
 * @returns The terra-draw mode string to activate.
 */
export function drawShapeToMode(shape: DrawShape): DrawGeometryMode {
	switch (shape) {
		case "point":
			return "point";
		case "line":
			return "linestring";
		case "rectangle":
			return "rectangle";
		case "polygon":
		default:
			return "polygon";
	}
}

/**
 * The slice of a {@link MissionConfig} the MAP (F6) owns and may overwrite on
 * save: the objective geometries, the vehicle allocation, the behavior, and the
 * (optional) display name. Everything else — F5's advanced `transit` / `start`
 * blocks, `arrival_time`, etc. — is owned elsewhere and must be preserved.
 */
export interface MissionOwnedFields {
	geometries: MissionGeometry[];
	vehicles: string[];
	behavior: MissionBehavior;
	name?: string;
}

/**
 * Merge the MAP-owned fields into a freshly-fetched mission config, preserving
 * every other field verbatim (so the map's save never clobbers F5's advanced
 * `transit` / `start` / `arrival_time` blocks).
 *
 * Only `objective.geometries`, top-level `vehicles`, `behavior`, and `name` are
 * replaced; the rest of `objective` and the rest of the config carry through.
 * `name` is only written when provided (a non-empty string), so the map never
 * blanks an F5-set name. Pure (no fetch / no React) so the merge is testable.
 *
 * This is the deadlock fix: a mission F4 created (empty) gains behavior +
 * geometry + vehicles here, so `validateMissionConfig` passes and the save
 * succeeds. Concurrent edits to the same field are last-writer-wins by design.
 *
 * @param fresh - The re-fetched stored mission config.
 * @param owned - The MAP-owned fields to overlay.
 * @returns A new merged config (neither input is mutated).
 */
export function mergeMissionOwnedFields(
	fresh: MissionConfig,
	owned: MissionOwnedFields,
): MissionConfig {
	const merged: MissionConfig = {
		...fresh,
		behavior: owned.behavior,
		vehicles: owned.vehicles,
		objective: {
			...fresh.objective,
			geometries: owned.geometries,
		},
	};
	const name = owned.name?.trim();
	if (name) merged.name = name;
	return merged;
}

/**
 * Shallow-merge a partial top-level patch into the draft (name/behavior/optional
 * blocks). The embedded JSON-Forms sections write whole sub-objects (e.g.
 * `transit`, `start`) through this.
 *
 * @param draft - The current draft.
 * @param patch - Partial top-level fields to overlay.
 * @returns A new draft.
 */
export function patchDraft(
	draft: MissionDraft,
	patch: Partial<MissionConfig>,
): MissionDraft {
	return { ...draft, ...patch } as MissionDraft;
}

/**
 * Recursively drop "empty" values — `undefined`, `null`, `""`, and objects that
 * become empty after pruning. Arrays are pruned element-wise but kept (even when
 * empty) so required lists like `geometries`/`vehicles` survive for the
 * validator. Returns `undefined` for a value that prunes away to nothing.
 */
function pruneEmpty(value: unknown): unknown {
	if (value === undefined || value === null || value === "") return undefined;
	if (Array.isArray(value)) {
		return value.map(pruneEmpty).filter((v) => v !== undefined);
	}
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, raw] of Object.entries(value)) {
			const pruned = pruneEmpty(raw);
			if (pruned !== undefined) out[key] = pruned;
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}
	return value;
}

/**
 * Return a submission-ready copy of the draft with **empty optional blocks
 * pruned away**.
 *
 * JSON-Forms materializes a parent object as soon as any nested field is
 * touched, so editing one field can leave behind `transit: {}` or
 * `arrival_time: { earliest: "" }`. Those half-formed blocks trip the C2
 * all-or-nothing rules (a present `transit` requires
 * `desired_vehicle_constraints`; a present `MissionTime` requires all three
 * bounds), surfacing errors the operator never intended. Pruning the optional
 * blocks (`objective.arrival_time`, `transit`, `start`) means a block only
 * counts as "present" once it holds real data — so a genuinely partial block
 * still errors (correctly guiding the operator to complete it), while an empty
 * one simply disappears.
 *
 * Required fields are never pruned: `mission_id`, `name`, `behavior`,
 * `vehicles`, and `objective.geometries` are preserved verbatim (even an empty
 * array — the validator owns those rules).
 *
 * @param draft - The editor draft.
 * @returns A cleaned {@link MissionDraft} for validation + save.
 */
export function cleanMissionConfig(draft: MissionDraft): MissionDraft {
	const next: MissionDraft = { ...draft };

	// objective: keep geometries (required); prune the optional arrival_time.
	const objective: Record<string, unknown> = { ...draft.objective };
	const arrival = pruneEmpty(objective.arrival_time);
	if (arrival === undefined) delete objective.arrival_time;
	else objective.arrival_time = arrival;
	next.objective = objective as unknown as MissionDraft["objective"];

	// transit / start are wholly optional — drop them when they prune to nothing.
	const mutable = next as unknown as Record<string, unknown>;
	for (const key of ["transit", "start"] as const) {
		const pruned = pruneEmpty(draft[key]);
		if (pruned === undefined) delete mutable[key];
		else mutable[key] = pruned;
	}

	return next;
}
