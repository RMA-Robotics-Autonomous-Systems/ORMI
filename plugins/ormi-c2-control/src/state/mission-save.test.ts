import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetMissionDraftStore,
	editMissionDraft,
	getMissionDraft,
	isMissionDraftDirty,
} from "./mission-draft-store";
import {
	__resetMissionGraphStore,
	editMissionGraph,
	isMissionGraphDirty,
	setMissionGraph,
} from "./mission-graph-store";
import {
	__resetMissionAssetsStore,
	editMissionAssets,
	isMissionAssetsDirty,
	isMissionAssetsStored,
	setMissionAssets,
} from "./mission-assets-store";
import {
	saveMissionWithGraph,
	summarizeMissionSave,
	type MissionSaveCalls,
} from "./mission-save";
import { MissionBehavior, type MissionConfig } from "../types/c2-types";
import type { MissionDraft } from "../widgets/mission-editor-helpers";
import { type MissionAssets, upsertAsset } from "../widgets/mission-assets";
import type { MissionGraph } from "../widgets/mission-graph";

const MISSION = {
	mission_id: "m-1",
	name: "Alpha",
	behavior: 0,
	objective: { geometries: [] },
	vehicles: [],
	// A field this build has no UI for: the save must not drop it.
	operator_notes: "keep me",
};

/** Es navigates to one waypoint. */
function graph(): MissionGraph {
	const at = { x: 0, y: 0 };
	return {
		version: 3,
		nodes: [
			{
				id: "es",
				kind: "agent",
				label: "Es",
				position: at,
				agent_id: "robot-es",
			},
			{
				id: "go",
				kind: "action",
				label: "Go",
				position: at,
				action: "NAVIGATE",
			},
			{
				id: "wp",
				kind: "asset",
				label: "Hold",
				position: at,
				feature_id: "feat-wp",
			},
		],
		edges: [
			{
				id: "es-go",
				source: "es",
				source_port: "agent",
				target: "go",
				target_port: "agent",
			},
			{
				id: "wp-go",
				source: "wp",
				source_port: "value",
				target: "go",
				target_port: "target",
			},
		],
	};
}

/** The mission's map and its one waypoint (or a zone under the same id). */
function assets(type = "waypoint"): MissionAssets {
	return {
		map: "RMA",
		features: [
			{
				type: "Feature",
				properties: {
					feature_id: "feat-wp",
					feature_type: type,
					name: "Hold",
				},
				geometry:
					type === "zone"
						? {
								type: "Polygon",
								coordinates: [
									[
										[0, 0],
										[1, 0],
										[1, 1],
										[0, 0],
									],
								],
							}
						: { type: "Point", coordinates: [4.39, 50.84] },
			},
		],
	};
}

/** A fake mission store: what was written, in order. */
function store(
	overrides: Partial<{
		assetsFail: boolean;
		graphFails: boolean;
		missionFails: boolean;
	}> = {},
) {
	const written: Record<string, unknown>[] = [];
	const calls: MissionSaveCalls = {
		list: async () => ({ success: true, data: [MISSION] }),
		save: async (doc) => {
			const id = String(doc.mission_id);
			const isGraph = id.endsWith(":graph");
			const isAssets = id.endsWith(":assets");
			if (
				(isAssets && overrides.assetsFail) ||
				(isGraph && overrides.graphFails) ||
				(!isGraph && !isAssets && overrides.missionFails)
			) {
				return { success: false, error: "boom" };
			}
			written.push(doc);
			return { success: true };
		},
	};
	return { calls, written };
}

beforeEach(() => {
	__resetMissionDraftStore();
	__resetMissionGraphStore();
	__resetMissionAssetsStore();
});

