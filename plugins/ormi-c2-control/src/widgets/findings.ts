import type { Feature, FeatureCollection, Point } from "geojson";

import type { C2Feature } from "../types/c2-types";
import { readFeatureCategory, readFeatureId } from "./feature-geojson";

/**
 * The finding record, and the pure translation from the wire (and from an
 * operator-placed `cue` map feature) into it.
 *
 * ## One record, three names
 *
 * `payload_msgs/msg/Finding` says it outright: *"Cue, contact and item are THE
 * SAME RECORD at different support depths — the name is derived, not stored."*
 * So this module carries **one** type and derives the name, and the map draws
 * **one** layer. Two layers would be two vocabularies for one thing, and the
 * operator would have to learn which of them a report had landed in before they
 * could act on it.
 *
 * A cue an operator drew on the map is the support-empty, HUMAN_INSTINCT end of
 * that same record — it is stored as a `cue` map feature because assets live in
 * the map (the behaviour graph names them by `feature_id` and carries no
 * coordinates), and {@link cueFeatureToFinding} lifts it into the same shape as
 * anything the fleet reports.
 *
 * ## Append-only, and what that costs the reader
 *
 * A finding is never retracted: an operator may already have acted on it. A
 * superseded one gets `superseded_by` and is still drawn — faded, and behind
 * the live ones — because "this was withdrawn" and "this never existed" are
 * different things to an operator retracing their own decisions.
 *
 * ## Essence is a safety property
 *
 * `essence` exists so a simulated finding can never be mistaken for a real one.
 * Anything that is not `ESSENCE_REAL` is flagged on the map — including
 * `ESSENCE_UNKNOWN`, deliberately. A publisher that never sets the field sends
 * `0`, and flagging an unset one is the failure direction that cannot hurt
 * anybody; not flagging it is the one that can.
 *
 * ⚠ COORDINATE RULE — `position` is a `geographic_msgs/GeoPoint`
 * (`{latitude, longitude, altitude}`), i.e. already geographic with no frame to
 * resolve and no swap to perform. It is read into `[lng, lat]`, the order
 * everything else in this widget uses.
 *
 * No React, no map, no fetch — so every rule above is unit-tested directly.
 */

/** Wire schema name for a finding; the topic slots claim this raw type. */
export const FINDING_RAW_TYPE = "payload_msgs/msg/Finding";

/** `Finding.essence` — never let a simulated finding read as a real one. */
export enum FindingEssence {
	UNKNOWN = 0,
	REAL = 1,
	SIMULATED = 2,
	EXERCISE = 3,
	TEST = 4,
}

/** `Confidence.statistic_type` — on what basis the value should be believed. */
export enum ConfidenceStatistic {
	UNKNOWN = 0,
	PROBABILITY = 1,
	LIKELIHOOD_RATIO = 2,
	SCORE = 3,
	/** What makes an operator-placed cue and a robot contact one record. */
	HUMAN_INSTINCT = 4,
}

/**
 * Where a finding came from: a topic, the map (an authored cue), or the fog's
 * stored contacts of a mission (`mission-contacts.ts`). Provenance, never the
 * classifier.
 */
export type FindingChannel = "observation" | "map" | "fog";

/**
 * The derived name for a finding. The message also names a corroborated
 * "item"; nothing here produces or shows one — sensor fusion was dropped
 * (2026-09-23), so a report resting on others is still a contact.
 */
export type FindingKind = "cue" | "contact";

/** One physical quantity a payload reported, with its unit carried. */
export interface FindingMeasurement {
	quantity: string;
	value: number;
	unit: string;
	sigma: number;
	depth_m: number;
}

