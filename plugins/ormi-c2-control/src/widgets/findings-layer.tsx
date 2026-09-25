"use client";

import type { SelectedTopic } from "@workspace/ormi-core/datasources";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { Badge } from "@workspace/ui/components/badge";
import {
	getDatasourceSubscriptionRegistry,
	isBoundTopic,
} from "@workspace/utils";
import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { Layer, Source } from "react-map-gl/maplibre";

import {
	recordDroppedFinding,
	recordFinding,
	useFindings,
	useFindingsStats,
} from "../state/findings-store";
import { useMissionContacts } from "../state/mission-contacts-store";
import type { C2Feature } from "../types/c2-types";
import {
	cueFeatureToFinding,
	findingsOfMission,
	findingsToFeatureCollection,
	parseFinding,
	tallyFindings,
	type Finding,
	type FindingChannel,
} from "./findings";
import { withMissionContacts } from "./mission-contacts";

/**
 * The findings layer: one layer for cues and contacts.
 *
 * ## Why one layer
 *
 * `payload_msgs/msg/Finding` is explicit that a cue and a contact are the same
 * record at different support depths (it also names a corroborated "item",
 * which nothing produces since sensor fusion was dropped), so the map draws one
 * layer and encodes the depth as **weight** — a bigger, heavier mark for a
 * sensor's report than for a bare cue. Two layers would be two vocabularies for one
 * thing, and an operator would have to work out which of them a report had
 * landed in before they could act on it. An operator-placed `cue` map feature
 * is lifted into the same record (`cueFeatureToFinding`) and drawn here, which
 * is why `FeatureLayers` deliberately skips `feature_type === "cue"`.
 *
 * ## The two states the styling must never lose
 *
 * **Essence.** Anything that is not `ESSENCE_REAL` gets a second, outer ring in
 * a colour nothing else on this map uses. Two concentric rings read as
 * different from one at a glance and without relying on hue, and the legend
 * says the same thing in words and in figures — a mark that is only *coloured*
 * differently is a mark a colour-blind operator does not see is different.
 * `ESSENCE_UNKNOWN` is flagged too: a publisher that never sets the field sends
 * `0`, and flagging an unset essence is the failure direction that cannot get
 * anybody hurt.
 *
 * **Supersession.** A superseded finding is drawn faded and underneath the live
 * ones, never removed — an operator may already have acted on it, and "this was
 * withdrawn" and "this never existed" are different answers.
 *
 * The mission's stored contacts (the fog's record, `mission-contacts.ts`)
 * are drawn here too, merged by uid with anything live.
 *
 * The layer has no handlers of its own: the map's pick tools act on authored
 * geometry, and a finding is not something the operator edits. The map's
 * click reads `c2-findings-core` first and opens a stored contact's details.
 */

/** A findings topic slot: the topic plus which channel it is. */
export interface FindingsTopicBinding {
	topic: SelectedTopic | undefined;
	channel: FindingChannel;
}

/** Stable key for a bound topic, so the ingest effect re-runs only on a change. */
function bindingKey(bindings: FindingsTopicBinding[]): string {
	return bindings
		.map((binding) =>
			isBoundTopic(binding.topic)
				? `${binding.channel}:${binding.topic.source.id}:${binding.topic.topic}`
				: `${binding.channel}:-`,
		)
		.join("|");
}

/**
 * Subscribe the findings topics and feed the store. Renders nothing.
 *
 * Goes through the datasource subscription registry rather than
 * `useLocalDataSource`, with `lossless: true`, for the reason spelled out at
 * the top of `state/findings-store.ts`: the core local provider keeps one value
 * per topic per drain tick, and a findings stream is accumulated, not observed.
 * The registry also waits for `DATASOURCE_READY`, refcounts, and re-subscribes
 * on reconnect, which is exactly what a widget that mounts before its robot
 * connects needs.
 *
 * @param props.bindings - The topic slots to read.
 */