describe("one Save mission", () => {
	it("writes the graph first, then the mission that points at it and describes it", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), true); // stored and clean: not rewritten
		editMissionGraph("m-1", (g) => ({ ...g })); // an unsaved edit
		const { calls, written } = store();

		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(true);
		expect(written.map((d) => d.mission_id)).toEqual(["m-1:graph", "m-1"]);
		const mission = written[1] as Record<string, unknown>;
		expect(mission.graph_ref).toBe("m-1:graph");
		expect(mission.vehicles).toEqual(["robot-es"]);
		expect(mission.graph_compiles).toBe(true);
		expect(mission.operator_notes).toBe("keep me"); // stored fields survive
		expect(isMissionGraphDirty("m-1")).toBe(false);
		expect(isMissionDraftDirty("m-1")).toBe(false);
	});

	it("loads the draft itself when no panel has, e.g. only the graph editor is open", async () => {
		setMissionGraph("m-1", graph());
		const { calls } = store();
		expect(getMissionDraft("m-1")).toBeNull();
		expect((await saveMissionWithGraph("m-1", calls)).ok).toBe(true);
		expect(getMissionDraft("m-1")?.name).toBe("Alpha");
	});

	it("writes no mission when the graph fails, and says nothing was written", async () => {
		setMissionGraph("m-1", graph());
		const { calls, written } = store({ graphFails: true });
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.stage).toBe("graph");
			expect(result.error).toContain("Nothing was written");
		}
		expect(written).toHaveLength(0);
	});

	it("says the graph was saved when the mission then fails", async () => {
		setMissionGraph("m-1", graph());
		const { calls } = store({ missionFails: true });
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.stage).toBe("mission");
			expect(result.graphSaved).toBe(true);
			expect(result.error).toContain("graph was saved");
		}
	});

	it("keeps an edit made while the save was in flight, and reports it", async () => {
		setMissionGraph("m-1", graph());
		const { calls } = store();
		const slowSave: MissionSaveCalls = {
			list: calls.list,
			save: async (doc) => {
				if (doc.mission_id === "m-1") {
					editMissionDraft("m-1", (d) => ({ ...d, name: "Bravo" }));
				}
				return calls.save(doc);
			},
		};
		const result = await saveMissionWithGraph("m-1", slowSave);
		expect(result.ok && result.keptDirty).toBe(true);
		expect(isMissionDraftDirty("m-1")).toBe(true);
		expect(getMissionDraft("m-1")?.name).toBe("Bravo");
	});

	it("compiles against the mission's assets, like the editor: a sweep of a waypoint does not compile", async () => {
		const sweep = graph();
		sweep.nodes[1] = { ...sweep.nodes[1]!, action: "COVERAGE" };
		setMissionGraph("m-1", sweep);
		setMissionAssets("m-1", assets("waypoint"), true);
		const { calls, written } = store();
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(true);
		expect((written[1] as Record<string, unknown>).graph_compiles).toBe(
			false,
		);
	});

	it("a target that is not one of the mission's assets does not compile", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", { map: "RMA", features: [] }, true);
		const { calls, written } = store();
		await saveMissionWithGraph("m-1", calls);
		expect((written[1] as Record<string, unknown>).graph_compiles).toBe(
			false,
		);
	});

	it("writes the map and assets first when they are not stored yet, then the graph and the mission", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), false);
		const { calls, written } = store();
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok && result.assetsSaved).toBe(true);
		expect(written.map((d) => d.mission_id)).toEqual([
			"m-1:assets",
			"m-1:graph",
			"m-1",
		]);
		expect(written[0]).toMatchObject({ map: "RMA", mission_ref: "m-1" });
		expect(isMissionAssetsStored("m-1")).toBe(true);
		expect((written[2] as Record<string, unknown>).graph_compiles).toBe(
			true,
		);
	});

	it("does not rewrite stored, unedited assets; writes edited ones", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), true);
		const first = store();
		await saveMissionWithGraph("m-1", first.calls);
		expect(
			first.written.some((d) => String(d.mission_id).endsWith(":assets")),
		).toBe(false);

		editMissionAssets("m-1", (a) =>
			upsertAsset(a, {
				...a.features[0]!,
				properties: { ...a.features[0]!.properties, name: "Hold 2" },
			}),
		);
		const second = store();
		await saveMissionWithGraph("m-1", second.calls);
		expect(second.written[0]!.mission_id).toBe("m-1:assets");
		expect(isMissionAssetsDirty("m-1")).toBe(false);
	});

	it("a save from the map alone re-derives graph_compiles from the stored graph", async () => {
		// Only the map is open: the graph is not loaded here. A target removed
		// from the assets must not leave the mission saying it compiles.
		setMissionAssets("m-1", { map: "RMA", features: [] }, true);
		editMissionAssets("m-1", (a) => ({ ...a, features: [] as never[] }));
		const written: Record<string, unknown>[] = [];
		const result = await saveMissionWithGraph("m-1", {
			list: async () => ({
				success: true,
				data: [
					{
						...MISSION,
						graph_ref: "m-1:graph",
						graph_compiles: true,
					},
					{ mission_id: "m-1:graph", graph: graph() },
				],
			}),
			save: async (doc) => {
				written.push(doc);
				return { success: true };
			},
		});
		expect(result.ok).toBe(true);
		const mission = written.find((d) => d.mission_id === "m-1");
		expect(mission?.graph_compiles).toBe(false);
		// The stored graph was only read, not rewritten.
		expect(written.some((d) => d.mission_id === "m-1:graph")).toBe(false);
	});

	it("refuses assets that are on no map, and writes nothing", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", { ...assets(), map: "" }, false);
		editMissionAssets("m-1", (a) => ({ ...a }));
		const { calls, written } = store();
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.stage).toBe("assets");
		expect(written).toEqual([]);
	});

	it("writes nothing else when the assets fail, and says so", async () => {
		setMissionGraph("m-1", graph());
		setMissionAssets("m-1", assets(), false);
		const { calls, written } = store({ assetsFail: true });
		const result = await saveMissionWithGraph("m-1", calls);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.stage).toBe("assets");
		expect(written).toEqual([]);
		expect(isMissionAssetsStored("m-1")).toBe(false);
	});

	it("does not save an empty canvas as the mission's graph", async () => {
		setMissionGraph("m-1", { version: 3, nodes: [], edges: [] });
		const { calls, written } = store();
		await saveMissionWithGraph("m-1", calls);
		// (The mission itself is refused: it has no vehicles yet.)
		expect(
			written.some((d) => String(d.mission_id).endsWith(":graph")),
		).toBe(false);
		expect(
			(getMissionDraft("m-1") as unknown as Record<string, unknown>)
				.graph_ref,
		).toBeUndefined();
	});

	it("marks a written graph saved even when the mission then fails", async () => {
		setMissionGraph("m-1", graph());
		editMissionGraph("m-1", (g) => ({ ...g }));
		const { calls } = store({ missionFails: true });
		await saveMissionWithGraph("m-1", calls);
		expect(isMissionGraphDirty("m-1")).toBe(false);
	});

	it("refuses a mission that is not in the store", async () => {
		const result = await saveMissionWithGraph("m-404", store().calls);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.stage).toBe("load");
	});
});

