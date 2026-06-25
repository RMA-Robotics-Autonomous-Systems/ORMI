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
 * Return a new draft with an INLINE objective geometry appended
 * (`{ geometry: { geometry_type, coordinates } }`).
 *
 * Coordinates pass through unchanged (`[lng, lat]`).
 * @param draft - The current draft.
 * @param drawn - The drawn geometry handed off from the map (F6).
 * @returns A new draft (the original is not mutated).
 */
export function pushInlineGeometry(
	draft: MissionDraft,
	drawn: DraftGeometry,
): MissionDraft {
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
