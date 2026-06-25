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
import { Badge } from "@workspace/ui/components/badge";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { ListChecks } from "lucide-react";

import {
	FeedbackTask,
	MissionFeedback,
	parseMissionFeedback,
} from "../types/mission-feedback";
import { missionStatusLabel } from "../types/status-labels";
import { useSelectedMission } from "../state/selection-store";
import { useMissionName } from "../state/c2-catalog-store";
import { useAgentName } from "../state/c2-agents-store";

/**
 * F10 — Mission feedback widget.
 *
 * Reads `/multi_robot/mission_feedback` (a single topic) through ORMI's local
 * datasource mechanism, parses the JSON-string `mission_feedback` field with S2,
 * and renders the mission `status` + a per-vehicle task/waypoint summary.
 *
 * Single-topic display widget → the body is gated by {@link DatasourceGate}
 * (offline gating, §13). Follows the active mission from the selection store
 * unless the config pins a `mission_id`.
 */

/** Props for the MissionFeedback widget. */
interface MissionFeedbackProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	/** Pin to a fixed mission id; empty/absent → follow the active selection. */
	mission_id?: string;
}

/** Raw `c2_msgs/msg/MissionFeedback`: a wrapper around the JSON-string field. */
interface RawMissionFeedbackMsg {
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
function latestFeedback(
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
 * One per-vehicle task row.
 *
 * A hoisted (module-level) component so it can call {@link useAgentName} for the
 * vehicle's namespace name — hooks can't run inside the `.map` of the parent.
 * Its identity is stable across renders, so rows don't remount. The full
 * `vehicle_id` stays in the `title` tooltip.
 */
function TaskRow({ task, index }: { task: FeedbackTask; index: number }) {
	const name = useAgentName(task.vehicle_id);
	void index;
	return (
		<div className="border rounded-md p-2 text-xs">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium truncate" title={task.vehicle_id}>
					{name || "unknown vehicle"}
				</span>
				<span className="text-muted-foreground shrink-0">
					{task.waypoints.length} waypoint
					{task.waypoints.length === 1 ? "" : "s"}
				</span>
			</div>
			{task.est && (
				<div className="text-muted-foreground mt-1">
					ETA: {task.est}
				</div>
			)}
		</div>
	);
}

/** Body: parses the latest feedback, gates on health, filters by mission. */
function MissionFeedbackBody(props: {
	sourceTitle: string;
	missionId: string | null;
}) {
	const { sources, health } = useLocalDataSource();
	const feedback = latestFeedback(
		sources as Map<string, { data: unknown[] }>,
	);

	// Filter to the active/pinned mission when one is set; otherwise show
	// whatever the latest feedback carries.
	const matches =
		!props.missionId ||
		(feedback != null && feedback.mission_id === props.missionId);
	const shown = matches ? feedback : null;

	const pinnedName = useMissionName(props.missionId);
	const shownName = useMissionName(shown?.mission_id);

	return (
		<DatasourceGate health={health} title={props.sourceTitle}>
			<div className="h-full flex flex-col gap-2 p-3 text-sm">
				{shown == null ? (
					<div className="text-muted-foreground">
						{props.missionId
							? `Waiting for feedback for mission ${pinnedName}…`
							: "Waiting for mission feedback…"}
					</div>
				) : (
					<>
						<div className="flex items-center gap-2 shrink-0">
							<Badge variant="secondary">
								{missionStatusLabel(shown.status)}
							</Badge>
							{shown.issue != null && (
								<Badge variant="destructive">
									Issue {shown.issue}
								</Badge>
							)}
							<span
								className="text-xs text-muted-foreground truncate"
								title={shown.mission_id}
							>
								{shownName}
							</span>
						</div>
						<ScrollArea className="flex-1 min-h-0">
							<div className="flex flex-col gap-2 pr-2">
								{shown.tasks.length === 0 && (
									<div className="text-muted-foreground text-xs">
										No tasks reported.
									</div>
								)}
								{shown.tasks.map((task, index) => (
									<TaskRow
										key={`${task.vehicle_id}-${index}`}
										task={task}
										index={index}
									/>
								))}
							</div>
						</ScrollArea>
					</>
				)}
			</div>
		</DatasourceGate>
	);
}

/** Host: wires the selected topic into a local-datasource provider. */
const MissionFeedbackWidget: React.FC<MissionFeedbackProps> = (props) => {
	const active = useSelectedMission();
	const missionId = props.mission_id?.trim()
		? props.mission_id.trim()
		: active;

	return (
		<LocalDataSourcesProvider
			SelectedTopics={[props.topic]}
			buffersSize={1}
		>
			<MissionFeedbackBody
				sourceTitle={props.topic.source.title}
				missionId={missionId}
			/>
		</LocalDataSourcesProvider>
	);
};

/**
 * Widget definition for the mission-feedback widget (F10).
 * @returns Widget definition.
 */
export function MissionFeedbackDefinition(): WidgetDefinition<MissionFeedbackProps> {
	return {
		id: "c2-mission-feedback-widget",
		name: "C2 Mission Feedback",
		description:
			"Live mission status, tasks and waypoints from /multi_robot/mission_feedback",
		titleProp: "title",
		icon: <ListChecks />,

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
							acceptsRaw: ["c2_msgs/msg/MissionFeedback"],
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
			title: "Mission Feedback",
		},
		Component: MissionFeedbackWidget,
	} as WidgetDefinition<MissionFeedbackProps>;
}
