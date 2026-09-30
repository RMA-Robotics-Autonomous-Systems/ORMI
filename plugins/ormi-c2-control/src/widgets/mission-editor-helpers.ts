import {
	MissionBehavior,
	MissionConfig,
	MissionGeometry,
} from "../types/c2-types";
import { generateMissionId } from "./mission-list";

/**
 * Pure mission-draft logic (build / hydrate / clean / merge-for-save).
 *
 * No React, no fetch — the authoring panels (the mission map, the mission
 * browser and the submit path) hold the draft in the shared draft store and
 * call these to mutate it immutably, so each step is unit-testable.
 *
 * ⚠ OWNERSHIP — the shared mission draft is the single in-memory truth for a
 * mission. `objective.geometries`, `vehicles` and `behavior` are compiled into
 * it by the behaviour graph and are authored NOWHERE else; the map contributes
 * the assets those geometries reference, never the geometry itself. Nothing in
 * this module overlays a panel's own copy of a mission field onto a save — see
 * {@link mergeStoredMission}.
 *
 * The module keeps its `mission-editor-helpers` name from the mission-editor
 * widget these were factored out of; that widget has been removed and the
 * helpers outlived it.
 *
 * ⚠ COORDINATE RULE — `[lng, lat]` end-to-end; no swap here. See
 * `feature-geojson.ts`.
 */

/** A draft mission carries a guaranteed string id + name (ORMI-side). */
export type MissionDraft = MissionConfig & {
	mission_id: string;
	name: string;
};