export function FindingsIngest(props: { bindings: FindingsTopicBinding[] }) {
	const pluginsManager = usePluginsManager();
	const { bindings } = props;

	// The subscribe effect is armed on the topics' CONTENT, never on the
	// bindings array's identity: a widget's settings object is spread fresh on
	// every host render, so an identity-keyed effect would tear the wire down
	// and rebuild it whenever anything else on the dashboard re-rendered — and
	// a torn-down findings wire loses exactly the findings that arrive while it
	// is down. The bindings themselves are read through a latest-ref, synced in
	// its own effect declared FIRST so it runs before the subscribe effect on
	// every pass. (A ref written during render is what the React Compiler's
	// lint rules reject, and silencing `exhaustive-deps` instead would opt this
	// whole component out of compilation.)
	const bindingsRef = useRef(bindings);
	useEffect(() => {
		bindingsRef.current = bindings;
	});

	const key = bindingKey(bindings);

	useEffect(() => {
		const registry = getDatasourceSubscriptionRegistry(pluginsManager);
		const handles = bindingsRef.current.flatMap((binding) => {
			if (!isBoundTopic(binding.topic)) return [];
			const topic = binding.topic;
			return [
				registry.subscribe({
					// `lossless` is the consumer's declaration and is the OR
					// across every subscriber of the wire: a findings stream is
					// accumulated, and one that is coalesced is short by exactly
					// the findings nothing ever displayed.
					topic: { ...topic, lossless: true },
					onData: (value: unknown) => {
						const finding = parseFinding(value, binding.channel);
						if (finding) recordFinding(finding);
						else recordDroppedFinding();
					},
				}),
			];
		});
		return () => handles.forEach((handle) => handle.unsubscribe());
	}, [pluginsManager, key]);

	return null;
}

/**
 * Support depth → mark radius. The visual weight IS the support depth: a cue
 * stands alone, a contact rests on a report. `weight` is the depth clamped to
 * 1 by `findingsToFeatureCollection`; the third step of the ramp is unused
 * since items were dropped.
 */
const weightRadius = (): DataDrivenPropertyValueSpecification<number> => [
	"match",
	["get", "weight"],
	0,
	4,
	1,
	6.5,
	9,
];

/** Support depth → outline width, on the same ramp. */
const weightStroke = (): DataDrivenPropertyValueSpecification<number> => [
	"match",
	["get", "weight"],
	0,
	1,
	1,
	1.75,
	2.5,
];

/** The ring drawn around anything whose essence is not `ESSENCE_REAL`. */
const essenceRingRadius = (): DataDrivenPropertyValueSpecification<number> => [
	"match",
	["get", "weight"],
	0,
	9,
	1,
	11.5,
	14,
];

/**
 * The findings map layer.
 *
 * @param props.cueFeatures - Stored map features; the `cue` ones are lifted
 *   into the same record and drawn alongside what the fleet reported.
 */
