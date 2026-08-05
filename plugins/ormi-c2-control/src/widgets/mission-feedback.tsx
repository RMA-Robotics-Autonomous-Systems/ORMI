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
import { useMemo } from "react";

import { FeedbackTask } from "../types/mission-feedback";
import { missionStatusLabel } from "../types/status-labels";
import {
	getMissionIssue,
	isPlannerReachabilityIssue,
} from "../types/issue-labels";
import { useSelectedMission } from "../state/selection-store";
import { useMissionName } from "../state/c2-catalog-store";
import { useAgentName } from "../state/c2-agents-store";
import { useMissionFeedback } from "../state/mission-feedback-store";
import { usePlannerState } from "../state/planner-state-store";
import { plannerStateBadge } from "../types/planner-state-labels";
import { usePublishMissionFeedback } from "./mission-feedback-source";
import { usePublishPlannerState } from "./planner-state-source";
import {
	formatDistance,
	formatDuration,
	planSummary,
	taskDistanceMeters,
	taskDurationSeconds,
	vehicleColor,
} from "./plan-metrics";

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
	/**
	 * OPTIONAL `/multi_robot/planner/state` topic (`std_msgs/String`). When set,
	 * the widget surfaces the active mission's PLANNING state (Planning… /
	 * Planned / Planning failed) as a badge — independent of the mission-feedback
	 * status. Absent → no planner badge.
	 */
	plannerTopic?: SelectedTopic;
	/** Pin to a fixed mission id; empty/absent → follow the active selection. */
	mission_id?: string;
}

/**
 * One per-vehicle task row — the operator's "what robot does what" line.
 *
 * A hoisted (module-level) component so it can call {@link useAgentName} for the
 * vehicle's namespace name — hooks can't run inside the `.map` of the parent.
 * Its identity is stable across renders, so rows don't remount. A colour swatch
 * (from {@link vehicleColor}) matches this vehicle's route colour on the mission
 * map; the row also shows the waypoint count, route distance, duration (or "—"
 * when no etas), and the planner `est` if present. The full `vehicle_id` stays
 * in the `title` tooltip.
 */
function TaskRow({ task }: { task: FeedbackTask }) {
	const name = useAgentName(task.vehicle_id);
	const color = vehicleColor(task.vehicle_id);
	const waypoints = task.waypoints.length;
	const distance = formatDistance(taskDistanceMeters(task));
	const duration = formatDuration(taskDurationSeconds(task));
	return (
		<div className="border rounded-md p-2 text-xs">
			<div className="flex items-center gap-2">
				<span
					className="h-3 w-3 shrink-0 rounded-full border border-black/10"
					style={{ backgroundColor: color }}
					aria-hidden
				/>
				<span
					className="font-medium truncate flex-1"
					title={task.vehicle_id}
				>
					{name || "unknown vehicle"}
				</span>
				<span className="text-muted-foreground shrink-0">
					{waypoints} waypoint{waypoints === 1 ? "" : "s"}
				</span>
			</div>
			<div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
				<span>{distance}</span>
				<span>{duration}</span>
				{task.est && <span>ETA: {task.est}</span>}
			</div>
		</div>
	);
}

/**
 * Plan summary header — `{N} vehicles · {distance} · make-span {makespan}`.
 *
 * A hoisted, hookless presentation component (Pattern #10). Derived once from
 * the shown tasks via {@link planSummary}.
 */
function PlanSummaryHeader({ tasks }: { tasks: FeedbackTask[] }) {
	const summary = planSummary(tasks);
	return (
		<div className="text-xs text-muted-foreground shrink-0">
			{summary.vehicleCount} vehicle
			{summary.vehicleCount === 1 ? "" : "s"} ·{" "}
			{formatDistance(summary.totalDistanceMeters)} · make-span{" "}
			{formatDuration(summary.makespanSeconds)}
		</div>
	);
}

/**
 * Planner-state badge — surfaces the active mission's PLANNING state.
 *
 * Hoisted, hookless presentation component (Pattern #10). Renders nothing for
 * the pre-planning / unknown states; a destructive badge on `failed`. Carries a
 * tooltip with an actionable reason (the planner emits no error string).
 */
function PlannerBadge({
	state,
}: {
	state: ReturnType<typeof usePlannerState>;
}) {
	const badge = plannerStateBadge(state);
	if (!badge) return null;
	return (
		<Badge
			variant={badge.tone === "fail" ? "destructive" : "outline"}
			title={badge.description}
		>
			{badge.label}
		</Badge>
	);
}

