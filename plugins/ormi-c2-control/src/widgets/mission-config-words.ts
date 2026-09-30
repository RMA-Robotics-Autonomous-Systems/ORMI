/**
 * Operator words for the mission config's backend field paths.
 *
 * THE DEFECT THIS REMOVES — `validateMissionConfig` carries a dotted JSON path
 * on every issue (`vehicles`, `objective.geometries`, `start.geometry`), and the
 * readiness panels render it verbatim, in monospace, in front of the message:
 *
 * ```
 * ⊗ vehicles — At least one vehicle must be assigned to the mission.
 * ⊗ objective.geometries — objective.geometries must contain at least one geometry.
 * ```
 *
 * A dotted path in a fixed-width face is a developer artefact. It is exact and
 * it is the right thing to print in a bug report; in front of an operator it is
 * a second vocabulary they have to learn in order to read a sentence that was
 * already in plain English — and the second line above is worse, because the
 * path is printed twice, once as chrome and once inside the sentence.
 *
 * THE RULE — the path is translated where one is known, and is otherwise left
 * exactly as it is. Translating is a lookup against a table of the paths an
 * operator actually meets; there is deliberately no heuristic that prettifies an
 * arbitrary path (`transit.desired_vehicle_constraints.max_speed` becomes
 * "Transit desired vehicle constraints max speed", which is longer, no clearer,
 * and no longer greppable). An unknown path stays raw: losing the only handle a
 * support conversation has is worse than showing one.
 *
 * Pure data + pure functions — no React, no store, so both the panel and any
 * other readiness surface can share one vocabulary.
 */

import { MissionBehavior } from "../types/c2-types";
import type { MissionConfigIssue } from "../types/mission-config-validation";

/**
 * Backend path → the words an operator reads.
 *
 * Kept to the paths a mission that is being authored actually trips: the four
 * fields the graph editor derives, the objective block, and the optional start
 * block the map can write. The deeper `transit.*` constraint paths are omitted
 * on purpose — nothing in this build authors them, so an issue there is a
 * hand-edited or upstream config and the raw path is the useful thing to show.
 */
const FIELD_WORDS: Readonly<Record<string, string>> = {
	name: "Mission name",
	mission_id: "Mission id",
	behavior: "Behaviour",
	vehicles: "Vehicles",
	objective: "Objective",
	"objective.geometries": "Objectives",
	"objective.line_of_sight": "Line of sight",
	start: "Start",
	"start.geometry": "Start point",
	"start.time": "Start time",
	transit: "Transit",
};

/** `objective.geometries[3]`, and anything hanging off one. */
const GEOMETRY_INDEX = /^objective\.geometries\[(\d+)\](?:\.(.+))?$/;

/** Words for the tail of an indexed objective path, when it is one we know. */
const GEOMETRY_TAIL_WORDS: Readonly<Record<string, string>> = {
	geometry: "geometry",
	feature_id: "map feature",
	"geometry.coordinates": "coordinates",
	"geometry.geometry_type": "shape",
};

/**
 * The operator-facing name of a mission-config field path.
 *
 * @param path - The dotted JSON path an issue carries.
 * @returns The words to show, or null when this path has none (show it raw).
 */
export function missionFieldLabel(path: string): string | null {
	const known = FIELD_WORDS[path];
	if (known) return known;

	const indexed = GEOMETRY_INDEX.exec(path);
	if (indexed) {
		// 1-based: the operator counts objectives from one, and the index is
		// never used to address anything, only to say which one.
		const which = `Objective ${Number(indexed[1]) + 1}`;
		const tail = indexed[2];
		if (!tail) return which;
		const tailWords = GEOMETRY_TAIL_WORDS[tail];
		return tailWords ? `${which} ${tailWords}` : which;
	}

	return null;
}

/**
 * Rewrite the raw paths a validation message repeats inside its own prose.
 *
 * `"objective.geometries must contain at least one geometry."` is the message
 * for the path `objective.geometries`, so a caller that has already printed the
 * label would print the path twice. The leading repetition is dropped, and any
 * remaining known path inside the sentence is swapped for its words.
 *
 * Longest path first, so `objective.geometries` is not half-replaced by
 * `objective`.
 *
 * @param message - The validator's message.
 * @param path - The issue's path.
 * @returns The message with its raw paths in operator words.
 */
function rewriteMessage(message: string, path: string): string {
	let text = message;
	if (text.startsWith(`${path} `)) text = text.slice(path.length + 1);
	for (const raw of Object.keys(FIELD_WORDS).sort(
		(a, b) => b.length - a.length,
	)) {
		if (!text.includes(raw)) continue;
		const words = FIELD_WORDS[raw]!;
		// Lower-cased mid-sentence: these are nouns, not proper names, and
		// "must contain at least one Objectives" reads as a bug.
		text = text.split(raw).join(words.toLowerCase());
	}
	return text;
}

/**
 * Put a list of mission-config issues into operator words.
 *
 * An issue whose path is known loses its `path` (so the renderer prints no
 * monospace chrome) and gains the label at the head of its message instead.
 * An issue whose path is unknown is returned untouched — see the module note.
 *
 * @param issues - Issues from `validateMissionConfig`.
 * @returns A new list; the input is not modified.
 */
export function humanizeMissionIssues(
	issues: readonly MissionConfigIssue[],
): MissionConfigIssue[] {
	return issues.map((issue) => {
		const label = missionFieldLabel(issue.path);
		if (!label) return issue;
		return {
			...issue,
			path: "",
			message: `${label}: ${rewriteMessage(issue.message, issue.path)}`,
		};
	});
}

/** `MissionBehavior` → the word the operator reads. */
const BEHAVIOUR_WORDS: Readonly<Record<number, string>> = {
	[MissionBehavior.NAVIGATE]: "Navigate",
	[MissionBehavior.COVERAGE]: "Cover",
	[MissionBehavior.NAVIGATE_NO_PLANNING]: "Navigate (no planning)",
};

/**
 * The operator-facing word for a mission behaviour.
 *
 * An unrecognised value keeps its number rather than resolving to a plausible
 * wrong word: the behaviour is derived from the graph, and a value this build
 * does not know is a fact worth showing.
 *
 * @param behavior - The `MissionConfig.behavior` value.
 * @returns The word to show.
 */
export function missionBehaviourWord(behavior: unknown): string {
	if (typeof behavior !== "number") return "unset";
	return BEHAVIOUR_WORDS[behavior] ?? `behaviour ${behavior}`;
}
