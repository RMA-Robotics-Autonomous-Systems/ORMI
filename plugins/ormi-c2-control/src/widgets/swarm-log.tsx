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
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { ScrollText } from "lucide-react";

import { useSelectedMission } from "../state/selection-store";

/**
 * F11 — Swarm log widget.
 *
 * Streams `/multi_robot/swarm_log` (`c2_msgs/msg/SwarmLog`:
 * `mission_id`, `log`, `date`, `log_type`) into a scrolling list, filtered to
 * the active/pinned mission.
 *
 * Single-topic display widget → the body is gated by {@link DatasourceGate}.
 */

/** A single `c2_msgs/msg/SwarmLog` entry. */
export interface SwarmLogEntry {
	mission_id?: string;
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

/** How many of the most-recent matching entries to render. */
const MAX_VISIBLE = 200;

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
	for (const source of sources.values()) {
		for (const value of source.data) {
			if (value == null || typeof value !== "object") continue;
			const entry = value as SwarmLogEntry;
			if (missionId && entry.mission_id !== missionId) continue;
			entries.push(entry);
		}
	}
	return entries.slice(-MAX_VISIBLE);
}

/** Body: filters buffered log entries by mission, gates on health. */
function SwarmLogBody(props: {
	sourceTitle: string;
	missionId: string | null;
}) {
	const { sources, health } = useLocalDataSource();
	const entries = collectSwarmLog(
		sources as Map<string, BufferedSource>,
		props.missionId,
	);

	return (
		<DatasourceGate health={health} title={props.sourceTitle}>
			<div className="h-full flex flex-col p-2">
				<ScrollArea className="flex-1 min-h-0">
					<div className="flex flex-col gap-1 pr-2 font-mono text-xs">
						{entries.length === 0 ? (
							<div className="text-muted-foreground">
								{props.missionId
									? `No log entries for mission ${props.missionId}.`
									: "No log entries yet."}
							</div>
						) : (
							entries.map((entry, index) => (
								<div
									key={`${entry.date ?? index}-${index}`}
									className="flex gap-2"
								>
									{entry.date && (
										<span className="text-muted-foreground shrink-0">
											{entry.date}
										</span>
									)}
									{entry.log_type != null && (
										<span className="text-muted-foreground shrink-0">
											[{String(entry.log_type)}]
										</span>
									)}
									<span className="break-all">
										{entry.log ?? ""}
									</span>
								</div>
							))
						)}
					</div>
				</ScrollArea>
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
 * Widget definition for the swarm-log widget (F11).
 * @returns Widget definition.
 */
export function SwarmLogDefinition(): WidgetDefinition<SwarmLogProps> {
	return {
		id: "c2-swarm-log-widget",
		name: "C2 Swarm Log",
		description: "Scrolling mission log stream from /multi_robot/swarm_log",
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
			required: ["title", "topic"],
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
