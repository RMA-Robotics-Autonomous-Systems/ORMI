import {
	commitSavedDraft,
	editMissionDraft,
	getMissionDraft,
	setMissionDraft,
} from "./mission-draft-store";
import {
	commitSavedGraph,
	getMissionGraph,
	hasMissionGraph,
	isMissionGraphDirty,
	missionGraphSignature,
	setMissionGraph,
} from "./mission-graph-store";
import {
	type MissionConfigIssue,
	validateMissionConfig,
} from "../types/mission-config-validation";
import type { MissionConfig } from "../types/c2-types";
import {
	buildGraphDocument,
	compileMissionGraph,
	graphDocId,
	type MissionGraph,
	readGraphDocument,
} from "../widgets/mission-graph";
import { resolveGraphDraftWrite } from "../widgets/mission-graph-editor-helpers";
import {
	cleanMissionConfig,
	hydrateMissionDraft,
	mergeStoredMission,
	type MissionDraft,
	missionDraftSignature,
} from "../widgets/mission-editor-helpers";
import { missionDocuments, normalizeMissions } from "../widgets/mission-list";
import {
	assetFeatureTypes,
	buildAssetsDocument,
	type MissionAssets,
} from "../widgets/mission-assets";
import { missionBehaviourWord } from "../widgets/mission-config-words";
import { getActiveMap } from "./selection-store";
import {
	adoptStoredAssets,
	commitSavedAssets,
	getMissionAssets,
	isMissionAssetsDirty,
	isMissionAssetsStored,
	missionAssetsSignature,
} from "./mission-assets-store";

/**
 * ONE "Save mission": the mission, its map and assets, and its behaviour graph,
 * from wherever the operator presses it (the map, the graph editor, Submit).
 *
 * They used to be two buttons in two panels, and the gap between them was not
 * cosmetic: the fog runs the SAVED graph (`"<mission_id>:graph"`), Submit sent
 * the live draft, so a graph edited and not saved was submitted as one thing
 * and run as another, with nothing on screen saying so.
 *
 * Order, because `:5000` has no transaction:
 *   0. the map and assets document (`"<mission_id>:assets"`), so the graph's
 *      targets exist before anything names them;
 *   1. the graph document, so the mission's `graph_ref` never points at
 *      nothing;
 *   2. the mission, with the allocation re-derived from the graph just
 *      written (vehicles, objective.geometries, behavior, graph_compiles) and
 *      `graph_ref` set — the saved mission always describes the saved graph;
 *   3. every slot marked clean, each only if nothing was edited while the
 *      writes were in flight (a newer edit stays dirty and is reported).
 * A failure at 2 leaves a saved graph and an unsaved mission, and says so.
 *
 * A mission is a map, its assets and a graph: the assets are the mission's,
 * not the map's (roads, risks and geofences are the map's, saved as each edit
 * is confirmed).
 */

/** The two C2 calls the save needs, bound by the calling widget. */
export interface MissionSaveCalls {
	/** `c2.missions.list` — the stored rows, to merge the draft onto. */
	list: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
	/** `c2.missions.save` — POST one document to C2DB `missions`. */
	save: (
		doc: Record<string, unknown>,
	) => Promise<{ success: boolean; error?: string }>;
}

export type MissionSaveResult =
	| {
			ok: true;
			/** The graph document was written by this save. */
			graphSaved: boolean;
			/** The assets document was written by this save. */
			assetsSaved: boolean;
			/** An edit made during the save was kept, and is still unsaved. */
			keptDirty: boolean;
			/** The saved mission, as written. */
			mission: MissionConfig;
	  }
	| {
			ok: false;
			/** Where it stopped; the steps before it did happen. */
			stage: "load" | "assets" | "graph" | "validate" | "mission";
			error: string;
			graphSaved: boolean;
			issues?: MissionConfigIssue[];
	  };

