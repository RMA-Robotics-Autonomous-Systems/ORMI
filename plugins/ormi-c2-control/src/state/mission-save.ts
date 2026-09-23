import {
	commitSavedDraft,
	editMissionDraft,
	getMissionDraft,
	setMissionDraft,
} from "./mission-draft-store";
import {
	commitSavedGraph,
	getMissionGraph,
	isMissionGraphDirty,
	missionGraphSignature,
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
} from "../widgets/mission-graph";
import { resolveGraphDraftWrite } from "../widgets/mission-graph-editor-helpers";
import {
	cleanMissionConfig,
	hydrateMissionDraft,
	mergeStoredMission,
	missionDraftSignature,
} from "../widgets/mission-editor-helpers";
import { normalizeMissions } from "../widgets/mission-list";
import { getMapFeatureTypes } from "./c2-catalog-store";
import { getActiveMap } from "./selection-store";

/**
 * ONE "Save mission": the mission and its behaviour graph, from wherever the
 * operator presses it (the map, the graph editor, Submit).
 *
 * They used to be two buttons in two panels, and the gap between them was not
 * cosmetic: the fog runs the SAVED graph (`"<mission_id>:graph"`), Submit sent
 * the live draft, so a graph edited and not saved was submitted as one thing
 * and run as another, with nothing on screen saying so.
 *
 * Order, because `:5000` has no transaction:
 *   1. the graph document, so the mission's `graph_ref` never points at
 *      nothing;
 *   2. the mission, with the allocation re-derived from the graph just
 *      written (vehicles, objective.geometries, behavior, graph_compiles) and
 *      `graph_ref` set — the saved mission always describes the saved graph;
 *   3. both slots marked clean, each only if nothing was edited while the
 *      writes were in flight (a newer edit stays dirty and is reported).
 * A failure at 2 leaves a saved graph and an unsaved mission, and says so.
 *
 * Map assets are NOT part of it: they belong to the map, which every mission
 * on it shares, and are saved as each edit is confirmed.
 */

/** The two C2 calls the save needs, bound by the calling widget. */
export interface MissionSaveCalls {
	/** `c2.missions.list` — the stored rows, to merge the draft onto. */
	list: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
	/** `c2.missions.save` — POST one document to C2DB `missions`. */
	save: (
		doc: Record<string, unknown>,
	) => Promise<{ success: boolean; error?: string }>;
	/**
	 * `feature_id → feature_type` of the map the graph's assets are on — the
	 * SAME input the graph editor compiles with. Without it a COVERAGE pointed
	 * at a waypoint compiles clean. Defaults to the shared active map's
	 * catalogue.
	 */
	featureTypes?: Readonly<Record<string, string>>;
}

export type MissionSaveResult =
	| {
			ok: true;
			/** The graph document was written by this save. */
			graphSaved: boolean;
			/** An edit made during the save was kept, and is still unsaved. */
			keptDirty: boolean;
			/** The saved mission, as written. */
			mission: MissionConfig;
	  }
	| {
			ok: false;
			/** Where it stopped; the steps before it did happen. */
			stage: "load" | "graph" | "validate" | "mission";
			error: string;
			graphSaved: boolean;
			issues?: MissionConfigIssue[];
	  };

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
			error: `Could not read the mission store: ${listed.error ?? "the request failed"}`,
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
			error: "This mission is not in the mission store.",
			graphSaved: false,
		};
	}
	// No panel has loaded the draft (e.g. only the graph editor is open): the
	// stored mission IS the draft.
	if (!getMissionDraft(missionId)) {
		setMissionDraft(hydrateMissionDraft(stored));
	}

	// 1. The graph, when one is loaded here. Written whenever it is dirty, or
	//    the mission does not point at it yet.
	const graph = getMissionGraph(missionId);
	const ref = graphDocId(missionId);
	let graphSaved = false;
	let graphOutcome: ReturnType<typeof commitSavedGraph> = "committed";
	const pointsAtIt =
		(getMissionDraft(missionId) as Record<string, unknown> | null)
			?.graph_ref === ref;
	// An empty canvas on a mission that has no graph is not a graph to save:
	// writing it would turn "no saved graph" into "the graph has errors".
	if (graph && !(graph.nodes.length === 0 && !pointsAtIt)) {
		if (isMissionGraphDirty(missionId) || !pointsAtIt) {
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
					error: `The graph was not saved: ${written.error ?? "the request failed"}. Nothing was written.`,
					graphSaved: false,
				};
			}
			graphSaved = true;
			// On disk now, whatever happens to the mission below.
			graphOutcome = commitSavedGraph(missionId, graphSignature);
		}
		// 2a. The mission describes the graph just written, compiled with the
		//     same inputs as the editor's. When no catalogue is known for the
		//     map, a feature-type error cannot be seen here, so a `false` the
		//     editor derived WITH the types is kept rather than overturned.
		const featureTypes =
			calls.featureTypes ?? getMapFeatureTypes(getActiveMap());
		const typesKnown = Object.keys(featureTypes).length > 0;
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
			error: "The mission draft disappeared while saving.",
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
				? "The graph was saved, but the mission has errors and was not — fix them and save again."
				: "The mission has errors — fix them and save again.",
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
		keptDirty:
			draftOutcome === "kept-dirty" || graphOutcome === "kept-dirty",
		mission: merged,
	};
}
