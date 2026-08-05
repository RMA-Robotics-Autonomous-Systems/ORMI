"use client";

/**
 * Shared planner-state ingest helpers for the C2 widgets.
 *
 * `/multi_robot/planner/state` is a SINGLE shared rosbridge topic
 * (`std_msgs/String`) carrying the planning state for ALL missions in each
 * message. The Mission Feedback widget (F10) subscribes to it through a local
 * datasource with a size-1 buffer, parses the latest message into a per-mission
 * state map, and publishes it into the per-mission planner-state store
 * (`state/planner-state-store.ts`) so each widget can READ ONLY its own
 * mission's planning state.
 *
 * This mirrors `mission-feedback-source.ts`: {@link latestPlannerState} parses
 * the buffer tail and {@link usePublishPlannerState} publishes it in an effect.
 */

import { useEffect, useRef } from "react";

import {
	PlannerStateMap,
	parsePlannerState,
	plannerStateSignature,
} from "../types/planner-state";
import { publishPlannerState } from "../state/planner-state-store";

/**
 * Pull the latest per-mission planner-state map out of the local-datasource
 * sources map.
 *
 * Each `std_msgs/String` message wraps the planner-state JSON in its `data`
 * field; {@link parsePlannerState} tolerates the wrapper, an already-parsed
 * object, and garbage (returning an empty map). The last source carrying a
 * non-empty map wins, so a garbage tail never blanks a good map.
 *
 * @param sources - The provider's per-topic buffered sources.
 * @returns The latest parsed per-mission state map (possibly empty).
 */
export function latestPlannerState(
	sources: Map<string, { data: unknown[] }>,
): PlannerStateMap {
	let latest: PlannerStateMap = {};
	for (const source of sources.values()) {
		const value = source.data[source.data.length - 1];
		if (value == null) continue;
		const candidate = parsePlannerState(value);
		if (Object.keys(candidate).length > 0) latest = candidate;
	}
	return latest;
}

/**
 * Parse the latest buffered planner-state message and publish it into the
 * per-mission planner-state store.
 *
 * Publishing happens in an effect (never in render — AGENTS.md forbids side
 * effects in render), keyed on the map's {@link plannerStateSignature} so we
 * only re-publish on a real content change. A ref hands the effect the current
 * parsed map without making it a dependency.
 *
 * @param sources - The provider's per-topic buffered sources.
 * @param enabled - When false (no planner-state topic configured), the hook
 *   parses nothing and publishes nothing — preserving the "no topic → no
 *   planner status" contract.
 */
export function usePublishPlannerState(
	sources: Map<string, { data: unknown[] }>,
	enabled: boolean,
): void {
	const latest = enabled ? latestPlannerState(sources) : {};
	const latestSig = plannerStateSignature(latest);
	const latestRef = useRef(latest);
	latestRef.current = latest;
	// Publish in an effect, not in render (AGENTS.md forbids side effects in
	// render). Keyed on the signature so we only re-publish on a real content
	// change; the ref hands the effect the current parsed map without making it
	// a dependency. An empty map is still published (it represents "no missions
	// planning"); the store dedupes identical maps so this is cheap.
	useEffect(() => {
		publishPlannerState(latestRef.current);
	}, [latestSig]);
}
