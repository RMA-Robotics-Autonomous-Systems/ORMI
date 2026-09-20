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
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import {
	CheckCircle2,
	Loader2,
	Pause,
	Play,
	Rocket,
	Send,
	Square,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { c2DatasourceSelectHook } from "../datasource/datasource-select";
import { C2Call } from "../datasource/remote-calls";
import {
	C2ErrorCode,
	c2ResultCode,
	c2ResultConflicts,
	formatVehicleBusy,
} from "../datasource/response";
import { MissionStatus } from "../types/c2-types";
import { missionStatusLabel } from "../types/status-labels";
import {
	MissionConfigIssue,
	validateMissionConfig,
} from "../types/mission-config-validation";
import { useSelectedMission } from "../state/selection-store";
import { findMissionName, useMissionName } from "../state/c2-catalog-store";
import { findAgentName } from "../state/c2-agents-store";
import {
	formatAge,
	getLiveMissionFeedback,
	subscribe as subscribeMissionFeedback,
	useFeedbackFreshness,
	useLiveMissionFeedbackFor,
	useMissionFeedbackExact,
} from "../state/mission-feedback-store";
import {
	getMissionDraft,
	isMissionDraftDirty,
	useMissionDraft,
	useMissionDraftDirty,
} from "../state/mission-draft-store";
import { usePublishMissionFeedback } from "./mission-feedback-source";
import { useContainerSize } from "./responsive";
import { isFeedbackStale } from "./mission-progress";
import { normalizeMissions } from "./mission-list";
import { MissionIssueList } from "./mission-issues";
import {
	AllowedActions,
	ControlAction,
	canSubmit,
	displayedStatus,
	gatedActions,
	gatingStatus,
	isCommandConfirmed,
	isMissionIdle,
	missionConfigSignature,
	primaryAction,
} from "./control-actions";
import { PanelEmptyState } from "./panel-empty-state";
import { MissionStateMachine } from "./mission-state-machine";
import { planSubmit, submitMessage } from "./submit-config";
import { useAsyncAction } from "./use-async-action";

/**
 * Lifecycle control panel widget.
 *
 * Drives the mission lifecycle through the C2 command remote calls (`:5001`):
 * Submit (`c2.mission.init`) → Approve (`c2.mission.approve`) → Start / Pause /
 * Stop / Delete (`c2.mission.{start,pause,stop,delete}`).
 *
 * Button enablement follows the **live** `MissionStatus` (from
 * `/multi_robot/mission_feedback`) via {@link gatedActions}, and enforces
 * **Approve-before-Start** in the UI. It operates on the **active mission only**
 * — `:5001` is a single-mission surface: Submit is the action that targets that
 * surface at the active mission. The status it DISPLAYS may be the last known
 * one ({@link displayedStatus}), labelled as not live; it never gates on it.
 *
 * **Targeting.** Every `change_status` call carries `mission_id` — deliberately,
 * and the catalog in `datasource/remote-calls.ts` says so too. Omitting it made
 * `:5001` command whatever it had last `initialize`d, which is nothing at all
 * after a `c2-backend-ros2-node` restart: a running mission became unstoppable
 * while the UI still printed "stop sent". The backend honours `mission_id` and
 * falls back to the old global only when it is absent. Do not remove it.
 *
 * **No mission selected ⇒ no commands.** With nothing selected there is no target
 * to name, so every lifecycle button is disabled. The feedback store hands back
 * the LATEST mission's feedback when no id is pinned; that value is display-only
 * here (clearly labelled as another mission's), and never gates an action —
 * showing an enabled Stop for a mission the operator has not selected is how this
 * panel used to offer to stop the wrong robot.
 *
 * Command widget → it surfaces remote-call errors inline and does NOT blank on
 * offline. Gated on a C2 datasource via `WIDGET_LIST_WITH_DATASOURCE`.
 */

/**
 * How long a dispatched command waits for its mission's feedback to confirm it
 * before it is reported as NOT confirmed. Only ever armed when a feedback topic
 * exists that could confirm it (see `armTransition`).
 */
const AWAIT_C2_TIMEOUT_MS = 25_000;

/**
 * A dispatched command held until its mission's feedback confirms it. Everything
 * the notice needs is captured at dispatch, so it still names the right mission
 * after the operator has moved on to another.
 */
interface PendingCommand {
	missionId: string;
	/** The mission's name at dispatch, for the notice. */
	missionName: string;
	action: ControlAction;
	/** The live status when it was sent (null when none was known). */
	fromStatus: MissionStatus | null;
	/** `Date.now()` past which it is reported as not confirmed. */
	deadline: number;
}

/** What this panel knows about the C2's copy of one mission. */
interface SubmitRecord {
	missionId: string;
	/** Signature last submitted (or seeded), null when none is known. */
	sig: string | null;
	/** The C2 answered `NO_TARGET_MISSION`: it holds no runtime for it. */
	noTarget: boolean;
}

/** An operator-facing note, bound to the mission it is about (null: none). */
interface ScopedNote {
	missionId: string | null;
	text: string;
}

/** Stable empty issue list (no fresh array identity per render). */
const NO_ISSUES: MissionConfigIssue[] = [];

/** Commands whose silence means a robot may still be moving. */
function leavesRobotMoving(action: ControlAction): boolean {
	return action === "stop" || action === "pause";
}

/**
 * Run `fn` unless one is already in flight for `target` — a per-mission
 * re-entry guard (the Stop latch). `onChange(true/false)` mirrors it for
 * display. Module-level so the `try`/`finally` stays out of the compiled
 * component.
 *
 * @param latchRef - Ref to the synchronous set of targets in flight.
 * @param target - The mission this run is for.
 * @param fn - The async work.
 * @param onChange - Called with true when it starts and false when it settles.
 */
async function runLatchedPerMission(
	latchRef: { readonly current: Set<string> },
	target: string,
	fn: () => Promise<void>,
	onChange: (active: boolean) => void,
): Promise<void> {
	const latch = latchRef.current;
	if (latch.has(target)) return;
	latch.add(target);
	onChange(true);
	try {
		await fn();
	} finally {
		latch.delete(target);
		onChange(false);
	}
}

/**
 * A command held from now until its mission's feedback confirms it. Module-level
 * because it reads the clock: the React Compiler cannot prove a function built
 * in the component body only ever runs from an event, and rejects `Date.now()`
 * there by opting the whole panel out of compilation.
 *
 * @param action - The command sent.
 * @param missionId - The mission it targeted.
 * @param missionName - That mission's name, for the notice.
 * @param fromStatus - The live status it was sent from.
 * @returns The held command, its deadline `AWAIT_C2_TIMEOUT_MS` from now.
 */
function holdCommand(
	action: ControlAction,
	missionId: string,
	missionName: string,
	fromStatus: MissionStatus | null,
): PendingCommand {
	return {
		missionId,
		missionName,
		action,
		fromStatus,
		deadline: Date.now() + AWAIT_C2_TIMEOUT_MS,
	};
}

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

/**
 * Badge variant for a datasource health reading: a status, so it is coloured by
 * meaning (never the default fill, which reads as a button).
 */
function healthBadgeVariant(
	health: string,
): "success" | "warning" | "destructive" {
	if (health === "online") return "success";
	if (health === "offline") return "destructive";
	return "warning";
}

/** Resolve a C2 call definition by name. */
function findCall(
	calls: RemoteCallDefinition[],
	name: string,
): RemoteCallDefinition | undefined {
	return calls.find((call) => call.name === name);
}

/**
 * A single lifecycle command button. Outlined unless it is the panel's next
 * step (`primary`, the one filled button) or the safety control (`destructive`).
 * A `danger` button is outlined with destructive text: a teardown that is
 * confirmed in a dialog, so it reads as dangerous without competing with Stop.
 */
function CommandButton(props: {
	label: string;
	icon: React.ReactNode;
	tone?: "primary" | "destructive" | "danger";
	enabled: boolean;
	pending: boolean;
	onClick: () => void;
	/** Tooltip, when the label alone does not say enough. */
	title?: string;
}) {
	const variant =
		props.tone === "primary"
			? "default"
			: props.tone === "destructive"
				? "destructive"
				: "outline";
	return (
		<Button
			size="sm"
			variant={variant}
			disabled={!props.enabled || props.pending}
			onClick={props.onClick}
			title={props.title}
			className={`flex-1 min-w-fit ${props.tone === "danger" ? "text-destructive hover:text-destructive" : ""}`}
		>
			{props.pending ? <Loader2 className="animate-spin" /> : props.icon}
			{props.label}
		</Button>
	);
}

/**
 * A command the C2 has not confirmed. For this mission it appears once the
 * window has closed; for another mission it appears as soon as the operator
 * moves away from it. Stop and Pause are destructive-toned: silence there means
 * a robot may still be moving.
 */
function UnconfirmedNotice(props: {
	pending: PendingCommand;
	/** The command targeted a mission other than the one on screen. */
	other?: boolean;
	onDismiss: (missionId: string) => void;
}) {
	const { pending } = props;
	const label = pending.action.toUpperCase();
	const moving = leavesRobotMoving(pending.action);
	const seconds = Math.round(AWAIT_C2_TIMEOUT_MS / 1000);
	const text = props.other
		? `${label} for "${pending.missionName}" is still unconfirmed by the C2.${moving ? " The robot may still be moving — check it." : ""}`
		: moving
			? `C2 did not confirm ${label} for "${pending.missionName}" within ${seconds} s — the robot may still be moving. Check the robot.`
			: `C2 did not confirm ${label} for "${pending.missionName}" within ${seconds} s. Check its mission feedback before retrying.`;
	return (
		<div
			role={moving ? "alert" : "status"}
			className={`flex items-start gap-2 text-xs p-2 rounded-md shrink-0 ${
				moving
					? "text-destructive bg-destructive/10"
					: "text-warning bg-warning/10"
			}`}
		>
			<span className="flex-1 min-w-0">{text}</span>
			<Button
				size="sm"
				variant="ghost"
				className="shrink-0"
				onClick={() => props.onDismiss(pending.missionId)}
			>
				Dismiss
			</Button>
		</div>
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
	const missionName = useMissionName(props.missionId);
	const [rootRef, { size }] = useContainerSize<HTMLDivElement>();
	const narrow = size === "xs";

	// `/multi_robot/mission_feedback` is a SINGLE shared topic carrying feedback
	// for ALL missions, interleaved. Parse the latest message and PUBLISH it into
	// the per-mission feedback store (keyed by `mission_id`), then READ ONLY this
	// panel's mission slot. Publishing is gated on `props.hasTopic` so a panel with
	// no feedback topic configured publishes nothing — preserving the "no topic →
	// no live status" contract. Reading the per-mission slot (instead of the size-1
	// buffer tail) means an interleaved message for ANOTHER mission updates THAT
	// slot and never blanks the status/buttons for the mission we control — no
	// A→null→A flicker that momentarily dropped the badge and disabled the buttons.
	usePublishMissionFeedback(
		sources as Map<string, { data: unknown[] }>,
		props.hasTopic,
	);

	// Whether this panel has a mission to command at all. Everything below gates
	// on it: with no selection there is no `mission_id` to name, and a command
	// sent without one lands on whatever `:5001` last initialized.
	const hasMission = Boolean(props.missionId);

	// The feedback slot. `useMissionFeedback(null)` returns the LATEST mission's
	// feedback — useful as a readout, actively dangerous as a gate, because it
	// made the panel show another mission's status and enable its Stop button
	// while the operator had nothing selected.
	// LIVE only: command gating must rest on what the mission reports now, never
	// on a stored history snapshot (see `FeedbackOrigin`).
	const storeFeedback = useLiveMissionFeedbackFor(props.missionId);
	const freshness = useFeedbackFreshness(props.missionId);

	// Live status OF THIS PANEL'S MISSION. Null without a topic, and null without
	// a selected mission — someone else's status is not this mission's status.
	// `gatingStatus` states that rule once, in `control-actions.ts`, where it is
	// tested.
	const liveStatus: MissionStatus | null = gatingStatus({
		hasMission,
		hasTopic: props.hasTopic,
		storeStatus: storeFeedback?.status,
	});

	// DISPLAY ONLY. The latest mission's status when nothing is selected, shown
	// with an explicit "another mission" label and never fed to `allowedActions`.
	const observedStatus: MissionStatus | null =
		props.hasTopic && !hasMission && storeFeedback
			? storeFeedback.status
			: null;

	// DISPLAY ONLY. What the header and the state machine show: the live status
	// when there is one, else this mission's last known status (a history
	// snapshot, or feedback this panel is not itself hearing), flagged as not
	// live. Showing "Unknown" there contradicted the feedback panel, which shows
	// the same stored status. Never fed to the gate — `allowed` reads live only.
	const storedFeedback = useMissionFeedbackExact(props.missionId);
	const shown = displayedStatus(liveStatus, storedFeedback?.status);
	const shownIsLastKnown = !shown.live && shown.status != null;

	// Live state goes stale silently: nothing in these stores ever expired, so a
	// deleted or ended mission kept rendering its last badge forever. Past the
	// threshold the badge says so rather than implying the mission is still there.
	// A terminal mission is silent by design after its final snapshot, so its
	// age is not staleness.
	const statusIsStale =
		props.hasTopic &&
		storeFeedback != null &&
		isFeedbackStale(freshness.stale, storeFeedback.status);
	// Whether this mission's status is being heard NOW. When it is not (no
	// topic, a history snapshot, a silent publisher), Stop is still offered —
	// but labelled as unconfirmable, because it is.
	const statusIsLive = liveStatus != null && !statusIsStale;

	// `gatedActions` additionally forbids EVERYTHING (Submit included) with no
	// mission selected: an untargeted command lands on whatever :5001 last
	// initialized, and an untargeted Submit has no mission_id to carry.
	const allowed: AllowedActions = useMemo(
		() =>
			gatedActions({
				hasMission,
				hasTopic: props.hasTopic,
				storeStatus: storeFeedback?.status,
			}),
		[hasMission, props.hasTopic, storeFeedback?.status],
	);

	// ── Submit dirty-gate ───────────────────────────────────────────────────
	// The operator's live working draft for this mission (the editor / map
	// config) and its content signature. An edit in the editor or on the map
	// mutates the shared draft, so
	// `currentSig` changes, which re-enables Submit on an otherwise-gated active
	// mission.
	const { missionId } = props;
	const draft = useMissionDraft(missionId);
	const draftDirty = useMissionDraftDirty(missionId);
	const currentSig = useMemo(
		() => (draft ? missionConfigSignature(draft) : null),
		[draft],
	);
	// What this panel knows about the C2's copy of a mission: the signature
	// last submitted, and whether the C2 has since said it holds no runtime for
	// it (`NO_TARGET_MISSION`). Keyed by mission, so a different mission never
	// inherits a stale "already submitted" belief — read through `ownRecord`.
	const [submitRecords, setSubmitRecords] = useState<
		Readonly<Record<string, SubmitRecord>>
	>({});
	const ownRecord = missionId ? (submitRecords[missionId] ?? null) : null;
	/** Replace one mission's record, leaving every other mission's alone. */
	const setSubmitRecord = (record: SubmitRecord) => {
		setSubmitRecords((prev) => ({ ...prev, [record.missionId]: record }));
	};
	// Seed: an already-active mission carried over from a prior session (its live
	// status is non-idle) is treated as already-submitted with its current config
	// — so an unchanged planned mission stays gated until the operator actually
	// edits it. Adjusted during render, only while this mission has no record, so
	// it runs once per mission and never overwrites what the C2 told us since
	// (the `NO_TARGET_MISSION` record is a record, and is not re-seeded over).
	if (
		missionId &&
		ownRecord === null &&
		!isMissionIdle(liveStatus) &&
		currentSig != null
	) {
		setSubmitRecords((prev) => ({
			...prev,
			[missionId]: { missionId, sig: currentSig, noTarget: false },
		}));
	}
	const lastSubmittedSig = ownRecord?.sig ?? null;

	// ── Awaiting-C2 confirmation ────────────────────────────────────────────
	// The HTTP POST to C2 returns before C2 transitions the mission, so a 2xx is
	// "sent", not "done". Each dispatched command is held here, KEYED BY THE
	// MISSION IT TARGETED, until that mission's live feedback confirms it
	// (`isCommandConfirmed`), the operator dismisses it, or — past its deadline —
	// it turns into a persistent "not confirmed" notice. While it waits it holds
	// that mission's non-Stop buttons (Approve spammed); it never holds another
	// mission's, and it never holds Stop.
	const [pendingByMission, setPendingByMission] = useState<
		Readonly<Record<string, PendingCommand>>
	>({});
	/** The clock the deadlines are read against; ticks only while one is open. */
	const [now, setNow] = useState(() => Date.now());

	/**
	 * Hold a dispatched command until its mission's feedback confirms it — but
	 * ONLY when there is a feedback source that can confirm it.
	 *
	 * With no feedback topic nothing could ever confirm it, so holding it would
	 * be a guaranteed 25-second outage after every command, followed by a false
	 * alarm. The target, its name and the status it was sent from are captured
	 * by the caller at CLICK time: a response landing after the operator
	 * switched missions must not hold (or warn about) the wrong one.
	 */
	const armTransition = (
		action: ControlAction,
		target: string,
		targetName: string,
		fromStatus: MissionStatus | null,
	) => {
		if (!props.hasTopic) return;
		// Feedback may already have confirmed it while the POST was in
		// flight; that change has been announced and will not come again.
		const current = getLiveMissionFeedback().find(
			(fb) => fb.mission_id === target,
		)?.status;
		if (isCommandConfirmed(action, fromStatus, current)) return;
		const pending = holdCommand(action, target, targetName, fromStatus);
		setNow(pending.deadline - AWAIT_C2_TIMEOUT_MS);
		setPendingByMission((prev) => ({ ...prev, [target]: pending }));
	};

	// Release a command once its mission's live feedback confirms it. A store
	// subscription, not a status-keyed effect: it sees every mission's feedback
	// (a command for a mission no longer on screen is still confirmed), and it
	// sets state from the store's callback rather than synchronously in an
	// effect body.
	useEffect(
		() =>
			subscribeMissionFeedback(() => {
				setPendingByMission((prev) => {
					const live = getLiveMissionFeedback();
					let next: Record<string, PendingCommand> | null = null;
					for (const pending of Object.values(prev)) {
						const status = live.find(
							(fb) => fb.mission_id === pending.missionId,
						)?.status;
						if (
							isCommandConfirmed(
								pending.action,
								pending.fromStatus,
								status,
							)
						) {
							if (next === null) next = { ...prev };
							delete next[pending.missionId];
						}
					}
					// Nothing confirmed → the same object, so no re-render.
					return next ?? prev;
				});
			}),
		[],
	);

	/** Drop a held command (the operator acknowledged the notice). */
	const dismissPending = (target: string) => {
		setPendingByMission((prev) => {
			if (!(target in prev)) return prev;
			const next = { ...prev };
			delete next[target];
			return next;
		});
	};

	// Countdown ticker, running only while some command is still inside its
	// window: the operator sees how long the wait has left, and the deadline
	// passing is what turns a wait into a "not confirmed" notice. Only the
	// interval callback sets state.
	const hasOpenWait = Object.values(pendingByMission).some(
		(pending) => pending.deadline > now,
	);
	useEffect(() => {
		if (!hasOpenWait) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [hasOpenWait]);

	// This mission's held command, split by whether its window is still open.
	// The live status is checked here too, so a confirmation shows on the very
	// render that carries it.
	const ownPendingRaw = missionId
		? (pendingByMission[missionId] ?? null)
		: null;
	const ownPending =
		ownPendingRaw &&
		!isCommandConfirmed(
			ownPendingRaw.action,
			ownPendingRaw.fromStatus,
			liveStatus,
		)
			? ownPendingRaw
			: null;
	const ownWaiting =
		ownPending && ownPending.deadline > now ? ownPending : null;
	const ownUnconfirmed =
		ownPending && ownPending.deadline <= now ? ownPending : null;
	// Commands for OTHER missions that are still unconfirmed. Shown, so
	// switching missions never hides "STOP for A is unconfirmed"; never a lock.
	const otherPending = Object.values(pendingByMission).filter(
		(pending) => pending.missionId !== missionId,
	);
	const secondsLeft = ownWaiting
		? Math.max(0, Math.ceil((ownWaiting.deadline - now) / 1000))
		: null;

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

	// In-flight guard: `busy` is the non-Stop action currently dispatching (or
	// null). While one is in flight every other non-Stop button is disabled and
	// `run` drops re-entrant clicks — so a fast double-click, or a click on a
	// different command mid-flight, can't fire a duplicate or conflicting
	// command before React re-renders the disabled state.
	const { pending: busy, run } = useAsyncAction<ControlAction>();
	// Stop has its OWN guard, per mission, and is deduped only against a Stop
	// already in flight for that mission. An in-flight Approve, or a command
	// still waiting on feedback, must never stand between an operator and Stop.
	const stopLatch = useRef<Set<string>>(new Set());
	const [stoppingIds, setStoppingIds] = useState<readonly string[]>([]);
	const stopping = missionId ? stoppingIds.includes(missionId) : false;
	const runStop = (target: string, fn: () => Promise<void>) =>
		runLatchedPerMission(stopLatch, target, fn, (active) =>
			setStoppingIds((prev) =>
				active ? [...prev, target] : prev.filter((id) => id !== target),
			),
		);

	// Messages are scoped to the mission they are about, so switching missions
	// never leaves "STOP sent" (or its failure) showing under another one.
	const [errorNote, setErrorNote] = useState<ScopedNote | null>(null);
	const [messageNote, setMessageNote] = useState<ScopedNote | null>(null);
	const [issuesNote, setIssuesNote] = useState<{
		missionId: string | null;
		issues: MissionConfigIssue[];
	} | null>(null);
	const scope = missionId ?? null;
	const error = errorNote?.missionId === scope ? errorNote.text : null;
	const message = messageNote?.missionId === scope ? messageNote.text : null;
	const issues =
		issuesNote?.missionId === scope ? issuesNote.issues : NO_ISSUES;
	/**
	 * Pending destructive confirmation (Stop / Delete), driving the AlertDialog.
	 * `null` when idle. Mirrors the mission map's confirmation state — these fire
	 * at real robots and there is no undo.
	 */
	const [confirmState, setConfirmState] = useState<{
		title: string;
		description: string;
		onConfirm: () => void;
	} | null>(null);

	/** Run a no-payload change_status command, surfacing status/error. */
	const runCommand = (
		action: ControlAction,
		call: ReturnType<typeof useRemoteCall>,
		def: RemoteCallDefinition | undefined,
	) => {
		const label = action.toUpperCase();
		if (!def) {
			setErrorNote({
				missionId: scope,
				text: `${label} is unavailable on this datasource.`,
			});
			return;
		}
		// Hard target guard. The buttons are already disabled without a
		// selection, but a command with no `mission_id` falls back to :5001's
		// "last initialized" global — which commands another mission, or
		// nothing at all, and returns 200 either way. Never dispatch one.
		if (!missionId) {
			setErrorNote({
				missionId: null,
				text: `Select a mission first — ${label} needs a target, and an untargeted command silently acts on whatever the C2 last initialized.`,
			});
			return;
		}
		// Captured at CLICK time: the response may land after the operator
		// has switched missions, and must still be reported against — and
		// held for — the mission it was sent to.
		const target = missionId;
		const targetName = missionName;
		const fromStatus = liveStatus;
		const dispatch = async () => {
			setErrorNote(null);
			setMessageNote(null);
			// Name the mission explicitly rather than relying on :5001's
			// "last initialized" global, which is empty after a backend
			// restart and silently commanded nothing.
			const result = await call.execute({ mission_id: target });
			if (!result.success) {
				// CODE BRANCH — 409 VEHICLE_BUSY (robot lock): re-word the
				// transport's id-only text with the robot / mission NAMES this
				// UI already knows (agents roster, mission catalog), falling
				// back to the raw ids. Every other code keeps its message.
				const vehicleBusy =
					c2ResultCode(result) === C2ErrorCode.VehicleBusy
						? formatVehicleBusy(c2ResultConflicts(result), {
								vehicleName: findAgentName,
								missionName: findMissionName,
							})
						: null;
				// Lead with the command and the mission; the transport's
				// detail follows, never first.
				setErrorNote({
					missionId: target,
					text: `${label} for "${targetName}" was not confirmed — ${vehicleBusy ?? result.error ?? "the C2 gave no reason."}`,
				});
				// CODE BRANCH — 409 NO_TARGET_MISSION: the C2 holds no runtime
				// for this mission (this used to be a false 200). Record it so
				// Submit re-enables: the operator's next step is to submit
				// again, and the dirty-gate must not block it on the belief
				// that the C2 still has it.
				if (c2ResultCode(result) === C2ErrorCode.NoTargetMission) {
					setSubmitRecord({
						missionId: target,
						sig: null,
						noTarget: true,
					});
				}
				return;
			}
			setMessageNote({
				missionId: target,
				text: props.hasTopic
					? `${label} sent for "${targetName}" — waiting for its mission feedback to confirm it.`
					: `${label} sent for "${targetName}" — no feedback topic is configured, so this panel cannot confirm it took effect.`,
			});
			// Hold it until the C2's feedback confirms it (or the window
			// closes and it becomes a "not confirmed" notice).
			armTransition(action, target, targetName, fromStatus);
		};
		return action === "stop"
			? runStop(target, dispatch)
			: run(action, dispatch);
	};

	/**
	 * Route a destructive command (Stop / Delete) through the AlertDialog first.
	 *
	 * Stop tears down a running mission's runtime and Delete removes it; both fire
	 * against real robots and neither has an undo. The map widget already gates
	 * its destructive actions this way — same pattern, same component.
	 */
	const requestCommand = (
		action: ControlAction,
		call: ReturnType<typeof useRemoteCall>,
		def: RemoteCallDefinition | undefined,
		confirm: { title: string; description: string },
	) => {
		setConfirmState({
			title: confirm.title,
			description: confirm.description,
			onConfirm: () => void runCommand(action, call, def),
		});
	};

	/**
	 * Submit/initialize: targets `:5001` at the active mission with the config the
	 * operator is actually looking at.
	 *
	 * ⚠ THE FIX THIS CARRIES — this used to source the config from
	 * `c2.missions.list` ONLY, never from the shared working draft, while the
	 * Submit dirty-gate above was computed FROM that draft and the draft's
	 * signature was recorded as "last submitted" on success. Editing geometry on
	 * the map and pressing Submit therefore made the C2 plan the OLD stored config
	 * while this panel reported the edit as submitted — and then gated further
	 * Submits, because it believed the edit was already in. The draft is now
	 * authoritative (see `submit-config.ts`), cleaned exactly as the editor's save
	 * path cleans it, and the recorded signature is the one actually submitted.
	 *
	 * The draft is re-read from the store HERE, not taken from the render closure,
	 * so an edit made in the editor or the map between click and dispatch ships
	 * too.
	 */
	const handleSubmit = () => {
		if (!initDef) {
			setErrorNote({
				missionId: scope,
				text: "c2.mission.init is unavailable on this datasource",
			});
			return;
		}
		if (!missionId) {
			setErrorNote({
				missionId: null,
				text: "Select a mission first (no active mission).",
			});
			return;
		}
		const activeMissionId = missionId;
		const activeName = missionName;
		const fromStatus = liveStatus;
		return run("submit", async () => {
			setErrorNote(null);
			setMessageNote(null);
			setIssuesNote(null);

			// Re-read at dispatch time: the closure's `draft` may be a render old.
			const liveDraft = getMissionDraft(activeMissionId);
			const liveDirty = isMissionDraftDirty(activeMissionId);

			// Only consult the store when there is no draft to submit. A failed
			// fetch is reported as a FETCH failure — falling through to an empty
			// stub is what turned a backend outage into "this mission config
			// cannot be submitted, fix the errors below" against a valid mission.
			let stored: unknown = null;
			let listError: string | null = null;
			if (!liveDraft && listDef) {
				const listed = await list.execute({});
				if (!listed.success) {
					listError = listed.error ?? "the request failed";
				} else {
					const row = normalizeMissions(listed.data).find(
						(r) => r.mission_id === activeMissionId,
					);
					stored = row?.raw ?? null;
				}
			} else if (!liveDraft) {
				listError =
					"c2.missions.list is unavailable on this datasource";
			}

			const resolved = planSubmit({
				missionId: activeMissionId,
				draft: liveDraft,
				dirty: liveDirty,
				stored,
				listError,
			});
			if (!resolved.ok) {
				setErrorNote({
					missionId: activeMissionId,
					text: resolved.error,
				});
				return;
			}
			const { plan } = resolved;

			// Hard gate: never submit a config the C2 planner would reject/crash on.
			const found = validateMissionConfig(plan.config);
			setIssuesNote({ missionId: activeMissionId, issues: found });
			if (found.some((issue) => issue.severity === "error")) {
				setErrorNote({
					missionId: activeMissionId,
					text: "This mission config cannot be submitted — fix the errors below.",
				});
				return;
			}

			const result = await init.execute({
				mission_id: activeMissionId,
				mission_config: plan.config,
			});
			if (!result.success) {
				setErrorNote({
					missionId: activeMissionId,
					text: `SUBMIT for "${activeName}" was not confirmed — ${result.error ?? "the C2 gave no reason."}`,
				});
				return;
			}
			setMessageNote({
				missionId: activeMissionId,
				text: submitMessage(plan),
			});
			// Record the signature of what was ACTUALLY submitted, so the
			// dirty-gate reflects reality rather than the draft we may not have
			// sent. `cleanMissionConfig` is idempotent, so for a draft submit this
			// equals `currentSig` by construction. It also clears a
			// `NO_TARGET_MISSION` record: the C2 has a runtime again.
			setSubmitRecord({
				missionId: activeMissionId,
				sig: missionConfigSignature(plan.config),
				noTarget: false,
			});
			// Hold the lifecycle buttons until C2 transitions the mission.
			armTransition("submit", activeMissionId, activeName, fromStatus);
		});
	};

	// Submit as the status and the dirty-gate permit it, before transient holds.
	const submitPermitted =
		hasMission &&
		allowed.submit &&
		canSubmit({
			status: liveStatus,
			currentSig,
			lastSubmittedSig,
			c2HasNoRuntime: ownRecord?.noTarget ?? false,
		});
	// The one filled button: the operator's next step. Derived from what the
	// gate permits, not from the transient holds, so it does not flicker.
	const primary = primaryAction({
		submit: submitPermitted,
		approve: hasMission && allowed.approve && Boolean(approveDef),
		start: hasMission && allowed.start && Boolean(startDef),
	});

	return (
		<div
			ref={rootRef}
			className={`h-full min-w-0 overflow-y-auto flex flex-col gap-2 text-sm ${narrow ? "p-2" : "p-3"}`}
		>
			{/* Status header */}
			<div className="flex items-center gap-2 shrink-0 min-w-0">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
					<Badge variant="outline">
						{missionStatusLabel(shown.status)}
					</Badge>
					{shownIsLastKnown && (
						<Badge
							variant="outline"
							className="text-muted-foreground"
							title="This panel is not hearing live feedback for this mission. Commands are gated on live status only."
						>
							last known · not live
						</Badge>
					)}
					{props.missionId ? (
						<span
							className="text-xs text-muted-foreground truncate min-w-0 max-w-full"
							title={props.missionId}
						>
							{missionName}
						</span>
					) : (
						<span className="text-xs text-muted-foreground">
							No active mission
						</span>
					)}
					{/* Freshness: nothing in the live-state stores ever expired, so a
				    mission whose publisher stopped kept rendering its last badge
				    indefinitely. Say how old the reading is, and mark it stale. */}
					{props.hasTopic && freshness.ageMs != null && (
						<Badge
							variant={statusIsStale ? "warning" : "outline"}
							title={
								statusIsStale
									? "No mission feedback for a while — this status may no longer reflect the mission."
									: "Age of the last mission-feedback message."
							}
						>
							{statusIsStale ? "stale · " : ""}
							{formatAge(freshness.ageMs)}
						</Badge>
					)}
				</div>
				{props.hasTopic && !narrow && (
					<div className="ml-auto flex shrink-0 items-center gap-1">
						<Badge variant={healthBadgeVariant(health)}>
							feedback: {health}
						</Badge>
					</div>
				)}
			</div>

			{/* Display-only readout of ANOTHER mission's feedback. The store hands
			    back the latest mission when nothing is pinned; it is shown so the
			    panel is not blank, explicitly labelled, and never used to gate an
			    action — an enabled Stop here would target the wrong mission. */}
			{observedStatus != null && (
				<div className="text-xs text-muted-foreground shrink-0">
					Latest feedback on this topic is for another mission (
					{missionStatusLabel(observedStatus)}) — display only. Select
					a mission to command it.
				</div>
			)}

			{/* Prominent, color-coded mission state machine. It shows what the
			    header shows — dimmed when that is a last known status rather than
			    a live one; the gated buttons remain the action surface. */}
			<div
				className={shownIsLastKnown ? "opacity-70" : undefined}
				title={
					shownIsLastKnown
						? "Last known status — not live for this panel."
						: undefined
				}
			>
				<MissionStateMachine status={shown.status} compact={narrow} />
			</div>

			<Separator />

			{/* Lifecycle commands */}
			<div className="flex flex-col gap-2 shrink-0">
				<div className="flex gap-2 flex-wrap">
					<CommandButton
						label="Submit"
						icon={<Send />}
						tone={primary === "submit" ? "primary" : undefined}
						enabled={
							submitPermitted &&
							Boolean(initDef) &&
							busy === null &&
							!stopping &&
							ownWaiting === null
						}
						pending={busy === "submit"}
						onClick={() => void handleSubmit()}
					/>
					<CommandButton
						label="Approve"
						icon={<CheckCircle2 />}
						tone={primary === "approve" ? "primary" : undefined}
						enabled={
							hasMission &&
							allowed.approve &&
							Boolean(approveDef) &&
							busy === null &&
							!stopping &&
							ownWaiting === null
						}
						pending={busy === "approve"}
						onClick={() =>
							void runCommand("approve", approve, approveDef)
						}
					/>
					<CommandButton
						label="Start"
						icon={<Play />}
						tone={primary === "start" ? "primary" : undefined}
						enabled={
							hasMission &&
							allowed.start &&
							Boolean(startDef) &&
							busy === null &&
							!stopping &&
							ownWaiting === null
						}
						pending={busy === "start"}
						onClick={() =>
							void runCommand("start", start, startDef)
						}
					/>
				</div>
				<div className="flex gap-2 flex-wrap">
					<CommandButton
						label="Pause"
						icon={<Pause />}
						enabled={
							hasMission &&
							allowed.pause &&
							Boolean(pauseDef) &&
							busy === null &&
							!stopping &&
							ownWaiting === null
						}
						pending={busy === "pause"}
						onClick={() =>
							void runCommand("pause", pause, pauseDef)
						}
					/>
					{/* Stop is never held by another command in flight or
					    awaiting feedback — only by a Stop already in flight
					    for this mission. */}
					<CommandButton
						label={statusIsLive ? "Stop" : "Stop (unconfirmed)"}
						title={
							statusIsLive
								? undefined
								: "No live status for this mission — Stop is offered anyway, but this panel cannot confirm it takes effect."
						}
						icon={<Square />}
						tone="destructive"
						enabled={
							hasMission &&
							allowed.stop &&
							Boolean(stopDef) &&
							!stopping
						}
						pending={stopping}
						onClick={() =>
							requestCommand("stop", stop, stopDef, {
								title: "Stop this mission?",
								description: `Stop "${missionName}" — the C2 tears down its runtime and the allocated robots stand down. There is no undo; restarting means submitting and approving again.${statusIsLive ? "" : " This panel has no live status for it, so it cannot confirm the robots stood down — watch them."}`,
							})
						}
					/>
					<CommandButton
						label="Delete"
						icon={<Trash2 />}
						tone="danger"
						enabled={
							hasMission &&
							allowed.delete &&
							Boolean(deleteDef) &&
							busy === null &&
							!stopping &&
							ownWaiting === null
						}
						pending={busy === "delete"}
						onClick={() =>
							requestCommand("delete", del, deleteDef, {
								title: "Delete this mission's runtime?",
								description: `Delete the C2 runtime for "${missionName}". This is not reversible.`,
							})
						}
					/>
				</div>
			</div>

			{/* Feedback / errors — never swallowed. */}
			{error && (
				<div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md shrink-0">
					{error}
				</div>
			)}
			<MissionIssueList
				issues={issues}
				title="Mission config validation"
			/>
			{/* A command still held for this mission speaks for itself below;
			    its "sent" line would contradict a "not confirmed" notice. */}
			{message && !error && !ownPending && (
				<div className="text-xs text-muted-foreground shrink-0">
					{message}
				</div>
			)}
			{/* Unsaved-edits notice: Submit ships the DRAFT, so say when the draft
			    and the stored mission have diverged before the operator sends it. */}
			{hasMission && draftDirty && (
				<div className="text-xs text-warning bg-warning/10 p-2 rounded-md shrink-0">
					This mission has unsaved edits. Submit sends what you see;
					save it in the editor or map to persist it.
				</div>
			)}
			{ownWaiting !== null && (
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
					<Loader2 className="size-3 shrink-0 animate-spin" />
					{ownWaiting.action.toUpperCase()} sent — waiting for the C2
					to confirm it…
					{secondsLeft != null && ` ${secondsLeft}s left`}
				</div>
			)}
			{/* Past the window with no confirmation. Persistent until the
			    status moves or the operator dismisses it: a silent release is
			    how a STOP that never landed read as done. */}
			{ownUnconfirmed !== null && (
				<UnconfirmedNotice
					pending={ownUnconfirmed}
					onDismiss={dismissPending}
				/>
			)}
			{/* Commands for OTHER missions that are still unconfirmed. Switching
			    missions must not hide them; they never lock this mission. */}
			{otherPending.map((pending) => (
				<UnconfirmedNotice
					key={pending.missionId}
					pending={pending}
					other
					onDismiss={dismissPending}
				/>
			))}
			{!props.hasTopic && (
				<div className="text-xs text-muted-foreground shrink-0">
					No feedback topic configured — only Submit and Stop are
					offered, and nothing sent can be confirmed here. Add the
					mission-feedback topic for full state-aware control.
				</div>
			)}

			{/* Destructive-action confirmation — same pattern as the mission map.
			    Stop and Delete act on real robots and have no undo. */}
			<AlertDialog
				open={confirmState != null}
				onOpenChange={(open) => {
					if (!open) setConfirmState(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirmState?.title}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmState?.description}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({
								variant: "destructive",
							})}
							onClick={() => {
								confirmState?.onConfirm();
								setConfirmState(null);
							}}
						>
							Confirm
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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

	// Memoized for identity stability across parent re-renders. NOTE: this is
	// cheap hygiene, not a fix for a subscription leak — `LocalDataSourcesProvider`
	// keys its subscriptions on a CONTENT key, so a fresh `[props.topic]` literal
	// each render does not re-subscribe. The earlier comment here claimed it did;
	// it does not. Kept memoized anyway so downstream identity-keyed memos in the
	// provider subtree are not churned. (Hook runs above the early return.)
	const topics = useMemo(
		() => (props.topic ? [props.topic] : []),
		[props.topic],
	);

	if (!initDef) {
		return (
			<PanelEmptyState>
				No C2 datasource available. Add a C2 Control datasource to
				control missions.
			</PanelEmptyState>
		);
	}

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
 * Widget definition for the lifecycle control panel widget.
 * @returns Widget definition.
 */
export function MissionControlPanelDefinition(): WidgetDefinition<MissionControlPanelProps> {
	return {
		id: "c2-mission-control-panel-widget",
		name: "C2 Mission Control",
		description: "Control the active mission lifecycle",
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
		extensibilityHook: c2DatasourceSelectHook,
	} as WidgetDefinition<MissionControlPanelProps>;
}