/** Body: parses the latest feedback, gates on health, filters by mission. */
function MissionFeedbackBody(props: {
	feedbackTopic: SelectedTopic;
	missionId: string | null;
	plannerTopic?: SelectedTopic;
}) {
	const { sources, getSource, getTopicHealth } = useLocalDataSource();

	// Gate ONLY on the feedback topic's own health, NOT the provider aggregate:
	// the OPTIONAL planner topic shares this provider, and an offline/absent
	// planner datasource must never blank the feedback widget.
	const health = getTopicHealth(props.feedbackTopic);

	// `/multi_robot/mission_feedback` is a SINGLE shared topic carrying feedback
	// for ALL missions, interleaved. Parse the latest message and PUBLISH it into
	// the per-mission feedback store (keyed by `mission_id`), then READ ONLY this
	// widget's mission slot. An interleaved message for another mission updates
	// THAT slot and never blanks the mission we show, so there's no A→"Waiting…"→A
	// flicker. The store also keeps each mission's value reference-stable while its
	// rendered plan is unchanged (deduped on `feedbackPlanSignature`), so the
	// memoised task list / summary subtree below doesn't churn on every identical
	// republish. (Mirrors the per-agent map-marker fix — same interleave bug.)
	usePublishMissionFeedback(
		sources as Map<string, { data: unknown[] }>,
		true,
	);

	// `/multi_robot/planner/state` is an OPTIONAL second topic carrying the
	// PLANNING state for ALL missions interleaved. Scope the parse to the planner
	// topic's OWN buffer (via `getSource`) so feedback messages are never folded
	// in, publish it into the per-mission planner-state store, then read ONLY this
	// widget's mission slot below.
	const plannerSource = props.plannerTopic
		? (getSource(props.plannerTopic) as { data: unknown[] } | undefined)
		: undefined;
	const plannerSources = useMemo(() => {
		const map = new Map<string, { data: unknown[] }>();
		if (plannerSource) map.set("planner", plannerSource);
		return map;
	}, [plannerSource]);
	usePublishPlannerState(plannerSources, Boolean(props.plannerTopic));

	const shown = useMissionFeedback(props.missionId);
	const plannerState = usePlannerState(props.missionId);

	const pinnedName = useMissionName(props.missionId);
	const shownName = useMissionName(shown?.mission_id);

	return (
		<DatasourceGate
			health={health}
			title={props.feedbackTopic.source.title}
		>
			<div className="h-full flex flex-col gap-2 p-3 text-sm">
				{shown == null ? (
					<div className="flex flex-col gap-2">
						{/* Surface a planning state even before any feedback
						    arrives — a planner FAILURE has no other UI tell. */}
						<PlannerBadge state={plannerState} />
						<div className="text-muted-foreground">
							{props.missionId
								? `Waiting for feedback for mission ${pinnedName}…`
								: "Waiting for mission feedback…"}
						</div>
					</div>
				) : (
					<>
						<div className="flex items-center gap-2 shrink-0">
							<Badge variant="secondary">
								{missionStatusLabel(shown.status)}
							</Badge>
							<PlannerBadge state={plannerState} />
							{(() => {
								const issue = getMissionIssue(shown.issue);
								if (!issue) return null;
								// Reconcile a "swarm planner unreachable" issue
								// (14/23) against the planner's OWN live state:
								// when it is actively planning or has planned, the
								// planner is demonstrably reachable, so a stale /
								// false disconnect from mission_feedback is
								// contradicted by an authoritative signal — drop it
								// instead of alarming the operator.
								if (
									isPlannerReachabilityIssue(issue.code) &&
									(plannerState === "planning" ||
										plannerState === "planned")
								) {
									return null;
								}
								return (
									<Badge
										variant={
											issue.severity === "fail"
												? "destructive"
												: "outline"
										}
										title={issue.description}
									>
										{issue.label}
									</Badge>
								);
							})()}
							<span
								className="text-xs text-muted-foreground truncate"
								title={shown.mission_id}
							>
								{shownName}
							</span>
						</div>
						{shown.tasks.length > 0 && (
							<PlanSummaryHeader tasks={shown.tasks} />
						)}
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

	// Stable across parent re-renders: a fresh `[props.topic]` literal every
	// render makes LocalDataSourcesProvider re-subscribe (unsubscribe→subscribe),
	// flapping health and flickering the widget (AGENTS.md subscription-thrash
	// rule). Key the array on the topic identities instead. The OPTIONAL planner
	// topic rides the same provider (so its buffer is scoped via `getSource`); its
	// own health is NOT gated — a missing planner topic must not blank the widget.
	const topics = useMemo(
		() =>
			props.plannerTopic
				? [props.topic, props.plannerTopic]
				: [props.topic],
		[props.topic, props.plannerTopic],
	);

	return (
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={1}>
			<MissionFeedbackBody
				feedbackTopic={props.topic}
				missionId={missionId}
				plannerTopic={props.plannerTopic}
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
		description: "Live mission status and waypoints",
		titleProp: "title",
		icon: <ListChecks />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				topic: { type: "object", title: "Topic" },
				plannerTopic: {
					type: "object",
					title: "Planner state topic (optional)",
				},
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
					type: "TopicSelect",
					scope: "#/properties/plannerTopic",
					options: {
						dataRequirements: {
							accepts: [],
							acceptsRaw: ["std_msgs/msg/String"],
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
