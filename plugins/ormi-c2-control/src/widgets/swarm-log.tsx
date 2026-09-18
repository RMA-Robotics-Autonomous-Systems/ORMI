"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	LocalDataSourcesProvider,
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { ArrowDownToLine, ScrollText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSelectedMission } from "../state/selection-store";
import { useMissionName } from "../state/c2-catalog-store";
import {
	swarmLogRowClass,
	swarmLogTypeClass,
	swarmLogTypeLabel,
} from "../types/log-type";
import {
	PER_MISSION_CAP,
	createSwarmLogBuffer,
	ingestSwarmLog,
	readSwarmLog,
	swarmLogMissionKey,
} from "./swarm-log-buffer";
import { PanelEmptyState } from "./panel-empty-state";
import { atMost, useContainerSize } from "./responsive";

/**
 * Swarm log widget.
 *
 * Streams `/multi_robot/log` (`c2_msgs/msg/SwarmLog`: `mission_id`, `log`,
 * `date`, `log_type`) into a scrolling list, filtered to the active/pinned
 * mission. Every framework node now publishes its swarm logs on that one topic
 * (the older `/multi_robot/swarm_log` carried only the C2 interface's share).
 * `mission_id` is a `unique_identifier_msgs/UUID`, converted to the canonical
 * string before it is compared with the selection (see `types/uuid.ts`), and
 * `date` may be missing on older backends — the row then shows no time.
 *
 * Three properties this widget has to get right, because it is the only place
 * the system's failures reach an operator at all:
 *
 *  - **Per-mission retention.** The transport's buffer is a single shared
 *    arrival window; entries are accumulated out of it into a ring buffer PER
 *    MISSION (`swarm-log-buffer.ts`), so a mission emitting a quarter-million
 *    identical lines cannot evict the log of the mission being watched.
 *  - **Autoscroll.** The view follows the tail by default and stops following
 *    the moment the operator scrolls up, so reading history is not fought by
 *    incoming traffic. A "Follow" button returns to the tail.
 *  - **Decoded severity.** `log_type` is rendered as a coloured `INFO` / `WARN` /
 *    `ERROR` / `FATAL` badge per `centralized_msgs/json/Enums.hpp`, not as the
 *    bare integer it used to be. See `types/log-type.ts` for why the backend's
 *    own `EnumsTools` helper must NOT be followed.
 *
 * Single-topic display widget → the body is gated by {@link DatasourceGate}.
 */

/** A single `c2_msgs/msg/SwarmLog` entry. */
export interface SwarmLogEntry {
	/**
	 * A `unique_identifier_msgs/UUID` on the wire (`{ uuid: bytes }`); a string in
	 * older fixtures. Compare only through `swarmLogMissionKey`.
	 */
	mission_id?: unknown;
	log?: string;
	date?: string;
	log_type?: string | number;
}

/** Props for the SwarmLog widget. */
interface SwarmLogProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	/** Pin to a fixed mission id; empty/absent → follow the active selection. */
	mission_id?: string;
}

/** Per-topic buffered source shape used here. */
interface BufferedSource {
	data: unknown[];
}

/**
 * How many of the most-recent matching entries to render, and the size of the
 * transport's arrival window. The PER-MISSION retention is
 * {@link PER_MISSION_CAP} in `swarm-log-buffer.ts`; this is only how much of the
 * stream is handed to us per flush.
 */
const MAX_VISIBLE = 200;

/** Distance from the bottom (px) still treated as "at the tail". */
const AUTOSCROLL_SLACK_PX = 24;

/**
 * Collect the buffered swarm-log entries, filtered to a mission.
 *
 * Pure (no React) so it can be unit-tested. A `null`/empty `missionId` means
 * "no filter" — return everything.
 *
 * @param sources - The provider's per-topic buffered sources.
 * @param missionId - The active/pinned mission id, or null for no filter.
 * @returns The matching entries, oldest-first, capped to {@link MAX_VISIBLE}.
 */