/**
 * Whether a graph is the AUTHOR of its mission's allocation.
 *
 * An empty canvas beside a mission that does not point at a graph yet is a
 * mission nobody has authored a behaviour for — not a mission authored as
 * nothing — so it neither writes a document nor rewrites the mission's fields.
 * Once the mission does point at it, every later state is authoritative,
 * deleting the last node included.
 *
 * @param graph - The working graph, or null when none is loaded.
 * @param linked - Whether the draft's `graph_ref` already names this graph.
 * @returns True when the graph speaks for the mission.
 */
export function graphAuthorsMission(
	graph: Pick<MissionGraph, "nodes"> | null | undefined,
	linked: boolean,
): boolean {
	if (!graph) return false;
	return !(graph.nodes.length === 0 && !linked);
}

/**
 * Whether a save would WRITE the graph document.
 *
 * Exported because the Submit confirmation previews what the save will write,
 * and a preview derived from a second copy of this rule is a preview that can
 * promise a write that does not happen (or stay silent about one that does).
 * One predicate, two readers.
 *
 * @param graph - The working graph, or null.
 * @param dirty - Whether it has unsaved edits.
 * @param linked - Whether the draft's `graph_ref` already names it.
 * @returns True when the document is written.
 */
export function willWriteGraph(
	graph: Pick<MissionGraph, "nodes"> | null | undefined,
	dirty: boolean,
	linked: boolean,
): boolean {
	return graphAuthorsMission(graph, linked) && (dirty || !linked);
}

/**
 * Whether a save would WRITE the map-and-assets document.
 *
 * Same contract as {@link willWriteGraph}: the save and the Submit preview read
 * this one rule. An unstored set with no map and nothing in it says nothing, so
 * it is not written.
 *
 * @param assets - The working assets, or null.
 * @param dirty - Whether they have unsaved edits.
 * @param stored - Whether the document already exists in C2DB.
 * @returns True when the document is written.
 */
export function willWriteAssets(
	assets: MissionAssets | null | undefined,
	dirty: boolean,
	stored: boolean,
): boolean {
	if (!assets) return false;
	return (
		dirty || (!stored && (assets.map !== "" || assets.features.length > 0))
	);
}

/**
 * Save a mission and its graph.
 *
 * @param missionId - The mission.
 * @param calls - The C2 list and save calls.
 * @returns What was written, or where and why it stopped.
 */
