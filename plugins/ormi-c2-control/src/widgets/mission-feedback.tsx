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
import { Progress } from "@workspace/ui/components/progress";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { ListChecks } from "lucide-react";
import { useMemo, useState } from "react";

import { MissionFeedback } from "../types/mission-feedback";
import { missionStatusLabel } from "../types/status-labels";
import {
	describeFeedbackIssue,
	isPlannerReachabilityIssue,
} from "../types/issue-labels";
import { useAgentName } from "../state/c2-agents-store";
import {
	setSelectedMission,
	useSelectedMission,
} from "../state/selection-store";
import { useMissionName } from "../state/c2-catalog-store";
import {
	formatAge,
	useAllMissionFeedback,
	useFeedbackFreshness,
	useLiveMissionFeedback,
	useMissionFeedbackExact,
	useMissionFeedbackOrigin,
} from "../state/mission-feedback-store";
import { usePlannerState } from "../state/planner-state-store";
import { MissionFeedbackHistorySync } from "./feedback-history";
import { usePublishMissionFeedback } from "./mission-feedback-source";
import { PanelEmptyState } from "./panel-empty-state";
import { usePublishPlannerState } from "./planner-state-source";
import {
	MissionPhase,
	formatClock,
	isFeedbackStale,
	missionElapsedMs,
	missionEndedAt,
	missionPhase,
	sortMissions,
} from "./mission-progress";
import {
	hasEarlierRuns,
	missionEtaEnd,
	overallProgress,
	statusTone,
} from "./feedback-layout";
import {
	MissionGantt,
	RouteGraph,
	StatList,
	TONE_BADGE,
	TONE_COLOR,
} from "./mission-feedback-views";
import { AutoSelectActiveMission, activeMissions, useNow } from "./now-playing";
import {
	formatDistance,
	formatDuration,
	taskDistanceMeters,
} from "./plan-metrics";
import { atMost, useContainerSize } from "./responsive";

/**
 * Mission Feedback widget: what is playing, when, and where along the
 * route. Built from ORMI's own components (Select, Badge, Progress, Separator,
 * Tooltip, Button) and theme tokens; the charts are theme-coloured SVG.
 *
 * ```
 * ┌───────────────────────────────────────────────────────────────┐
 * │ Survey north ▾  [Started]                 Elapsed 5m 03s · ETA 15:31:10 │
 * │ ███████████████░░░░░░░░ 62 %   Remaining 1.2 km · updated 1s ago        │
 * │ Also running: (● Patrol B) (● Resupply)                                 │
 * │ ─────────────────────────────────────────────────────────────────────── │
 * │ TIMELINE                                          Show earlier runs     │
 * │            15:50        15:52   [now]   15:56                           │
 * │ Survey n…   ◆2           ◆                                              │
 * │ ● robot-a   ▕████████|███|███┆▨▨▨▨▨▏       (lanes scroll when many)     │
 * │ ─────────────────────────────────────────────────────────────────────── │
 * │ ROUTE                                                                   │
 * │ ● robot-a [Driving]  Passed 11 of 40 · Next WP 12                       │
 * │            Next WP 12 · 14 m                                            │
 * │ ■──●──●──●──●──◉─○──○──○──○──■        (long routes: whole-route track   │
 * │ Remaining 42 m · Speed 0.6 m/s · …     + zoomed strip around the robot) │
 * └───────────────────────────────────────────────────────────────┘
 * ```
 *
 * The mission name IS the picker (every known mission, live or stored); the
 * status appears once, as the pill. A finished mission shows a quiet "review"
 * tag; there are no banner sentences. Both views are always shown. The whole
 * body measures itself ({@link useContainerSize}) and re-flows from ~280 px.
 */

/** Props for the MissionFeedback widget. */
interface MissionFeedbackProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	/**
	 * OPTIONAL `/multi_robot/planner/state` topic (`std_msgs/String`). When set,
	 * the header says when the planner is still planning or failed.
	 */
	plannerTopic?: SelectedTopic;
	/** Pin to a fixed mission id; empty/absent → follow the active selection. */
	mission_id?: string;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/** Group headings for the picker, in display order. */