export function collectSwarmLog(
	sources: Map<string, BufferedSource>,
	missionId: string | null,
): SwarmLogEntry[] {
	const entries: SwarmLogEntry[] = [];
	const wanted = missionId ? swarmLogMissionKey(missionId) : null;
	for (const source of sources.values()) {
		for (const value of source.data) {
			if (value == null || typeof value !== "object") continue;
			const entry = value as SwarmLogEntry;
			if (wanted && swarmLogMissionKey(entry.mission_id) !== wanted)
				continue;
			entries.push(entry);
		}
	}
	return entries.slice(-MAX_VISIBLE);
}

/**
 * A log time for a narrow column: an ISO date becomes local `HH:MM:SS` (the
 * full value stays in the tooltip); anything else is shown as sent.
 */
export function logTime(date: string): string {
	const ms = Date.parse(date);
	if (Number.isNaN(ms) || !/\d{4}-\d{2}-\d{2}/.test(date)) return date;
	const d = new Date(ms);
	return [d.getHours(), d.getMinutes(), d.getSeconds()]
		.map((n) => String(n).padStart(2, "0"))
		.join(":");
}

/** The Radix scroll viewport inside `root`, or null when not mounted. */
function findViewport(root: HTMLElement | null): HTMLElement | null {
	return (
		root?.querySelector<HTMLElement>(
			'[data-slot="scroll-area-viewport"]',
		) ?? null
	);
}

/** Body: accumulates per mission, autoscrolls, renders decoded severity. */
function SwarmLogBody(props: {
	sourceTitle: string;
	missionId: string | null;
}) {
	const { sources, health } = useLocalDataSource();
	const missionName = useMissionName(props.missionId);

	// Per-mission accumulator, owned by this widget instance for its lifetime.
	// A ref, mutated in place — and read ONLY inside the effect below. The
	// rendered entries are copied into state there, so render never touches the
	// ref (a render-phase ref read is what the React Compiler freezes, per
	// AGENTS.md "React Compiler + external mutable stores").
	const bufferRef = useRef(createSwarmLogBuffer());
	const [entries, setEntries] = useState<SwarmLogEntry[]>([]);

	// Ingest the arrival window into the per-mission rings, then publish the
	// selected mission's ring. In an effect, never in render: it mutates the
	// accumulator, and a render React discards must not consume entries that
	// would then never be shown. Re-runs on a mission switch so the view swaps
	// to that mission's retained history immediately.
	useEffect(() => {
		for (const source of sources.values()) {
			ingestSwarmLog(bufferRef.current, source.data, PER_MISSION_CAP, {
				keep: props.missionId,
			});
		}
		setEntries(readSwarmLog(bufferRef.current, props.missionId).slice());
	}, [sources, props.missionId]);

	// --- Autoscroll -------------------------------------------------------
	// Follow the tail by default; stop the moment the operator scrolls up, so
	// reading history is not fought by incoming traffic. No widget in this plugin
	// had autoscroll at all, which made a live log unreadable at any rate.
	//
	// The scrollable element is Radix's viewport INSIDE `<ScrollArea>`, which the
	// shared `@workspace/ui` wrapper does not expose a ref for. ORMI is a shared
	// repository, so it is reached through its own `data-slot` marker from a
	// wrapper element rather than by widening that component's props.
	//
	// The wrapper is held in state through a callback ref, not a `useRef`: it
	// lives inside `DatasourceGate`, so it does not exist while the datasource is
	// offline and appears only later. Effects keyed on it re-run when it mounts.
	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const [follow, setFollow] = useState(true);
	// The same element is measured for the panel padding convention.
	const [measureRef, box] = useContainerSize<HTMLDivElement>();
	const pad = atMost("xs", box.size) ? "p-2" : "p-3";
	const attachRoot = useCallback(
		(el: HTMLDivElement | null) => {
			setRoot(el);
			measureRef(el);
		},
		[measureRef],
	);

	const scrollToTail = () => {
		const el = findViewport(root);
		if (el) el.scrollTop = el.scrollHeight;
	};

	// Keyed on the `entries` identity, not its length: a bucket at its cap keeps
	// the same length while its contents roll, and the view must still follow.
	useEffect(() => {
		if (!follow) return;
		const el = findViewport(root);
		if (el) el.scrollTop = el.scrollHeight;
	}, [follow, entries, root]);

	// Re-arm follow when the operator scrolls back to the bottom themselves, and
	// disarm it as soon as they scroll away from it.
	// The viewport only exists once there are entries (the empty state replaces
	// the scroll area), so the listener is re-attached when they first arrive.
	const hasEntries = entries.length > 0;
	useEffect(() => {
		const el = findViewport(root);
		if (!el || !hasEntries) return;
		const onScroll = () => {
			const atTail =
				el.scrollHeight - el.scrollTop - el.clientHeight <=
				AUTOSCROLL_SLACK_PX;
			setFollow(atTail);
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, [root, hasEntries]);

	return (
		<DatasourceGate health={health} title={props.sourceTitle}>
			<div
				ref={attachRoot}
				className={`h-full min-w-0 flex flex-col gap-2 text-sm ${pad}`}
			>
				<div className="flex items-center gap-2 min-w-0 shrink-0">
					<Badge variant="secondary">
						{entries.length}
						{entries.length >= PER_MISSION_CAP ? "+" : ""} entries
					</Badge>
					{!follow && (
						<div className="ml-auto flex shrink-0 items-center gap-1">
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									setFollow(true);
									scrollToTail();
								}}
								title="Resume following the newest entries"
							>
								<ArrowDownToLine />
								Follow
							</Button>
						</div>
					)}
				</div>
				{entries.length === 0 ? (
					<PanelEmptyState>
						{props.missionId
							? `No log entries for mission ${missionName}.`
							: "No log entries yet."}
					</PanelEmptyState>
				) : (
					<ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block">
						<div className="flex flex-col gap-1 pr-2 font-mono text-xs">
							{entries.map((entry, index) => (
								<div
									key={`${entry.date ?? index}-${index}`}
									className={`flex flex-wrap gap-x-2 rounded-sm px-1 min-w-0 ${swarmLogRowClass(
										entry.log_type,
									)}`}
								>
									{entry.date && (
										<span
											className="text-muted-foreground shrink-0 tabular-nums"
											title={entry.date}
										>
											{logTime(entry.date)}
										</span>
									)}
									{entry.log_type != null && (
										<span
											className={`shrink-0 w-11 ${swarmLogTypeClass(
												entry.log_type,
											)}`}
											title={`log_type ${String(entry.log_type)}`}
										>
											{swarmLogTypeLabel(entry.log_type)}
										</span>
									)}
									<span className="min-w-0 flex-1 basis-48 break-words">
										{entry.log ?? ""}
									</span>
								</div>
							))}
						</div>
					</ScrollArea>
				)}
			</div>
		</DatasourceGate>
	);
}