export async function saveMissionWithGraph(
	missionId: string,
	calls: MissionSaveCalls,
): Promise<MissionSaveResult> {
	const listed = await calls.list();
	if (!listed.success) {
		return {
			ok: false,
			stage: "load",
			error: `Could not read missions from the C2: ${listed.error ?? "the request failed"}. Nothing was written.`,
			graphSaved: false,
		};
	}
	const stored = normalizeMissions(listed.data).find(
		(row) => row.mission_id === missionId,
	)?.raw as MissionConfig | undefined;
	if (!stored) {
		return {
			ok: false,
			stage: "load",
			error: "This mission is not saved on the C2. Nothing was written.",
			graphSaved: false,
		};
	}
	// No panel has loaded the draft (e.g. only the graph editor is open): the
	// stored mission IS the draft.
	if (!getMissionDraft(missionId)) {
		setMissionDraft(hydrateMissionDraft(stored));
	}

	// 0. The map and assets. Not loaded by any panel (Submit from the control
	//    panel alone): read them off the same list, a mission without any
	//    placed on the map shown. Written whenever they are dirty, or not
	//    stored yet (a mission opened before it had any).
	if (!getMissionAssets(missionId)) {
		adoptStoredAssets(missionId, listed.data, getActiveMap() ?? "");
	}
	const assets = getMissionAssets(missionId);
	let assetsSaved = false;
	let assetsOutcome: ReturnType<typeof commitSavedAssets> = "committed";
	// The Submit confirmation previews this same decision — one predicate.
	const worthWriting = willWriteAssets(
		assets,
		isMissionAssetsDirty(missionId),
		isMissionAssetsStored(missionId),
	);
	if (assets && worthWriting) {
		if (assets.map === "" && assets.features.length > 0) {
			return {
				ok: false,
				stage: "assets",
				error: "This mission's assets are on no map. Open it on the mission map, then save again. Nothing was written.",
				graphSaved: false,
			};
		}
		const assetsSignature = missionAssetsSignature(assets);
		const written = await calls.save(
			buildAssetsDocument(missionId, assets) as unknown as Record<
				string,
				unknown
			>,
		);
		if (!written.success) {
			return {
				ok: false,
				stage: "assets",
				error: `The map and assets were not saved: ${written.error ?? "the request failed"}. Nothing was written.`,
				graphSaved: false,
			};
		}
		assetsSaved = true;
		assetsOutcome = commitSavedAssets(missionId, assetsSignature);
	}

	// 1. The graph. Not loaded by any panel (a save from the map alone): its
	//    stored document is read off the same list, so the mission's
	//    graph_compiles is re-derived against the assets just written rather
	//    than left as it was. Written whenever it is dirty, or the mission
	//    does not point at it yet.
	if (!hasMissionGraph(missionId)) {
		const storedGraph = readGraphDocument(
			missionDocuments(listed.data).find(
				(doc) => doc.mission_id === graphDocId(missionId),
			),
		);
		if (storedGraph) setMissionGraph(missionId, storedGraph);
	}
	const graph = getMissionGraph(missionId);
	const ref = graphDocId(missionId);
	let graphSaved = false;
	let graphOutcome: ReturnType<typeof commitSavedGraph> = "committed";
	const pointsAtIt =
		(getMissionDraft(missionId) as Record<string, unknown> | null)
			?.graph_ref === ref;
	// An empty canvas on a mission that has no graph is not a graph to save:
	// writing it would turn "no saved graph" into "the graph has errors".
	if (graph && graphAuthorsMission(graph, pointsAtIt)) {
		if (willWriteGraph(graph, isMissionGraphDirty(missionId), pointsAtIt)) {
			const graphSignature = missionGraphSignature(graph);
			const written = await calls.save(
				buildGraphDocument(missionId, graph) as unknown as Record<
					string,
					unknown
				>,
			);
			if (!written.success) {
				return {
					ok: false,
					stage: "graph",
					error: `The graph was not saved: ${written.error ?? "the request failed"}.${assetsSaved ? " The map and assets were." : " Nothing was written."}`,
					graphSaved: false,
				};
			}
			graphSaved = true;
			// On disk now, whatever happens to the mission below.
			graphOutcome = commitSavedGraph(missionId, graphSignature);
		}
		// 2a. The mission describes the graph just written, compiled with the
		//     same inputs as the editor's: the mission's own assets. When they
		//     are not loaded here, a target error cannot be seen, so a `false`
		//     the editor derived WITH them is kept rather than overturned.
		const featureTypes = assets ? assetFeatureTypes(assets) : undefined;
		const typesKnown = featureTypes !== undefined;
		const derived = resolveGraphDraftWrite(
			graph,
			compileMissionGraph(graph, featureTypes),
			getMissionDraft(missionId),
		);
		const draftCompiles = (
			getMissionDraft(missionId) as Record<string, unknown> | null
		)?.graph_compiles;
		const slice =
			derived && !typesKnown && draftCompiles === false
				? { ...derived, graph_compiles: false }
				: derived;
		const draftNow = getMissionDraft(missionId) as Record<
			string,
			unknown
		> | null;
		if (slice || draftNow?.graph_ref !== ref) {
			editMissionDraft(
				missionId,
				(current) =>
					({
						...current,
						graph_ref: ref,
						...(slice
							? {
									vehicles: slice.vehicles,
									behavior: slice.behavior,
									graph_compiles: slice.graph_compiles,
									objective: {
										...current.objective,
										geometries: slice.geometries,
									},
								}
							: {}),
					}) as typeof current,
			);
		}
	}

	// 2b. The mission: the stored document is the base and the draft is
	//     layered on it, so fields this build has no UI for survive.
	const current = getMissionDraft(missionId);
	if (!current) {
		return {
			ok: false,
			stage: "load",
			error: "The mission closed during the save. Save again.",
			graphSaved,
		};
	}
	const merged = cleanMissionConfig(
		hydrateMissionDraft(mergeStoredMission(stored, current)),
	);
	const issues = validateMissionConfig(merged);
	if (issues.some((issue) => issue.severity === "error")) {
		return {
			ok: false,
			stage: "validate",
			error: graphSaved
				? "The graph was saved, but the mission was not: it has errors. Fix them and save again."
				: "The mission has errors. Fix them and save again.",
			graphSaved,
			issues,
		};
	}
	const written = await calls.save(
		merged as unknown as Record<string, unknown>,
	);
	if (!written.success) {
		return {
			ok: false,
			stage: "mission",
			error: graphSaved
				? `The graph was saved, but the mission was not: ${written.error ?? "the request failed"}.`
				: `The mission was not saved: ${written.error ?? "the request failed"}.`,
			graphSaved,
		};
	}

	// 3. Clean, unless an edit landed meanwhile.
	const readSignature = missionDraftSignature(current);
	const draftOutcome = commitSavedDraft(
		missionId,
		merged,
		(draft) => missionDraftSignature(draft) === readSignature,
	);
	return {
		ok: true,
		graphSaved,
		assetsSaved,
		keptDirty:
			draftOutcome === "kept-dirty" ||
			graphOutcome === "kept-dirty" ||
			assetsOutcome === "kept-dirty",
		mission: merged,
	};
}

