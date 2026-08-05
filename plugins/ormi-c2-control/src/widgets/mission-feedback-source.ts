"use client";

/**
 * Shared mission-feedback ingest helpers for the C2 widgets.
 *
 * `/multi_robot/mission_feedback` is a SINGLE shared ROS topic carrying feedback
 * for ALL missions, interleaved. Both the Mission Feedback widget (F10) and the
 * Mission Control panel (F8) subscribe to it through a local datasource with a
 * size-1 buffer, parse the latest message, and publish it into the per-mission
 * feedback store (`state/mission-feedback-store.ts`) so each widget can READ ONLY
 * its own mission's slot without interleave flicker.
 *
 * This module owns the two pieces that were previously duplicated in both
 * widgets: {@link latestFeedback} (parse the buffer tail) and
 * {@link usePublishMissionFeedback} (publish-in-effect keyed on the plan
 * signature). Keep ONE copy here.
 */

import { useEffect, useRef } from "react";

import {
	MissionFeedback,
	feedbackPlanSignature,
	parseMissionFeedback,
} from "../types/mission-feedback";
import { publishMissionFeedback } from "../state/mission-feedback-store";

/** Raw `c2_msgs/msg/MissionFeedback`: a wrapper around the JSON-string field. */
export interface RawMissionFeedbackMsg {
	mission_id?: string;
	mission_feedback?: string;
}

/**
 * Pull the latest typed feedback out of the local-datasource sources map.
 *
 * The wire message wraps the feedback as a JSON string in `mission_feedback`;
 * we also tolerate the already-parsed object (e.g. a topic `property` pointing
 * straight at the inner field).
 * @param sources - The provider's per-topic buffered sources.
 * @returns The latest parsed feedback, or null.
 */
export function latestFeedback(
	sources: Map<string, { data: unknown[] }>,
): MissionFeedback | null {
	let latest: MissionFeedback | null = null;
	for (const source of sources.values()) {
		const value = source.data[source.data.length - 1];
		if (value == null) continue;
		const msg = value as RawMissionFeedbackMsg;
		const candidate =
			typeof msg.mission_feedback === "string"
				? parseMissionFeedback(msg.mission_feedback)
				: parseMissionFeedback(value as RawMissionFeedbackMsg);
		if (candidate) latest = candidate;
	}
	return latest;
}

/**
 * Parse the latest buffered `mission_feedback` message and publish it into the
 * per-mission feedback store, so consumers can read a stable, interleave-free
 * per-mission slot via `useMissionFeedback`.
 *
 * Publishing happens in an effect (never in render — AGENTS.md forbids side
 * effects in render), keyed on the feedback's {@link feedbackPlanSignature} so we
 * only re-publish on a real content change. A ref hands the effect the current
 * parsed object without making it a dependency.
 *
 * @param sources - The provider's per-topic buffered sources.
 * @param enabled - When false (e.g. F8 with no feedback topic configured), the
 *   hook parses nothing and publishes nothing — preserving the "no topic → no
 *   live status" contract.
 */
export function usePublishMissionFeedback(
	sources: Map<string, { data: unknown[] }>,
	enabled: boolean,
): void {
	const latest = enabled ? latestFeedback(sources) : null;
	const latestSig = latest ? feedbackPlanSignature(latest) : "";
	const latestRef = useRef(latest);
	latestRef.current = latest;
	// Publish in an effect, not in render (AGENTS.md forbids side effects in
	// render). Keyed on the signature so we only re-publish on a real content
	// change; the ref hands the effect the current parsed object without making it
	// a dependency.
	useEffect(() => {
		if (latestRef.current) publishMissionFeedback(latestRef.current);
	}, [latestSig]);
}