describe("summarizeMissionSave (what Submit says it will write)", () => {
	/** A stored mission, as `c2.missions.list` hands it back. */
	function stored(overrides: Partial<MissionConfig> = {}): MissionConfig {
		return {
			mission_id: "m-1",
			name: "Alpha",
			behavior: MissionBehavior.NAVIGATE,
			objective: { geometries: [] },
			vehicles: [],
			...overrides,
		} as MissionConfig;
	}

	/** The draft, defaulting to the stored shape so a test states its own diff. */
	function draft(overrides: Partial<MissionDraft> = {}): MissionDraft {
		return { ...stored(), ...overrides } as MissionDraft;
	}

	/** Nothing loaded, nothing dirty. */
	const nothing = {
		draft: null,
		draftDirty: false,
		stored: null,
		graph: null,
		graphDirty: false,
		graphLinked: false,
		assets: null,
		assetsDirty: false,
		assetsStored: false,
	};

	/** A geometry, for counting objectives. */
	const geometry = () => ({
		geometry: { geometry_type: "Point", coordinates: [[4.39, 50.84]] },
	});

	it("says nothing when a save would write nothing", () => {
		// Submit skips the dialog entirely on this answer: an operator asked to
		// confirm an empty list learns only that the dashboard is noisy.
		expect(summarizeMissionSave(nothing)).toEqual([]);
	});

	it("names the fields that moved, with their before and after", () => {
		const out = summarizeMissionSave({
			...nothing,
			draft: draft({
				vehicles: ["a", "b", "c"],
				objective: { geometries: [geometry(), geometry()] },
				behavior: MissionBehavior.COVERAGE,
			}),
			draftDirty: true,
			stored: stored({ vehicles: ["a", "b"] }),
		});
		expect(out).toEqual([
			{ label: "Vehicles", detail: "2 → 3" },
			{ label: "Objectives", detail: "0 → 2" },
			{ label: "Behaviour", detail: "Navigate → Cover" },
		]);
	});

	it("names a rename, which is the change an operator most often forgot", () => {
		const out = summarizeMissionSave({
			...nothing,
			draft: draft({ name: "Alpha (recon)" }),
			draftDirty: true,
			stored: stored(),
		});
		expect(out).toEqual([
			{ label: "Mission name", detail: '"Alpha" → "Alpha (recon)"' },
		]);
	});

	it("still says something when the change is one it cannot name", () => {
		// A dragged objective vertex moves no count and no enum. Saying nothing
		// would let the operator confirm a write the dialog never mentioned.
		const out = summarizeMissionSave({
			...nothing,
			draft: draft({ objective: { geometries: [geometry()] } }),
			draftDirty: true,
			stored: stored({ objective: { geometries: [geometry()] } }),
		});
		expect(out).toEqual([{ label: "Mission", detail: "settings changed" }]);
	});

	it("states the payload, not a difference, for a mission not in the store", () => {
		// Inventing a before value for a mission being saved for the first time
		// would be a fabricated diff.
		const out = summarizeMissionSave({
			...nothing,
			draft: draft({
				vehicles: ["a"],
				objective: { geometries: [geometry(), geometry()] },
			}),
			draftDirty: true,
			stored: null,
		});
		expect(out).toEqual([
			{ label: "Mission", detail: "new: 1 vehicle, 2 objectives" },
		]);
	});

	it("counts in the singular where there is one of something", () => {
		const out = summarizeMissionSave({
			...nothing,
			draft: draft({
				vehicles: ["a"],
				objective: { geometries: [geometry()] },
			}),
			draftDirty: true,
			stored: null,
		});
		expect(out[0]!.detail).toContain("1 vehicle,");
		expect(out[0]!.detail).toContain("1 objective");
	});

	it("says nothing about a mission whose draft is clean", () => {
		// The draft is loaded and differs from the store (another console saved
		// over it), but this operator has edited nothing: a save writes the
		// mission back unchanged, so there is nothing of theirs to confirm.
		expect(
			summarizeMissionSave({
				...nothing,
				draft: draft({ vehicles: ["a", "b", "c"] }),
				draftDirty: false,
				stored: stored(),
			}),
		).toEqual([]);
	});

	it("lists the documents in the order the save writes them", () => {
		// Assets exist before the graph names them, and the graph before the
		// mission points at it. The list reads as the sequence it describes.
		const out = summarizeMissionSave({
			draft: draft({ name: "Bravo" }),
			draftDirty: true,
			stored: stored(),
			graph: graph(),
			graphDirty: true,
			graphLinked: true,
			assets: { map: "RMA", features: [] } as MissionAssets,
			assetsDirty: true,
			assetsStored: true,
		});
		expect(out.map((c) => c.label)).toEqual([
			"Map & assets",
			"Behaviour graph",
			"Mission name",
		]);
		expect(out[0]!.detail).toBe('0 assets on "RMA"');
		expect(out[1]!.detail).toBe("3 nodes, 2 links");
	});

	it("does not promise a write the save will not make", () => {
		// The preview and the save read ONE predicate each. An empty canvas on
		// a mission that points at no graph is not a graph to save, and unstored
		// assets with no map and nothing in them are not a document.
		expect(
			summarizeMissionSave({
				...nothing,
				graph: { version: 3, nodes: [], edges: [] },
				graphDirty: true,
				graphLinked: false,
				assets: { map: "", features: [] } as MissionAssets,
				assetsDirty: false,
				assetsStored: false,
			}),
		).toEqual([]);
	});

	it("promises the writes a first save makes without an edit", () => {
		// A mission opened before it had either: nothing is dirty, and the save
		// writes both because neither document exists yet.
		const out = summarizeMissionSave({
			...nothing,
			graph: graph(),
			graphDirty: false,
			graphLinked: false,
			assets: { map: "RMA", features: [] } as MissionAssets,
			assetsDirty: false,
			assetsStored: false,
		});
		expect(out.map((c) => c.label)).toEqual([
			"Map & assets",
			"Behaviour graph",
		]);
	});
});