// ============================================================================
// What a save will write — the Submit confirmation's preview
// ============================================================================

/**
 * One line of the "what this will save" preview.
 *
 * Two fields rather than a sentence so the dialog can align them, and so the
 * words are decided here (pure, tested) rather than assembled in JSX.
 */
export interface SaveChange {
	/** What changes, in operator words ("Vehicles", "Behaviour graph"). */
	label: string;
	/** How it changes — "2 → 3", "settings changed", "3 on \"RMA\"". */
	detail: string;
}

/** Everything {@link summarizeMissionSave} reads. All of it is already loaded. */
export interface MissionSaveSummaryInput {
	/** The operator's working draft, or null when no panel has loaded one. */
	draft: MissionDraft | null;
	/** Whether the draft has unsaved edits. */
	draftDirty: boolean;
	/**
	 * The stored mission as `c2.missions.list` returned it, or null when the
	 * store does not hold it (a mission saved for the first time).
	 */
	stored: MissionConfig | null;
	/** The working behaviour graph, or null when none is loaded. */
	graph: MissionGraph | null;
	/** Whether the graph has unsaved edits. */
	graphDirty: boolean;
	/** Whether the draft's `graph_ref` already names this mission's graph. */
	graphLinked: boolean;
	/** The working map and assets, or null when none are loaded. */
	assets: MissionAssets | null;
	/** Whether the assets have unsaved edits. */
	assetsDirty: boolean;
	/** Whether the assets document already exists in C2DB. */
	assetsStored: boolean;
}

