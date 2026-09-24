import { MissionBehavior, MissionConfig } from "../types/c2-types";
import {
	buildGraphDocument,
	graphDocId,
	isMissionGraphDocId,
	readGraphDocument,
} from "./mission-graph";
import {
	buildAssetsDocument,
	isMissionAssetsDocId,
	readAssetsDocument,
} from "./mission-assets";

/**
 * Mission-browser list normalization + minimal-create helpers (pure, testable).
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
 * ⚠ GRAPH AND ASSETS DOCUMENTS ARE NOT MISSIONS. A mission's behaviour graph
 * and its map + assets are persisted as sibling documents in the SAME
 * `missions` collection under `"<mission_id>:graph"` / `":assets"` — the backend has no other generic document store, the
 * collection's Mongo schema is `strict: false`, and `POST /missions` validates
 * only a non-empty `mission_id`. Without this filter every mission with a graph
 * would grow a phantom row in the browser that an operator could select, submit
 * and delete. Filtered on the id, not on the `kind` marker, so a document an
 * older or a partial write left without its marker is still excluded.
 *
 * @param data - The raw remote-call response data.
 * @returns Normalized mission rows (possibly empty).
 */
export function normalizeMissions(data: unknown): MissionRow[] {
	const list = missionDocuments(data);

	const rows: MissionRow[] = [];
	for (const entry of list) {
		if (entry == null || typeof entry !== "object") continue;
		const obj = entry as Record<string, unknown>;
		const mission_id = readMissionId(obj);
		if (!mission_id) continue;
		if (isMissionGraphDocId(mission_id) || isMissionAssetsDocId(mission_id))
			continue;
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
 * ⚠ This is a **stub**, not the full authoring form (that is the mission
 * editor). It carries
 * only what `c2.missions.save` needs to store a definition: a fresh id, a name,
 * a behavior, and an empty objective/vehicle allocation. The operator fills in
 * geometries/vehicles/constraints later on the mission map.
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
 * Every document of a `c2.missions.list` response, graph documents included
 * (a bare array, or `{ missions: [...] }`).
 *
 * @param data - The raw remote-call response data.
 * @returns The documents, possibly empty.
 */
export function missionDocuments(data: unknown): Record<string, unknown>[] {
	const list = Array.isArray(data)
		? data
		: Array.isArray((data as { missions?: unknown })?.missions)
			? (data as { missions: unknown[] }).missions
			: [];
	return list.filter(
		(entry): entry is Record<string, unknown> =>
			entry != null && typeof entry === "object" && !Array.isArray(entry),
	);
}

/**
 * Duplicate a mission WITH its behaviour graph and its map + assets. Copying
 * only the mission kept its `graph_ref`, which still named the ORIGINAL's graph
 * document: the copy passed the C2's graph gate and the fog, which looks the
 * graph up by the copy's own id, found none. Both sibling documents are copied
 * under the new id (the assets keep their ids: they are scoped to the mission)
 * and the reference rewritten; a mission without a graph loses the stale
 * fields.
 *
 * @param source - The raw stored mission.
 * @param graphDoc - Its raw `"<id>:graph"` document, or null when it has none.
 * @param assetsDoc - Its raw `"<id>:assets"` document, or null.
 * @param newName - The duplicate's display name.
 * @returns The mission copy, and the copies of the documents it has.
 */
export function duplicateMissionDocuments(
	source: Record<string, unknown>,
	graphDoc: unknown,
	assetsDoc: unknown,
	newName: string,
): {
	mission: Record<string, unknown>;
	graph: Record<string, unknown> | null;
	assets: Record<string, unknown> | null;
} {
	const copy = duplicateMission(source, newName);
	const newId = String(copy.mission_id);
	const storedAssets = readAssetsDocument(assetsDoc);
	const assets = storedAssets
		? (buildAssetsDocument(newId, storedAssets) as unknown as Record<
				string,
				unknown
			>)
		: null;
	const graph = readGraphDocument(graphDoc);
	if (!graph) {
		const {
			graph_ref: _omitRef,
			graph_compiles: _omitCompiles,
			...rest
		} = copy;
		void _omitRef;
		void _omitCompiles;
		return { mission: rest, graph: null, assets };
	}
	return {
		mission: { ...copy, graph_ref: graphDocId(newId) },
		graph: buildGraphDocument(newId, graph) as unknown as Record<
			string,
			unknown
		>,
		assets,
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
