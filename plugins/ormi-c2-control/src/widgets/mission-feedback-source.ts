"use client";

/**
 * Shared mission-feedback ingest helpers for the C2 widgets.
 *
 * `/multi_robot/mission_feedback` is a SINGLE shared ROS topic carrying feedback
 * for ALL missions, interleaved. Both the Mission Feedback widget and the
 * Mission Control panel subscribe to it through a local datasource with a
 * size-1 buffer, parse the latest message, and publish it into the per-mission
 * feedback store (`state/mission-feedback-store.ts`) so each widget can READ ONLY
 * its own mission's slot without interleave flicker.
 *
 * This module owns the two pieces that were previously duplicated in both
 * widgets: {@link parseFeedbackMessage} (parse one buffered message) and
 * {@link usePublishMissionFeedback} (publish every new message, in an effect).
 * Keep ONE copy here.
 */

import { useEffect, useRef } from "react";

import {
	MissionFeedback,
	parseMissionFeedback,
} from "../types/mission-feedback";
import { publishMissionFeedback } from "../state/mission-feedback-store";

/** Raw `c2_msgs/msg/MissionFeedback`: a wrapper around the JSON-string field. */
export interface RawMissionFeedbackMsg {
	mission_id?: string;
	mission_feedback?: string;
}

/**
 * Parse one buffered wire value into a typed feedback.
 *
 * The wire message wraps the feedback as a JSON string in `mission_feedback`;
 * we also tolerate the already-parsed object (e.g. a topic `property` pointing
 * straight at the inner field).
 * @param value - One buffered message.
 * @returns The parsed feedback, or null.
 */
export function parseFeedbackMessage(value: unknown): MissionFeedback | null {
	if (value == null || typeof value !== "object") {
		return typeof value === "string" ? parseMissionFeedback(value) : null;
	}
	const msg = value as RawMissionFeedbackMsg;
	return typeof msg.mission_feedback === "string"
		? parseMissionFeedback(msg.mission_feedback)
		: parseMissionFeedback(value as RawMissionFeedbackMsg);
}

/**
 * Pull the latest typed feedback out of the local-datasource sources map.
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
		const candidate = parseFeedbackMessage(value);
		if (candidate) latest = candidate;
	}
	return latest;
}

/**
 * Publish every NEW buffered `mission_feedback` message into the per-mission
 * feedback store, so consumers can read a stable, interleave-free per-mission
 * slot via `useMissionFeedback`.
 *
 * EVERY message is published, not only the ones whose content changed. This hook
 * used to publish only when the plan
 * signature changed, so an identical republish — which is what a healthy live
 * mission sends between waypoints — never reached the store, its `updatedAt`
 * never moved, and a perfectly healthy mission read "stale" after 15 s. The
 * store itself stays cheap on identical content (it moves the timestamp and
 * notifies nobody), so publishing at topic rate costs no re-render.
 *
 * "New" is decided by message OBJECT identity (a `WeakSet` of the values already
 * handed over), so a re-render that did not bring a message publishes nothing,
 * and a larger buffer (the map keeps 128) hands over every unseen message in
 * arrival order — interleaved missions all land in their own slots.
 *
 * Parsing and publishing happen in an effect (never in render — AGENTS.md forbids
 * side effects in render), re-run whenever the provider's `sources` map changes,
 * which it does on every flush that carried a message.
 *
 * @param sources - The provider's per-topic buffered sources.
 * @param enabled - When false (e.g. the control panel with no feedback topic configured), the
 *   hook parses nothing and publishes nothing — preserving the "no topic → no
 *   live status" contract.
 */
export function usePublishMissionFeedback(
	sources: Map<string, { data: unknown[] }>,
	enabled: boolean,
): void {
	const seenRef = useRef<WeakSet<object>>(new WeakSet());
	useEffect(() => {
		if (!enabled) return;
		publishNewFeedbackMessages(sources, seenRef.current);
	}, [sources, enabled]);
}

/**
 * The body of {@link usePublishMissionFeedback}, pure of React so it is
 * testable: publish every buffered message not handed over before.
 *
 * The provider builds a NEW `data` array for a topic only on a flush that
 * carried a message for it, so an unchanged array means nothing new arrived on
 * that topic. Within a new array, object messages are deduped by identity; a
 * bare JSON string has no identity, so only the tail of a freshly flushed buffer
 * is taken as new.
 *
 * @param sources - The provider's per-topic buffered sources.
 * @param seen - Arrays and messages already handed over (mutated).
 * @param publish - The sink (the feedback store, unless a test swaps it).
 * @returns How many feedbacks were published.
 */
export function publishNewFeedbackMessages(
	sources: Map<string, { data: unknown[] }>,
	seen: WeakSet<object>,
	publish: (fb: MissionFeedback) => void = publishMissionFeedback,
): number {
	let published = 0;
	for (const source of sources.values()) {
		if (seen.has(source.data)) continue;
		seen.add(source.data);
		const last = source.data.length - 1;
		source.data.forEach((value, i) => {
			if (value == null) return;
			if (typeof value === "object") {
				if (seen.has(value)) return;
				seen.add(value);
			} else if (i !== last) {
				return;
			}
			const fb = parseFeedbackMessage(value);
			if (fb) {
				publish(fb);
				published += 1;
			}
		});
	}
	return published;
}