/** "1 vehicle" / "3 vehicles", so a preview never reads "1 vehicles". */
function count(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** How many objective geometries a config carries. */
function objectiveCount(config: MissionConfig | null): number {
	const geometries = config?.objective?.geometries;
	return Array.isArray(geometries) ? geometries.length : 0;
}

/** How many vehicles a config allocates. */
function vehicleCount(config: MissionConfig | null): number {
	return Array.isArray(config?.vehicles) ? config.vehicles.length : 0;
}

/**
 * What a Save (and therefore a Submit that saves first) will write, in words.
 *
 * WHY THIS EXISTS — Submit saves the mission, its graph and its assets as a side
 * effect before it sends. The graph editor stays editable while a mission runs,
 * so a stray edit made an hour ago becomes the submitted plan in one click, and
 * the only thing on screen was a banner saying edits existed. Naming them before
 * the send is the difference between confirming a command and confirming a
 * command plus an unknown document write.
 *
 * WHAT IT COMPARES — the working draft against the stored mission. The graph
 * editor writes its derived slice (vehicles, behaviour, objectives) into the
 * draft as the operator edits, so with the editor open the draft already carries
 * what the save will re-derive. When it has not been open the save derives the
 * same slice itself from the same graph, so the only way these disagree is a
 * mission whose stored fields were authored by an older graph — which is exactly
 * a change worth showing, just possibly understated by a line or two.
 *
 * With no stored mission to compare against, the lines state the payload rather
 * than a difference: "new — 2 vehicles, 3 objectives" is honest, where inventing
 * a before value would not be.
 *
 * @param input - {@link MissionSaveSummaryInput}.
 * @returns The lines to show, in writing order (assets, graph, mission). Empty
 * when the save would write nothing.
 */
export function summarizeMissionSave(
	input: MissionSaveSummaryInput,
): SaveChange[] {
	const changes: SaveChange[] = [];

	// Writing order, so the list reads as the sequence it describes: the assets
	// exist before the graph names them, and the graph before the mission
	// points at it.
	if (willWriteAssets(input.assets, input.assetsDirty, input.assetsStored)) {
		const assets = input.assets!;
		const n = count(assets.features.length, "asset");
		changes.push({
			label: "Map & assets",
			detail: assets.map ? `${n} on "${assets.map}"` : n,
		});
	}

	if (willWriteGraph(input.graph, input.graphDirty, input.graphLinked)) {
		const graph = input.graph!;
		changes.push({
			label: "Behaviour graph",
			detail: `${count(graph.nodes.length, "node")}, ${count(
				graph.edges.length,
				"link",
			)}`,
		});
	}

	const { draft, stored } = input;
	if (!draft || !input.draftDirty) return changes;

	if (!stored) {
		changes.push({
			label: "Mission",
			detail: `new: ${count(vehicleCount(draft), "vehicle")}, ${count(
				objectiveCount(draft),
				"objective",
			)}`,
		});
		return changes;
	}

	const before = changes.length;
	if ((stored.name ?? "") !== (draft.name ?? "")) {
		changes.push({
			label: "Mission name",
			detail: `"${stored.name ?? ""}" → "${draft.name}"`,
		});
	}
	const vehiclesBefore = vehicleCount(stored);
	const vehiclesAfter = vehicleCount(draft);
	if (vehiclesBefore !== vehiclesAfter) {
		changes.push({
			label: "Vehicles",
			detail: `${vehiclesBefore} → ${vehiclesAfter}`,
		});
	}
	const objectivesBefore = objectiveCount(stored);
	const objectivesAfter = objectiveCount(draft);
	if (objectivesBefore !== objectivesAfter) {
		changes.push({
			label: "Objectives",
			detail: `${objectivesBefore} → ${objectivesAfter}`,
		});
	}
	if (stored.behavior !== draft.behavior) {
		changes.push({
			label: "Behaviour",
			detail: `${missionBehaviourWord(stored.behavior)} → ${missionBehaviourWord(
				draft.behavior,
			)}`,
		});
	}
	// Dirty, but none of the fields this preview can name moved — an objective's
	// geometry was dragged, a transit constraint was typed. Saying "changed"
	// without a number is the honest answer; saying nothing would let the
	// operator confirm a write the dialog never mentioned.
	if (changes.length === before) {
		changes.push({ label: "Mission", detail: "settings changed" });
	}

	return changes;
}