const PHASE_LABELS: Record<MissionPhase, string> = {
	active: "Active",
	pending: "Planned",
	finished: "Finished",
};

/** One picker entry in the OPEN list: name + status (hooks → hoisted). */
function MissionOption({ fb }: { fb: MissionFeedback }) {
	const name = useMissionName(fb.mission_id);
	return (
		<span className="flex items-center gap-2 min-w-0">
			<span className="truncate">{name}</span>
			<span className="text-muted-foreground text-xs">
				{missionStatusLabel(fb.status)}
			</span>
		</span>
	);
}

/**
 * The mission name as the picker: every known mission, grouped. The closed
 * trigger shows the NAME only — the status is the pill next to it, once.
 * Opening it refreshes the stored history.
 */
function MissionPicker(props: {
	selectedId: string | null;
	disabled: boolean;
	onOpen: () => void;
}) {
	const missions = useAllMissionFeedback();
	const sorted = useMemo(() => sortMissions(missions), [missions]);
	const selectedName = useMissionName(props.selectedId);
	const known = sorted.some((fb) => fb.mission_id === props.selectedId);
	const groups = (["active", "pending", "finished"] as MissionPhase[])
		.map((phase) => ({
			phase,
			items: sorted.filter((fb) => missionPhase(fb.status) === phase),
		}))
		.filter((g) => g.items.length > 0);
	return (
		<Select
			value={props.selectedId ?? ""}
			disabled={props.disabled}
			onValueChange={(value) => setSelectedMission(value || null)}
			onOpenChange={(open) => {
				if (open) props.onOpen();
			}}
		>
			<SelectTrigger
				size="sm"
				className="min-w-0 max-w-full border-transparent shadow-none px-2 text-sm font-semibold hover:bg-accent"
				title="Choose the mission to show"
			>
				<SelectValue placeholder="Select a mission…">
					{props.selectedId ? (
						<span className="truncate">{selectedName}</span>
					) : undefined}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{props.selectedId && !known && (
					<SelectItem value={props.selectedId}>
						<span className="truncate">{selectedName}</span>
					</SelectItem>
				)}
				{groups.map((g) => (
					<SelectGroup key={g.phase}>
						<SelectLabel>{PHASE_LABELS[g.phase]}</SelectLabel>
						{g.items.map((fb) => (
							<SelectItem
								key={fb.mission_id}
								value={fb.mission_id}
							>
								<MissionOption fb={fb} />
							</SelectItem>
						))}
					</SelectGroup>
				))}
				{groups.length === 0 && !props.selectedId && (
					<div className="px-2 py-1.5 text-sm text-muted-foreground">
						No mission known yet.
					</div>
				)}
			</SelectContent>
		</Select>
	);
}

/** A small badge-button for another active mission; click to show it. */
function OtherMissionPill({ fb }: { fb: MissionFeedback }) {
	const name = useMissionName(fb.mission_id);
	return (
		<Badge variant="outline" asChild>
			<button
				type="button"
				onClick={() => setSelectedMission(fb.mission_id)}
				className="cursor-pointer max-w-full"
				title={`${name} — ${missionStatusLabel(fb.status)}. Click to show it.`}
			>
				<span
					className="size-2 shrink-0 rounded-full"
					style={{
						backgroundColor: TONE_COLOR[statusTone(fb.status)],
					}}
					aria-hidden
				/>
				<span className="truncate">{name}</span>
			</button>
		</Badge>
	);
}

/** Header figures: elapsed, ETA, freshness — ticking on their own. */
function HeaderFacts(props: { fb: MissionFeedback; live: boolean }) {
	const { fb } = props;
	const now = useNow(1000);
	const freshness = useFeedbackFreshness(fb.mission_id);
	const elapsed = missionElapsedMs(fb, now);
	const phase = missionPhase(fb.status);
	const eta = phase === "active" ? missionEtaEnd(fb) : null;
	const stale = isFeedbackStale(freshness.stale, fb.status);
	const showFreshness =
		props.live && phase !== "finished" && freshness.ageMs != null;
	return (
		<StatList
			items={[
				[
					phase === "finished" ? "Took" : "Elapsed",
					elapsed != null ? formatDuration(elapsed / 1000) : null,
				],
				["ETA", eta ? formatClock(eta) : null],
				[
					stale ? "No update for" : "Updated",
					showFreshness ? (
						<span
							className={stale ? "text-destructive" : undefined}
						>
							{formatAge(freshness.ageMs)}
						</span>
					) : null,
				],
			]}
		/>
	);
}

