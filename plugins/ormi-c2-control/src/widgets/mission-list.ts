import { MissionBehavior, MissionConfig } from "../types/c2-types";

/**
 * F4 mission-list normalization + minimal-create helpers (pure, testable).
 *
 * The `:5000 /missions` endpoint returns stored mission definitions (C2DB). The
 * exact shape is the C2's concern; we normalize defensively into a small row
 * type for the browser list and tolerate a wrapped (`{ missions: [...] }`) or
 * bare-array response.
 */

/** A row in the mission browser. */
export interface MissionRow {
	mission_id: string;
	name: string;
	behavior?: MissionBehavior;
	/** The raw stored object, kept for duplicate (save-a-copy). */
	raw: Record<string, unknown>;
}

/**
 * Read a mission id off a stored mission object, tolerating field-name variants
 * (`mission_id` is canonical; `_id`/`id` are Mongo/legacy fallbacks).
 */
function readMissionId(obj: Record<string, unknown>): string | null {
	const id = obj.mission_id ?? obj._id ?? obj.id;
	return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Normalize the `c2.missions.list` response into browser rows.
 *
 * Accepts the bare array, a `{ missions: [...] }` wrapper, or null; drops
 * entries without a usable id.
 *
 * @param data - The raw remote-call response data.
 * @returns Normalized mission rows (possibly empty).
 */
export function normalizeMissions(data: unknown): MissionRow[] {
	const list = Array.isArray(data)
		? data
		: Array.isArray((data as { missions?: unknown })?.missions)
			? (data as { missions: unknown[] }).missions
			: [];

	const rows: MissionRow[] = [];
	for (const entry of list) {
		if (entry == null || typeof entry !== "object") continue;
		const obj = entry as Record<string, unknown>;
		const mission_id = readMissionId(obj);
		if (!mission_id) continue;
		const name =
			typeof obj.name === "string" && obj.name.length > 0
				? obj.name
				: mission_id;
		const behavior =
			typeof obj.behavior === "number"
				? (obj.behavior as MissionBehavior)
				: undefined;
		rows.push({ mission_id, name, behavior, raw: obj });
	}
	return rows;
}

/**
 * Build a minimal valid mission object for "create".
 *
 * ⚠ This is a **stub**, not the full authoring form (F5/Phase 4). It carries
 * only what `c2.missions.save` needs to store a definition: a fresh id, a name,
 * a behavior, and an empty objective/vehicle allocation. The operator fills in
 * geometries/vehicles/constraints later via the mission editor (F5).
 *
 * @param name - The new mission's display name.
 * @param behavior - The mission behavior (defaults to NAVIGATE).
 * @param missionId - Optional explicit id; defaults to a fresh UUID.
 * @returns A minimal `MissionConfig`-shaped object.
 */
export function newMissionStub(
	name: string,
	behavior: MissionBehavior = MissionBehavior.NAVIGATE,
	missionId?: string,
): MissionConfig & { mission_id: string; name: string } {
	return {
		mission_id: missionId ?? generateMissionId(),
		name,
		behavior,
		objective: { geometries: [] },
		vehicles: [],
	};
}

/**
 * Produce a copy of an existing stored mission under a fresh id and name, for
 * the "duplicate" action. Preserves all other fields so the copy is a faithful
 * clone the operator can then edit.
 *
 * @param source - The raw stored mission object to clone.
 * @param newName - The duplicate's display name.
 * @returns A new mission object with a fresh id.
 */
export function duplicateMission(
	source: Record<string, unknown>,
	newName: string,
): Record<string, unknown> {
	const { _id: _omitMongoId, ...rest } = source;
	void _omitMongoId; // drop Mongo's own _id so the copy is inserted fresh
	return {
		...rest,
		mission_id: generateMissionId(),
		name: newName,
	};
}

/**
 * Generate a mission id. Uses the browser-native UUID generator (widgets run
 * client-side); falls back to a timestamp-based id in the unlikely absence of
 * `crypto.randomUUID` (older runtimes / SSR).
 */
export function generateMissionId(): string {
	const c =
		typeof globalThis !== "undefined"
			? (globalThis.crypto as Crypto | undefined)
			: undefined;
	if (c && typeof c.randomUUID === "function") return c.randomUUID();
	return `mission-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