/**
 * Decide whether a panel should (re)load the active mission into the draft.
 *
 * An authoring panel follows the active mission from the selection store: it loads a
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

/** A stored geometry without the `_id` the store gave it. */
function dropMongoId(geometry: MissionGeometry): MissionGeometry {
	if (!geometry || typeof geometry !== "object" || !("_id" in geometry)) {
		return geometry;
	}
	const { _id: _omitMongoId, ...kept } = geometry as MissionGeometry & {
		_id?: unknown;
	};
	void _omitMongoId;
	return kept as MissionGeometry;
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
					// The store gives each geometry an `_id` of its own too. Kept,
					// it made every saved mission differ from its graph's
					// `{ feature_id }` list, so it opened with unsaved edits.
					geometries: Array.isArray(
						(rest.objective as { geometries?: unknown }).geometries,
					)
						? (
								rest.objective as {
									geometries: MissionGeometry[];
								}
							).geometries.map(dropMongoId)
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
 * Return `true` only when `coords` contains at least one usable leaf `[lon, lat]`
 * pair (two numbers) somewhere in its GeoJSON nesting.
 *
 * Walks the same nesting as the validator's `checkCoordinates`: a leaf is reached
 * when the first element is a number (then it must be ≥2 numbers); otherwise each
 * element is recursed into. Empty arrays (including a degenerate ring `[[]]`),
 * single-number pairs (`[5]`), and non-array inputs all yield `false`.
 *
 * This is the authoring-side counterpart to the validator — it stops a degenerate
 * draw from ever being appended to a draft.
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
 * The drawable shapes the map toolbar offers. `point` is a single-vertex
 * geometry: a mission objective, or — since the C2 gained the asset feature
 * types — a `waypoint` / `cue` map feature. The map-editor context offers it
 * only for those two types (`FEATURE_TYPE_GEOMETRY` in `feature-geojson.ts`),
 * because the backend still refuses a Point for `road`/`geofence`/`risk`/`zone`.
 */
export type DrawShape = "point" | "line" | "polygon" | "rectangle";

/** terra-draw mode strings (verified against terra-draw 1.31.2). */
export type DrawGeometryMode = "point" | "linestring" | "polygon" | "rectangle";

/**
 * Map a toolbar {@link DrawShape} to the terra-draw mode string the Draw tool
 * activates. `rectangle` is an axis-aligned bounding rectangle (a fast polygon);
 * it produces a `Polygon` geometry just like `polygon`. `point` activates the
 * single-vertex point mode (a mission objective, or a waypoint/cue asset).
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
 * Fold a working draft onto the freshly-fetched stored mission, so a save
 * persists the DRAFT and still carries every stored field the draft has never
 * seen.
 *
 * ## Why this replaced `mergeMissionOwnedFields`
 *
 * There used to be a `MissionOwnedFields` quartet — `objective.geometries`,
 * `vehicles`, `behavior`, `name` — that the MAP claimed and overwrote from its
 * own panel state on every save. Three of those four are now compiled by the
 * behaviour graph (`compileMissionGraph`, in `mission-graph.ts`), which writes them into the same
 * shared draft. Two authors over one set of fields is last-writer-wins, and the
 * map's save was always the last writer: a graph could compile a correct
 * allocation and the map's next save threw it away, with nothing on screen
 * saying so.
 *
 * So there is now exactly ONE author. The shared **mission draft** is the
 * in-memory truth: the graph compiles into it, the map reads it, and this
 * function is how a save gets it onto the wire. Nothing is overlaid from panel
 * state.
 *
 * ## What `fresh` is still for
 *
 * The draft is not a superset of what the server holds. A field the backend
 * added after the draft was loaded — and the `transit` / `start` /
 * `arrival_time` blocks, which have no UI at all right now — exists only in
 * `fresh`, and a save that sent the draft alone would delete it. So `fresh` is
 * the base and the draft is layered on top, top level and inside `objective`,
 * which keeps every unknown stored field verbatim.
 *
 * `name` is the one normalised value: a blank / whitespace-only draft name
 * never blanks the stored one.
 *
 * @param fresh - The re-fetched stored mission config.
 * @param draft - The working draft to persist.
 * @returns A new merged draft (neither input is mutated).
 */
export function mergeStoredMission(
	fresh: MissionConfig,
	draft: MissionDraft,
): MissionDraft {
	const merged = {
		...(fresh as unknown as Record<string, unknown>),
		...(draft as unknown as Record<string, unknown>),
		objective: {
			...((fresh.objective ?? {}) as unknown as Record<string, unknown>),
			...((draft.objective ?? {}) as unknown as Record<string, unknown>),
		},
	} as unknown as MissionDraft;
	const name = draft.name?.trim();
	merged.name = name && name.length > 0 ? name : (fresh.name ?? draft.name);
	return merged;
}

/**
 * Stable signature of a whole mission draft — the map's "did someone else
 * change this while my save was in flight?" guard.
 *
 * ⚠ This is deliberately NOT the narrow `missionOwnedFieldsSignature` it
 * replaced. That one fingerprinted only the four fields the map claimed,
 * because the map's write touched only those and an edit to `transit` was
 * therefore not a conflict. The save now persists the WHOLE draft
 * ({@link mergeStoredMission}), so every field of it is in flight and every
 * field of it can be raced. Narrowing the signature while widening the write is
 * exactly how a concurrent edit gets silently overwritten — the guard has to
 * follow what is written, not what a panel happens to render.
 *
 * Compared on the CLEANED config with sorted keys, so key order and a
 * half-formed optional block that `cleanMissionConfig` prunes before the wire
 * never read as a difference.
 *
 * @param config - The config (or draft) to fingerprint.
 * @returns A stable signature over the whole mission.
 */
export function missionDraftSignature(config: MissionConfig): string {
	return canonicalJson(cleanMissionConfig(config as MissionDraft));
}

/** JSON with object keys sorted, so key order never reads as a difference. */
function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, v: unknown) => {
		if (!v || typeof v !== "object" || Array.isArray(v)) return v;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(v).sort()) {
			sorted[key] = (v as Record<string, unknown>)[key];
		}
		return sorted;
	});
}

/**
 * Whether two drafts describe the same mission once cleaned — the "is there
 * anything left unsaved?" test after a partial save. Key order is ignored (a
 * draft built by spreading the stored one and a config built by spreading the
 * server's copy order their keys differently), and empty optional blocks are
 * pruned first, exactly as {@link cleanMissionConfig} prunes them before a save.
 *
 * @param a - One draft.
 * @param b - The other draft.
 * @returns `true` when their cleaned content is equal.
 */
export function missionContentEquals(
	a: MissionDraft,
	b: MissionDraft,
): boolean {
	return (
		canonicalJson(cleanMissionConfig(a)) ===
		canonicalJson(cleanMissionConfig(b))
	);
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