/** Overall progress (ORMI `Progress`) + remaining distance; hidden when unknown. */
function OverallProgress({ fb }: { fb: MissionFeedback }) {
	const fraction = overallProgress(fb.tasks);
	if (fraction == null) return null;
	const pct = Math.round(fraction * 100);
	const remaining = fb.tasks.every((t) => t.remaining_m != null)
		? fb.tasks.reduce((sum, t) => sum + (t.remaining_m ?? 0), 0)
		: null;
	const total = fb.tasks.reduce((sum, t) => sum + taskDistanceMeters(t), 0);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
			<div className="flex items-center gap-2 flex-1 min-w-32">
				<Progress
					value={pct}
					aria-label="Mission progress"
					className="flex-1"
				/>
				<span className="text-xs font-medium tabular-nums">
					{pct} %
				</span>
			</div>
			<StatList
				items={[
					[
						"Remaining",
						remaining != null && remaining > 0
							? formatDistance(remaining)
							: null,
					],
					[
						"Route",
						remaining == null && total > 0
							? formatDistance(total)
							: null,
					],
				]}
			/>
		</div>
	);
}

/** One `issue_conflicts` entry: which robot is held by which mission. */
function ConflictLine(props: { vehicleId: string; missionId: string }) {
	const robot = useAgentName(props.vehicleId) || props.vehicleId;
	const mission = useMissionName(props.missionId || null);
	return (
		<p className="break-words">
			{robot} is in use
			{props.missionId ? (
				<>
					{" by "}
					<Button
						variant="link"
						className="h-auto p-0 text-xs text-inherit underline"
						onClick={() => setSelectedMission(props.missionId)}
					>
						{mission}
					</Button>
				</>
			) : null}
		</p>
	);
}