/** Host: wires the selected topic into a local-datasource provider. */
const SwarmLogWidget: React.FC<SwarmLogProps> = (props) => {
	const active = useSelectedMission();
	const missionId = props.mission_id?.trim()
		? props.mission_id.trim()
		: active;

	if (!props.topic) {
		return (
			<PanelEmptyState>
				Select a swarm log topic in the widget configuration.
			</PanelEmptyState>
		);
	}

	return (
		<LocalDataSourcesProvider
			SelectedTopics={[props.topic]}
			buffersSize={MAX_VISIBLE}
		>
			<SwarmLogBody
				sourceTitle={props.topic.source.title}
				missionId={missionId}
			/>
		</LocalDataSourcesProvider>
	);
};

/**
 * Widget definition for the swarm-log widget.
 * @returns Widget definition.
 */
export function SwarmLogDefinition(): WidgetDefinition<SwarmLogProps> {
	return {
		id: "c2-swarm-log-widget",
		name: "C2 Swarm Log",
		description: "Scrolling swarm mission log",
		titleProp: "title",
		icon: <ScrollText />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				topic: { type: "object", title: "Topic" },
				mission_id: {
					type: "string",
					title: "Pinned mission id (optional)",
				},
			},
			required: ["title"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "TopicSelect",
					scope: "#/properties/topic",
					options: {
						dataRequirements: {
							accepts: [],
							acceptsRaw: ["c2_msgs/msg/SwarmLog"],
						},
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/mission_id",
				} as ControlElement,
			],
		} as VerticalLayout,

		data: {
			title: "Swarm Log",
		},
		Component: SwarmLogWidget,
	} as WidgetDefinition<SwarmLogProps>;
}