/** A belief that something is at a place. */
export interface Finding {
	uid: string;
	mission_id: string;
	/** `builtin_interfaces/Time` folded to epoch milliseconds; 0 when unset. */
	stampMs: number;
	essence: FindingEssence;
	/** `[lng, lat]` — from `GeoPoint`, geographic already, no swap. */
	lngLat: [number, number];
	altitude: number;
	/** Other findings this one rests on. Empty is part of the cue test. */
	supportUids: string[];
	confidenceStatistic: ConfidenceStatistic;
	/** 0..1. */
	confidence: number;
	/** 0..1 — how much the producer is trusted. */
	sourceReliability: number;
	measurements: FindingMeasurement[];
	agent_id: string;
	payload_uid: string;
	source: string;
	gate_used: string;
	sigmaAtCreation: number;
	degradedFix: boolean;
	/** uid of the finding that replaces this one; "" while it stands. */
	supersededBy: string;
	/** Which topic (or the map) it arrived on. */
	channel: FindingChannel;
}

/** Read a number defensively; non-finite and non-numeric yield the fallback. */
function num(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: fallback;
}

/** Read a string defensively; anything else yields "". */
function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Read a `builtin_interfaces/Time` as epoch milliseconds (0 when unusable). */
export function findingStampMs(stamp: unknown): number {
	if (!stamp || typeof stamp !== "object") return 0;
	const t = stamp as { sec?: unknown; nanosec?: unknown; nsec?: unknown };
	const sec = num(t.sec);
	const nanosec = num(t.nanosec ?? t.nsec);
	if (sec === 0 && nanosec === 0) return 0;
	return sec * 1000 + Math.floor(nanosec / 1e6);
}

/**
 * The derived name for a finding.
 *
 * Anything resting on another report is a **contact**. With no support at all
 * the confidence basis decides — a **cue** is the HUMAN_INSTINCT one. A
 * payload's own first report also has no support, and calling that a cue would
 * say a human put it there.
 *
 * @param finding - The finding to name.
 * @returns Its derived kind.
 */
export function findingKind(
	finding: Pick<Finding, "supportUids" | "confidenceStatistic">,
): FindingKind {
	if (finding.supportUids.length > 0) return "contact";
	return finding.confidenceStatistic === ConfidenceStatistic.HUMAN_INSTINCT
		? "cue"
		: "contact";
}

/** How much support a finding rests on — the layer's visual weight input. */
export function findingSupportDepth(finding: Finding): number {
	return finding.supportUids.length;
}

/** Whether a finding must be flagged as not-confirmed-real on the map. */
export function isSimulatedEssence(essence: FindingEssence): boolean {
	return essence !== FindingEssence.REAL;
}

/** Operator-facing label for an essence value. */
export function essenceLabel(essence: FindingEssence): string {
	switch (essence) {
		case FindingEssence.REAL:
			return "real";
		case FindingEssence.SIMULATED:
			return "SIMULATED";
		case FindingEssence.EXERCISE:
			return "EXERCISE";
		case FindingEssence.TEST:
			return "TEST";
		default:
			return "essence unknown";
	}
}

/**
 * Parse a raw `payload_msgs/msg/Finding` into a {@link Finding}.
 *
 * Defensive throughout — this reads a wire message no converter has validated
 * — and **refuses** rather than guesses on the two fields the map cannot do
 * without: a `uid` (the append-only identity; without one every republish would
 * read as a new finding) and a usable geographic position. Everything else
 * degrades to a zero/empty value, because a finding with an unreadable
 * `gate_used` is still a finding at a place.
 *
 * @param raw - The message as delivered to the subscription callback.
 * @param channel - Which topic it arrived on.
 * @returns The parsed finding, or `null` when it cannot be placed.
 */