export function FindingsLayer(props: {
	cueFeatures: C2Feature[];
	missionId?: string | null;
}) {
	const all = useFindings();
	const { cueFeatures, missionId } = props;
	const stored = useMissionContacts(missionId);
	const reported = useMemo(
		() =>
			withMissionContacts(
				findingsOfMission(all, missionId),
				missionId ? stored.contacts : [],
			),
		[all, missionId, stored],
	);

	const findings = useMemo<Finding[]>(() => {
		const authored = cueFeatures.flatMap((feature) => {
			const cue = cueFeatureToFinding(feature);
			return cue ? [cue] : [];
		});
		// A robot finding wins a uid collision: the fleet's copy carries the
		// support and the essence, and the authored cue carries neither.
		const seen = new Set(reported.map((finding) => finding.uid));
		return [...reported, ...authored.filter((cue) => !seen.has(cue.uid))];
	}, [reported, cueFeatures]);

	const fc = useMemo(() => findingsToFeatureCollection(findings), [findings]);

	return (
		<Source id="c2-findings" type="geojson" data={fc}>
			{/* Not-confirmed-real: a second ring, in a colour nothing else on
			    this map uses. A shape difference, not only a hue one. */}
			<Layer
				id="c2-findings-essence-ring"
				type="circle"
				filter={["==", ["get", "notReal"], true]}
				paint={{
					"circle-radius": essenceRingRadius(),
					"circle-opacity": 0,
					"circle-stroke-color": "#22d3ee",
					"circle-stroke-width": 2,
					"circle-stroke-opacity": [
						"case",
						["==", ["get", "superseded"], true],
						0.35,
						0.95,
					],
				}}
			/>
			<Layer
				id="c2-findings-core"
				type="circle"
				paint={{
					"circle-radius": weightRadius(),
					// Cue (a human's) apart from contact (a sensor's).
					"circle-color": [
						"match",
						["get", "kind"],
						"cue",
						"#eab308",
						"contact",
						"#f97316",
						"#dc2626",
					],
					// Confidence is readable as weight too, but never to zero:
					// a finding nobody believes is still a finding somebody has
					// to decide about.
					"circle-opacity": [
						"case",
						["==", ["get", "superseded"], true],
						0.18,
						["+", 0.4, ["*", 0.55, ["get", "confidence"]]],
					],
					"circle-stroke-width": weightStroke(),
					"circle-stroke-color": [
						"case",
						["==", ["get", "superseded"], true],
						"#94a3b8",
						"#ffffff",
					],
					"circle-stroke-opacity": [
						"case",
						["==", ["get", "superseded"], true],
						0.5,
						0.9,
					],
				}}
			/>
		</Source>
	);
}

/**
 * The findings readout: what is on the map, and what the ingest could not use.
 *
 * The dropped count is shown rather than hidden on purpose. `lossless` is a
 * request the datasource may or may not honour, and a findings layer that is
 * quietly short is the exact failure this pipeline was built to avoid — so the
 * numbers are on screen where an operator can see them disagree.
 *
 * @param props.cueFeatures - Stored map features, for the authored cues.
 * @param props.bound - Whether any findings topic is actually configured.
 */
export function FindingsReadout(props: {
	cueFeatures: C2Feature[];
	bound: boolean;
	missionId?: string | null;
}) {
	const all = useFindings();
	const stats = useFindingsStats();
	const { cueFeatures, missionId } = props;
	const stored = useMissionContacts(missionId);
	const reported = useMemo(
		() =>
			withMissionContacts(
				findingsOfMission(all, missionId),
				missionId ? stored.contacts : [],
			),
		[all, missionId, stored],
	);

	const authoredCues = useMemo(
		() =>
			cueFeatures.filter(
				(feature) => cueFeatureToFinding(feature) !== null,
			).length,
		[cueFeatures],
	);

	const tally = useMemo(() => tallyFindings(reported), [reported]);
	const total = tally.total + authoredCues;

	if (!props.bound && total === 0) return null;

	return (
		<div className="flex items-center gap-1.5 flex-wrap">
			<Badge
				variant="secondary"
				title={missionId ? "Selected mission" : undefined}
			>
				{total} findings
			</Badge>
			<span className="text-[11px] text-muted-foreground">
				{tally.cues + authoredCues} cue · {tally.contacts} contact
			</span>
			{/* The SAME word the contact's own badge uses (`essenceLabel`, via
			    `ContactDetails`). It read "4 not real" here and "SIMULATED"
			    forty pixels away, which is one state described twice — and the
			    operator has to work out that they are the same state. */}
			{tally.notReal > 0 && (
				<Badge
					variant="outline"
					className="border-info text-info"
					title="Simulated, exercise, test or unstated"
				>
					{tally.notReal} simulated
				</Badge>
			)}
			{tally.superseded > 0 && (
				<span className="text-[11px] text-muted-foreground">
					{tally.superseded} superseded
				</span>
			)}
			{props.bound && (
				<span
					className={`text-[11px] ${stats.dropped > 0 ? "text-warning" : "text-muted-foreground"}`}
					title="Dropped: no id or no usable position"
				>
					{stats.received} received · {stats.dropped} dropped
				</span>
			)}
		</div>
	);
}
