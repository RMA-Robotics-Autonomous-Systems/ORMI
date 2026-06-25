"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	LocalDataSourcesProvider,
	RemoteCallDefinition,
	SelectedTopic,
	useAvailableRemoteCalls,
	useLocalDataSource,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import {
	CheckCircle2,
	Pause,
	Play,
	Rocket,
	Send,
	Square,
	Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { C2Call } from "../datasource/remote-calls";
import { MissionStatus } from "../types/c2-types";
import {
	MissionFeedback,
	parseMissionFeedback,
} from "../types/mission-feedback";
import { missionStatusLabel } from "../types/status-labels";
import {
	MissionConfigIssue,
	validateMissionConfig,
} from "../types/mission-config-validation";
import { useSelectedMission } from "../state/selection-store";
import { newMissionStub, normalizeMissions } from "./mission-list";
import { MissionIssueList } from "./mission-issues";
import {
	AllowedActions,
	ControlAction,
	allowedActions,
} from "./control-actions";

/**
 * F8 — Lifecycle control panel widget.
 *
 * Drives the mission lifecycle through the C2 command remote calls (`:5001`,
 * §2.2/§11): Submit (`c2.mission.init`) → Approve (`c2.mission.approve`) → Start
 * / Pause / Stop / Delete (`c2.mission.{start,pause,stop,delete}`).
 *
 * Button enablement follows the **live** `MissionStatus` (from
 * `/multi_robot/mission_feedback`, parsed by S2) via {@link allowedActions}, and
 * enforces **Approve-before-Start** in the UI (§2.2/§2.6). It operates on the
 * **active mission only** — `:5001` is a single-mission surface (§2.2): Submit is
 * the action that targets that surface at the active mission.
 *
 * ⚠ **Open item (Phase-0, §7):** whether `:5001 change_status` always targets the
 * last-`initialize`d mission, and whether re-`initialize` is required to retarget,
 * is unconfirmed. This panel therefore treats **Submit/initialize as the act of
 * targeting `:5001`** at the active mission, and does NOT silently retarget the
 * command surface when the operator switches the active mission — the operator
 * must Submit again. The `change_status` calls carry **no `mission_id`** (per the
 * §11 catalog); do not add one.
 *
 * Command widget → it surfaces remote-call errors inline and does NOT blank on
 * offline (§13). Gated on a C2 datasource via `WIDGET_LIST_WITH_DATASOURCE`.
 */

/** Props for the MissionControlPanel widget. */
interface MissionControlPanelProps extends Record<string, unknown> {
	title: string;
	/** `/multi_robot/mission_feedback` topic — live status drives gating. */
	topic?: SelectedTopic;
	/** Pin to a fixed mission id; empty/absent → follow the active selection. */
	mission_id?: string;
	/** Pin to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
}

/** Per-topic buffered source shape used here. */
interface BufferedSource {
	data: unknown[];
}

/** Raw `c2_msgs/msg/MissionFeedback` wrapper around the JSON-string field. */
interface RawMissionFeedbackMsg {
	mission_id?: string;
	mission_feedback?: string;
}

/** Pull the latest typed feedback from the local-datasource sources map. */
function latestFeedback(
	sources: Map<string, BufferedSource>,
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

/** Resolve a C2 call definition by name. */
function findCall(
	calls: RemoteCallDefinition[],
	name: string,
): RemoteCallDefinition | undefined {
	return calls.find((call) => call.name === name);
}

/** A single lifecycle command button. */
function CommandButton(props: {
	label: string;
	icon: React.ReactNode;
	variant?: "default" | "outline" | "destructive";
	enabled: boolean;
	pending: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			size="sm"
			variant={props.variant ?? "outline"}
			disabled={!props.enabled || props.pending}
			onClick={props.onClick}
			className="flex-1 min-w-[5rem]"
		>
			{props.icon}
			<span className="ml-1">{props.label}</span>
		</Button>
	);
}

/** Inner body: reads live status, resolves command calls, drives the lifecycle. */
function ControlPanelBody(props: {
	calls: RemoteCallDefinition[];
	/** Guaranteed-present `c2.mission.init` definition (host gates on it). */
	initDef: RemoteCallDefinition;
	missionId: string | null;
	hasTopic: boolean;
}) {
	const { sources, health } = useLocalDataSource();
	const feedback = props.hasTopic
		? latestFeedback(sources as Map<string, BufferedSource>)
		: null;

	// Live status for the active/pinned mission (when feedback carries one).
	const matchesMission =
		!props.missionId ||
		(feedback != null && feedback.mission_id === props.missionId);
	const liveStatus: MissionStatus | null =
		matchesMission && feedback ? feedback.status : null;

	const allowed: AllowedActions = useMemo(
		() => allowedActions(liveStatus),
		[liveStatus],
	);

	// Resolve the command + list calls (list is used to source the Submit config).
	const { initDef } = props;
	const approveDef = findCall(props.calls, C2Call.MissionApprove);
	const startDef = findCall(props.calls, C2Call.MissionStart);
	const pauseDef = findCall(props.calls, C2Call.MissionPause);
	const stopDef = findCall(props.calls, C2Call.MissionStop);
	const deleteDef = findCall(props.calls, C2Call.MissionDelete);
	const listDef = findCall(props.calls, C2Call.MissionsList);

	// `useRemoteCall` requires a definition; `initDef` is always present (the host
	// gates the whole panel on it), so it doubles as the fallback for any command
	// that is momentarily unavailable. Buttons are disabled when the real
	// definition is missing, so that fallback never actually fires.
	const init = useRemoteCall<
		{ mission_id: string; mission_config: unknown },
		unknown
	>(initDef);
	const approve = useRemoteCall(approveDef ?? initDef);
	const start = useRemoteCall(startDef ?? initDef);
	const pause = useRemoteCall(pauseDef ?? initDef);
	const stop = useRemoteCall(stopDef ?? initDef);
	const del = useRemoteCall(deleteDef ?? initDef);
	const list = useRemoteCall<Record<string, never>, unknown>(
		listDef ?? initDef,
	);

	const [busy, setBusy] = useState<ControlAction | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [issues, setIssues] = useState<MissionConfigIssue[]>([]);

	/** Run a no-payload change_status command, surfacing status/error. */
	const runCommand = useCallback(
		async (
			action: ControlAction,
			call: ReturnType<typeof useRemoteCall>,
			def: RemoteCallDefinition | undefined,
		) => {
			if (!def) {
				setError(`${action} is unavailable on this datasource`);
				return;
			}
			setBusy(action);
			setError(null);
			setMessage(null);
			const result = await call.execute({});
			setBusy(null);
			if (!result.success) {
				setError(result.error ?? `${action} failed`);
				return;
			}
			setMessage(`${action} sent`);
		},
		[],
	);

	/**
	 * Submit/initialize: targets `:5001` at the active mission. Sources the
	 * mission config from the stored definition (`c2.missions.list`) when found;
	 * otherwise submits a minimal stub (full authoring is F5/Phase 4).
	 */
	const handleSubmit = useCallback(async () => {
		if (!initDef) {
			setError("c2.mission.init is unavailable on this datasource");
			return;
		}
		if (!props.missionId) {
			setError("Select a mission first (no active mission).");
			return;
		}
		setBusy("submit");
		setError(null);
		setMessage(null);
		setIssues([]);

		// Try to load the stored mission config for the active mission.
		let missionConfig: unknown = null;
		if (listDef) {
			const listed = await list.execute({});
			if (listed.success) {
				const row = normalizeMissions(listed.data).find(
					(r) => r.mission_id === props.missionId,
				);
				if (row) missionConfig = row.raw;
			}
		}
		// Fallback: a minimal config under the active mission id.
		if (missionConfig == null) {
			missionConfig = newMissionStub(
				"Mission",
				undefined,
				props.missionId,
			);
		}

		// Hard gate: never submit a config the C2 planner would reject/crash on.
		const found = validateMissionConfig(missionConfig);
		setIssues(found);
		if (found.some((issue) => issue.severity === "error")) {
			setBusy(null);
			setError(
				"This mission config cannot be submitted — fix the errors below.",
			);
			return;
		}

		const result = await init.execute({
			mission_id: props.missionId,
			mission_config: missionConfig,
		});
		setBusy(null);
		if (!result.success) {
			setError(result.error ?? "Submit failed");
			return;
		}
		setMessage("Mission submitted (initialize)");
	}, [initDef, listDef, props.missionId, init, list]);

	return (
		<div className="h-full flex flex-col gap-3 p-3 text-sm">
			{/* Status header */}
			<div className="flex items-center gap-2 shrink-0">
				<Badge variant="secondary">
					{missionStatusLabel(liveStatus)}
				</Badge>
				{props.missionId ? (
					<span
						className="text-xs text-muted-foreground truncate"
						title={props.missionId}
					>
						{props.missionId}
					</span>
				) : (
					<span className="text-xs text-muted-foreground">
						No active mission
					</span>
				)}
				<div className="flex-1" />
				{props.hasTopic && (
					<Badge
						variant={health === "online" ? "default" : "outline"}
						className="text-xs"
					>
						feedback: {health}
					</Badge>
				)}
			</div>

			<Separator />

			{/* Lifecycle commands */}
			<div className="flex flex-col gap-2 shrink-0">
				<div className="flex gap-2 flex-wrap">
					<CommandButton
						label="Submit"
						icon={<Send className="w-3.5 h-3.5" />}
						variant="default"
						enabled={allowed.submit && Boolean(initDef)}
						pending={busy === "submit"}
						onClick={() => void handleSubmit()}
					/>
					<CommandButton
						label="Approve"
						icon={<CheckCircle2 className="w-3.5 h-3.5" />}
						variant="default"
						enabled={allowed.approve && Boolean(approveDef)}
						pending={busy === "approve"}
						onClick={() =>
							void runCommand("approve", approve, approveDef)
						}
					/>
					<CommandButton
						label="Start"
						icon={<Play className="w-3.5 h-3.5" />}
						enabled={allowed.start && Boolean(startDef)}
						pending={busy === "start"}
						onClick={() =>
							void runCommand("start", start, startDef)
						}
					/>
				</div>
				<div className="flex gap-2 flex-wrap">
					<CommandButton
						label="Pause"
						icon={<Pause className="w-3.5 h-3.5" />}
						enabled={allowed.pause && Boolean(pauseDef)}
						pending={busy === "pause"}
						onClick={() =>
							void runCommand("pause", pause, pauseDef)
						}
					/>
					<CommandButton
						label="Stop"
						icon={<Square className="w-3.5 h-3.5" />}
						enabled={allowed.stop && Boolean(stopDef)}
						pending={busy === "stop"}
						onClick={() => void runCommand("stop", stop, stopDef)}
					/>
					<CommandButton
						label="Delete"
						icon={<Trash2 className="w-3.5 h-3.5" />}
						variant="destructive"
						enabled={allowed.delete && Boolean(deleteDef)}
						pending={busy === "delete"}
						onClick={() =>
							void runCommand("delete", del, deleteDef)
						}
					/>
				</div>
			</div>

			{/* Feedback / errors — never swallowed (§ task). */}
			{error && (
				<div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md shrink-0">
					{error}
				</div>
			)}
			<MissionIssueList
				issues={issues}
				title="Mission config validation"
			/>
			{message && !error && (
				<div className="text-xs text-muted-foreground shrink-0">
					{message}
				</div>
			)}
			{!props.hasTopic && (
				<div className="text-xs text-muted-foreground shrink-0">
					No feedback topic configured — buttons gate conservatively
					(Submit only). Add the mission-feedback topic for full
					state-aware control.
				</div>
			)}
		</div>
	);
}

/**
 * Host: resolves command calls from the available remote calls (optionally
 * pinned to a datasource) and wires the optional mission-feedback topic into a
 * local-datasource provider so the body reads live status.
 */
const MissionControlPanelWidget: React.FC<MissionControlPanelProps> = (
	props,
) => {
	const active = useSelectedMission();
	const missionId = props.mission_id?.trim()
		? props.mission_id.trim()
		: active;

	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);

	const initDef = useMemo(() => findCall(calls, C2Call.MissionInit), [calls]);

	if (!initDef) {
		return (
			<div className="h-full flex items-center justify-center p-3 text-sm text-muted-foreground text-center">
				No C2 datasource available. Add a C2 Control datasource to
				control missions.
			</div>
		);
	}

	const topics = props.topic ? [props.topic] : [];

	return (
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={1}>
			<ControlPanelBody
				calls={calls}
				initDef={initDef}
				missionId={missionId}
				hasTopic={Boolean(props.topic)}
			/>
		</LocalDataSourcesProvider>
	);
};

/**
 * Widget definition for the lifecycle control panel widget (F8).
 * @returns Widget definition.
 */
export function MissionControlPanelDefinition(): WidgetDefinition<MissionControlPanelProps> {
	return {
		id: "c2-mission-control-panel-widget",
		name: "C2 Mission Control",
		description:
			"Submit → Approve → Start / Pause / Stop / Delete the active mission; buttons gate on live MissionStatus",
		titleProp: "title",
		icon: <Rocket />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				topic: { type: "object", title: "Mission feedback topic" },
				mission_id: {
					type: "string",
					title: "Pinned mission id (optional)",
				},
				datasource_id: {
					type: "string",
					title: "C2 datasource id (optional)",
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
					type: "Control",
					scope: "#/properties/mission_id",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/datasource_id",
				} as ControlElement,
			],
		} as VerticalLayout,

		data: {
			title: "Mission Control",
		},
		Component: MissionControlPanelWidget,
	} as WidgetDefinition<MissionControlPanelProps>;
}