export function parseFinding(
	raw: unknown,
	channel: FindingChannel,
): Finding | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const msg = raw as Record<string, unknown>;

	const uid = str(msg.uid).trim();
	if (!uid) return null;

	const position = msg.position as Record<string, unknown> | undefined;
	if (!position || typeof position !== "object") return null;
	const lat = position.latitude;
	const lng = position.longitude;
	if (
		typeof lat !== "number" ||
		typeof lng !== "number" ||
		!Number.isFinite(lat) ||
		!Number.isFinite(lng)
	) {
		return null;
	}

	const confidence = (msg.confidence ?? {}) as Record<string, unknown>;
	const measurements = Array.isArray(msg.measurements)
		? (msg.measurements as unknown[]).flatMap((entry) => {
				if (!entry || typeof entry !== "object") return [];
				const m = entry as Record<string, unknown>;
				return [
					{
						quantity: str(m.quantity),
						value: num(m.value),
						unit: str(m.unit),
						sigma: num(m.sigma),
						depth_m: num(m.depth_m),
					},
				];
			})
		: [];

	return {
		uid,
		mission_id: str(msg.mission_id),
		stampMs: findingStampMs(msg.stamp),
		essence: num(msg.essence, FindingEssence.UNKNOWN) as FindingEssence,
		lngLat: [lng, lat],
		altitude: num(position.altitude),
		supportUids: Array.isArray(msg.support_uids)
			? (msg.support_uids as unknown[]).filter(
					(v): v is string => typeof v === "string" && v.length > 0,
				)
			: [],
		confidenceStatistic: num(
			confidence.statistic_type,
			ConfidenceStatistic.UNKNOWN,
		) as ConfidenceStatistic,
		confidence: num(confidence.value),
		sourceReliability: num(confidence.source_reliability),
		measurements,
		agent_id: str(msg.agent_id),
		payload_uid: str(msg.payload_uid),
		source: str(msg.source),
		gate_used: str(msg.gate_used),
		sigmaAtCreation: num(msg.sigma_at_creation),
		degradedFix: msg.degraded_fix === true,
		supersededBy: str(msg.superseded_by).trim(),
		channel,
	};
}

/**
 * Lift an operator-placed `cue` map feature into the same {@link Finding}
 * record a robot would have produced.
 *
 * This is decision 2 made concrete: a cue and a contact are one data model, so
 * the authored one is converted rather than given a second layer and a second
 * palette. It is support-empty and HUMAN_INSTINCT by construction, which is
 * exactly what {@link findingKind} reads as a cue. Its `essence` is REAL — an
 * operator standing in front of the ground is a real observation, however
 * uncertain; the confidence field is where the uncertainty is said.
 *
 * `properties.confidence` is honoured when the feature carries one (the backend
 * preserves arbitrary properties now), defaulting to 0.5 — a cue with no stated
 * confidence must not draw at full weight.
 *
 * @param feature - A stored MapDB feature with `feature_type === "cue"`.
 * @returns The finding, or `null` when it is not a usable point cue.
 */
export function cueFeatureToFinding(feature: C2Feature): Finding | null {
	if (feature.properties?.feature_type !== "cue") return null;
	const uid = readFeatureId(feature);
	if (!uid) return null;

	const coordinates = feature.geometry?.coordinates;
	const point = Array.isArray(coordinates)
		? // A MultiPoint cue (the backend accepts one) is read at its first
			// vertex; a multi-part cue is not a thing an operator authors here.
			typeof coordinates[0] === "number"
			? coordinates
			: Array.isArray(coordinates[0])
				? (coordinates[0] as unknown[])
				: null
		: null;
	if (
		!point ||
		typeof point[0] !== "number" ||
		typeof point[1] !== "number"
	) {
		return null;
	}

	const stated = feature.properties?.confidence;
	const confidence =
		typeof stated === "number" && Number.isFinite(stated)
			? Math.min(1, Math.max(0, stated))
			: 0.5;

	return {
		uid,
		mission_id: str(feature.properties?.mission_id),
		stampMs: 0,
		essence: FindingEssence.REAL,
		lngLat: [point[0], point[1]],
		altitude: 0,
		supportUids: [],
		confidenceStatistic: ConfidenceStatistic.HUMAN_INSTINCT,
		confidence,
		sourceReliability: 1,
		measurements: [],
		agent_id: "",
		payload_uid: "",
		source: str(feature.properties?.name) || "operator",
		gate_used: readFeatureCategory(feature) ?? "",
		sigmaAtCreation: 0,
		degradedFix: false,
		supersededBy: "",
		channel: "map",
	};
}