/** The whole header. */
function MissionHeader(props: {
	fb: MissionFeedback | null;
	missionId: string | null;
	pinned: boolean;
	plannerState: ReturnType<typeof usePlannerState>;
	onPickerOpen: () => void;
}) {
	const { fb, plannerState } = props;
	const origin = useMissionFeedbackOrigin(props.missionId);
	const live = useLiveMissionFeedback();
	const others = activeMissions(live).filter(
		(m) => m.mission_id !== props.missionId,
	);
	// The current issue, sharpened by the optional `issue_code` / `issue_message`
	// (e.g. "Vehicle busy" + "vehicle v1 is used by mission m2").
	const issue = fb ? describeFeedbackIssue(fb) : null;
	// A "planner unreachable" issue is contradicted when the planner itself says
	// it is planning or has planned — drop it rather than alarm.
	const showIssue =
		issue != null &&
		!(
			isPlannerReachabilityIssue(issue.code) &&
			(plannerState === "planning" || plannerState === "planned")
		);
	// The planner state only matters before the mission is committed; after that
	// it would read like a second status. Quiet text, never a badge.
	const pending = !fb || missionPhase(fb.status) === "pending";
	const plannerText =
		pending && plannerState === "planning"
			? "Planner is computing a plan…"
			: pending && plannerState === "failed"
				? "Planning failed"
				: null;
	const phase = fb ? missionPhase(fb.status) : null;
	const ended = fb && phase === "finished" ? missionEndedAt(fb) : null;

	return (
		<div className="flex flex-col gap-2 min-w-0">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
				<div className="min-w-0 max-w-full">
					<MissionPicker
						selectedId={props.missionId}
						disabled={props.pinned}
						onOpen={props.onPickerOpen}
					/>
				</div>
				{fb && (
					<Badge variant={TONE_BADGE[statusTone(fb.status)]}>
						{missionStatusLabel(fb.status)}
					</Badge>
				)}
				{fb && showIssue && (
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
				)}
				{phase === "finished" && (
					<Badge
						variant="outline"
						className="text-muted-foreground font-normal"
						title="This mission is over; you are reviewing its last report."
					>
						{ended ? `Finished ${formatClock(ended)}` : "Finished"}{" "}
						· review
					</Badge>
				)}
				{origin === "history" && (
					<Badge
						variant="outline"
						className="text-muted-foreground font-normal border-dashed"
						title="The C2's last stored snapshot — nothing has been heard live on this page."
					>
						stored
					</Badge>
				)}
				{plannerText && (
					<span
						className={`text-xs ${
							plannerState === "failed"
								? "text-destructive"
								: "text-muted-foreground"
						}`}
					>
						{plannerText}
					</span>
				)}
				{fb && (
					<div className="ml-auto min-w-0">
						<HeaderFacts fb={fb} live={origin === "live"} />
					</div>
				)}
			</div>
			{fb &&
				showIssue &&
				(issue.detail || fb.issue_conflicts?.length) && (
					<div
						className={`flex flex-col gap-0.5 text-xs ${
							issue.severity === "fail"
								? "text-destructive"
								: "text-warning"
						}`}
					>
						{issue.detail && (
							<p className="break-words">{issue.detail}</p>
						)}
						{(fb.issue_conflicts ?? []).map((c, i) => (
							<ConflictLine
								key={`${c.vehicle_id}-${i}`}
								vehicleId={c.vehicle_id}
								missionId={c.mission_id}
							/>
						))}
					</div>
				)}
			{fb && <OverallProgress fb={fb} />}
			{others.length > 0 && !props.pinned && (
				<div className="flex flex-wrap items-center gap-1.5 min-w-0">
					<span className="text-xs text-muted-foreground">
						{fb || props.missionId ? "Also running" : "Running"}
					</span>
					{others.map((m) => (
						<OtherMissionPill key={m.mission_id} fb={m} />
					))}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

/** Section title, in the muted small-caps used across ORMI panels. */
function SectionTitle(props: { children: string; action?: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{props.children}
			</span>
			{props.action}
		</div>
	);
}

/** The Gantt, fed with the selected mission first, then every live active one. */
function TimelineSection(props: {
	shown: MissionFeedback | null;
	selectedId: string | null;
}) {
	const live = useLiveMissionFeedback();
	const now = useNow(1000);
	const [earlierRuns, setEarlierRuns] = useState(false);
	const missions = useMemo(() => {
		const out: MissionFeedback[] = [];
		if (props.shown) out.push(props.shown);
		for (const m of activeMissions(live)) {
			if (m.mission_id !== props.shown?.mission_id) out.push(m);
		}
		return out;
	}, [live, props.shown]);
	if (missions.length === 0) return null;
	const canShowEarlier = missions.some(hasEarlierRuns);
	return (
		<section className="flex flex-col gap-1.5 min-w-0">
			<SectionTitle
				action={
					canShowEarlier || earlierRuns ? (
						<Button
							variant="link"
							size="sm"
							className="h-auto p-0 text-xs"
							onClick={() => setEarlierRuns((v) => !v)}
						>
							{earlierRuns
								? "Current run only"
								: "Show earlier runs"}
						</Button>
					) : undefined
				}
			>
				Timeline
			</SectionTitle>
			<MissionGantt
				missions={missions}
				selectedId={props.selectedId}
				now={now}
				earlierRuns={earlierRuns}
			/>
		</section>
	);
}

/** Body: publishes the feed, then renders header and both views. */
function MissionFeedbackBody(props: {
	feedbackTopic: SelectedTopic;
	missionId: string | null;
	pinned: boolean;
	plannerTopic?: SelectedTopic;
}) {
	const { sources, getSource, getTopicHealth } = useLocalDataSource();
	const [rootRef, box] = useContainerSize<HTMLDivElement>();

	// Gate ONLY on the feedback topic's own health, NOT the provider aggregate:
	// the OPTIONAL planner topic shares this provider, and an offline/absent
	// planner datasource must never blank the feedback widget.
	const health = getTopicHealth(props.feedbackTopic);

	// `/multi_robot/mission_feedback` is a SINGLE shared topic carrying feedback
	// for ALL missions, interleaved. Publish every message into the per-mission
	// feedback store (keyed by `mission_id`), then READ ONLY this widget's
	// mission slot: an interleaved message for another mission updates THAT slot
	// and never blanks the mission we show.
	usePublishMissionFeedback(
		sources as Map<string, { data: unknown[] }>,
		true,
	);

	// OPTIONAL planner-state topic, scoped to its OWN buffer (via `getSource`)
	// so feedback messages are never folded in.
	const plannerSource = props.plannerTopic
		? (getSource(props.plannerTopic) as { data: unknown[] } | undefined)
		: undefined;
	const plannerSources = useMemo(() => {
		const map = new Map<string, { data: unknown[] }>();
		if (plannerSource) map.set("planner", plannerSource);
		return map;
	}, [plannerSource]);
	usePublishPlannerState(plannerSources, Boolean(props.plannerTopic));

	// EXACTLY the shown mission — no "latest published" fallback.
	const shown = useMissionFeedbackExact(props.missionId);
	const plannerState = usePlannerState(props.missionId);
	const live = useLiveMissionFeedback();
	const anyActive = activeMissions(live).length > 0;

	// Bumped when the picker opens, to refresh the stored feedback history.
	const [historyRefresh, setHistoryRefresh] = useState(0);
	const pad = atMost("xs", box.size) ? "p-2" : "p-3";

	return (
		<DatasourceGate
			health={health}
			title={props.feedbackTopic.source.title}
		>
			{/* A pinned widget shows its own mission and never moves the
			    shared selection. */}
			<AutoSelectActiveMission enabled={!props.pinned} />
			{/* Finished missions stay reviewable after a reload: seed the
			    store from the C2's stored snapshots (live wins). */}
			<MissionFeedbackHistorySync
				selectedId={props.missionId}
				refreshKey={historyRefresh}
			/>
			<div
				ref={rootRef}
				className={`h-full min-w-0 flex flex-col gap-2 text-sm ${pad}`}
			>
				<ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
					<div className="flex flex-col gap-3 min-w-0">
						<MissionHeader
							fb={shown}
							missionId={props.missionId}
							pinned={props.pinned}
							plannerState={plannerState}
							onPickerOpen={() => setHistoryRefresh((n) => n + 1)}
						/>

						{shown == null && (
							<PanelEmptyState>
								{props.missionId
									? "No feedback for this mission yet, live or stored."
									: "Pick a mission above, or in the mission browser."}
							</PanelEmptyState>
						)}

						{(shown != null || anyActive) && (
							<>
								<Separator />
								<TimelineSection
									shown={shown}
									selectedId={props.missionId}
								/>
							</>
						)}
						{shown != null && (
							<>
								<Separator />
								<section className="flex flex-col gap-1.5 min-w-0">
									<SectionTitle>Route</SectionTitle>
									<RouteGraph fb={shown} />
								</section>
							</>
						)}
					</div>
				</ScrollArea>
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

	if (!props.topic) {
		return (
			<PanelEmptyState>
				Select a mission feedback topic in the widget configuration.
			</PanelEmptyState>
		);
	}

	return (
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={1}>
			<MissionFeedbackBody
				feedbackTopic={props.topic}
				missionId={missionId}
				pinned={Boolean(props.mission_id?.trim())}
				plannerTopic={props.plannerTopic}
			/>
		</LocalDataSourcesProvider>
	);
};

/**
 * Widget definition for the mission-feedback widget.
 * @returns Widget definition.
 */
export function MissionFeedbackDefinition(): WidgetDefinition<MissionFeedbackProps> {
	return {
		id: "c2-mission-feedback-widget",
		name: "C2 Mission Feedback",
		description:
			"Now playing, and a per-mission timeline of tasks and waypoints",
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
						role: "secondary",
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