/** Per-kind counts plus the two states the operator must be able to see. */
export interface FindingTally {
	total: number;
	cues: number;
	contacts: number;
	/** Not `ESSENCE_REAL` — simulated, exercise, test, or never stated. */
	notReal: number;
	superseded: number;
}

/**
 * The findings of one mission. The fog attributes a contact to the mission
 * that has its robot leased while it runs and republishes it stamped with that
 * mission (`/mission/findings`); a raw `/payload/observation`
 * carries no mission and belongs to none. No mission selected shows them all.
 *
 * @param findings - Every finding on record.
 * @param missionId - The mission in focus, if any.
 * @returns The ones to show.
 */
export function findingsOfMission(
	findings: readonly Finding[],
	missionId: string | null | undefined,
): readonly Finding[] {
	if (!missionId) return findings;
	return findings.filter((finding) => finding.mission_id === missionId);
}

/**
 * Count a set of findings by derived kind, plus the two states that change what
 * an operator may do with them.
 *
 * @param findings - The findings to tally.
 * @returns The tally.
 */
export function tallyFindings(findings: readonly Finding[]): FindingTally {
	const tally: FindingTally = {
		total: findings.length,
		cues: 0,
		contacts: 0,
		notReal: 0,
		superseded: 0,
	};
	for (const finding of findings) {
		if (findingKind(finding) === "cue") tally.cues += 1;
		else tally.contacts += 1;
		if (isSimulatedEssence(finding.essence)) tally.notReal += 1;
		if (finding.supersededBy) tally.superseded += 1;
	}
	return tally;
}

/** The GeoJSON properties the findings layer styles on. */
export interface FindingFeatureProperties extends Record<string, unknown> {
	uid: string;
	kind: FindingKind;
	/**
	 * 0 for a finding that rests on nothing, 1 for one resting on a report —
	 * a cue and a contact. (A third, heavier weight was for corroborated
	 * items, which were dropped.)
	 */
	weight: number;
	essence: number;
	notReal: boolean;
	superseded: boolean;
	confidence: number;
	agent_id: string;
	mission_id: string;
	channel: FindingChannel;
	label: string;
}

/** A short line naming what a finding is, for a title/tooltip. */
export function findingLabel(finding: Finding): string {
	const kind = findingKind(finding);
	const essence = isSimulatedEssence(finding.essence)
		? ` · ${essenceLabel(finding.essence)}`
		: "";
	const superseded = finding.supersededBy ? " · superseded" : "";
	const confidence = `${Math.round(finding.confidence * 100)}%`;
	return `${kind} ${confidence}${essence}${superseded}`;
}

/**
 * Project findings into the GeoJSON the map layer renders.
 *
 * Sorted so the ones that matter most draw last (on top): superseded findings
 * first, then by support depth. MapLibre paints a source's features in the
 * order the data gives them, so this is the only place the stacking can be
 * decided.
 *
 * @param findings - The findings to render.
 * @returns A point `FeatureCollection` carrying the styling properties.
 */
export function findingsToFeatureCollection(
	findings: readonly Finding[],
): FeatureCollection<Point, FindingFeatureProperties> {
	const ordered = [...findings].sort((a, b) => {
		const supersededDelta =
			(a.supersededBy ? 0 : 1) - (b.supersededBy ? 0 : 1);
		if (supersededDelta !== 0) return supersededDelta;
		return a.supportUids.length - b.supportUids.length;
	});

	const features: Feature<Point, FindingFeatureProperties>[] = ordered.map(
		(finding) => ({
			type: "Feature",
			properties: {
				uid: finding.uid,
				kind: findingKind(finding),
				weight: Math.min(1, finding.supportUids.length),
				essence: finding.essence,
				notReal: isSimulatedEssence(finding.essence),
				superseded: finding.supersededBy.length > 0,
				confidence: Math.min(1, Math.max(0, finding.confidence)),
				agent_id: finding.agent_id,
				mission_id: finding.mission_id,
				channel: finding.channel,
				label: findingLabel(finding),
			},
			geometry: { type: "Point", coordinates: finding.lngLat },
		}),
	);

	return { type: "FeatureCollection", features };
}
