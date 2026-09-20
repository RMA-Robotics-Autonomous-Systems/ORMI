"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	DatasourceProviderSettings,
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
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { ChevronDown, ChevronRight, RefreshCw, Truck } from "lucide-react";

import { useCallback, useEffect, useMemo, useState } from "react";

import { c2DatasourceSelectHook } from "../datasource/datasource-select";
import { C2Call } from "../datasource/remote-calls";
import {
	publishAgentProfiles,
	useAgentName,
	useAgentRecord,
} from "../state/c2-agents-store";
import { agentStateLabel } from "../types/agent-state-labels";
import { C2Vehicle } from "../types/c2-types";
import {
	FleetRow,
	autonomyStatusLabel,
	buildNamespacedTopic,
	collectTelemetry,
	mergeFleet,
	parseAgentProfileTelemetry,
	parseAutonomyStatus,
	readNamespace,
	vehicleAgentId,
} from "./fleet-helpers";
import { PanelEmptyState } from "./panel-empty-state";
import { useContainerSize } from "./responsive";

/**
 * Fleet / vehicle widget.
 *
 * Combines two sources:
 *  - **Roster** from the `c2.vehicles.list` remote call (imperative, fetched on
 *    mount and polled slowly) — a last-known-value list that must NOT blank
 *    when telemetry goes offline.
 *  - **Live presence/health** from `/multi_robot/edge/feedback`, read
 *    defensively (the `Feedback.msg` shape has two divergent variants).
 *
 * This is a multi-topic-plus-roster widget, so it degrades per-series via
 * `getTopicHealth` rather than blanking the whole body.
 */

/** Props for the FleetStatus widget. */
interface FleetStatusProps extends Record<string, unknown> {
	title: string;
	/** `/multi_robot/edge/feedback` topic for live agent telemetry. */
	topic?: SelectedTopic;
	/**
	 * `/multi_robot/edge/agent_profile` topic (`std_msgs/msg/String`) carrying
	 * per-agent profiles; feeds the agent-name store so rows show the friendly
	 * namespace name instead of the UUID. Optional.
	 */
	agent_profile_topic?: SelectedTopic;
	/** Pin the roster to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
}

/** Per-topic buffered source shape used here. */
interface BufferedSource {
	data: unknown[];
}

/**
 * How often the vehicle roster is refetched in the background.
 *
 * 30 s: the roster changes when a robot is commissioned, which is a human-scale
 * event, and the call is a single small GET against the Mongo REST service.
 */
const ROSTER_POLL_MS = 30_000;

/**
 * Roster fetcher: runs `c2.vehicles.list` once on mount (and when the call
 * definition changes), exposing the last-known roster + a live error string.
 *
 * Kept as its own hook so the definition is always defined when `useRemoteCall`
 * runs (hook order stays stable).
 */
function useVehicleRoster(definition: RemoteCallDefinition): {
	vehicles: C2Vehicle[];
	error: string | null;
	loading: boolean;
	/** Force an immediate refetch (the toolbar's refresh control). */
	refresh: () => void;
} {
	const { execute } = useRemoteCall<Record<string, never>, unknown>(
		definition,
	);
	const [vehicles, setVehicles] = useState<C2Vehicle[]>([]);
	const [error, setError] = useState<string | null>(null);
	// Starts true; the first fetch flips it false on resolution.
	const [loading, setLoading] = useState(true);
	/**
	 * Bumped to force a refetch. The roster used to be fetch-on-mount ONLY, with
	 * no refresh control anywhere on this widget: a vehicle registered after the
	 * dashboard opened never appeared, and the only way to see it was to reload
	 * the page. It is a cheap REST read, so it now also polls slowly — slowly
	 * enough that it is not a load concern, often enough that the roster is not
	 * simply wrong.
	 */
	const [nonce, setNonce] = useState(0);
	// A MANUAL refresh shows the spinner; the background poll does not, so the
	// widget does not blink every 30 s for a read the operator did not ask for.
	const refresh = useCallback(() => {
		setLoading(true);
		setNonce((n) => n + 1);
	}, []);

	// Low-frequency background poll. Off-cycle from anything else in the plugin.
	useEffect(() => {
		const id = setInterval(() => setNonce((n) => n + 1), ROSTER_POLL_MS);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		let cancelled = false;
		execute({}).then((result) => {
			if (cancelled) return;
			setLoading(false);
			if (!result.success) {
				setError(result.error ?? "Failed to fetch vehicles");
				return;
			}
			setError(null);
			// :5000 /Vehicles returns an array; tolerate a wrapped shape too.
			const data = result.data as unknown;
			const list = Array.isArray(data)
				? data
				: Array.isArray((data as { vehicles?: unknown })?.vehicles)
					? (data as { vehicles: unknown[] }).vehicles
					: [];
			const vehicleList = list as C2Vehicle[];
			setVehicles(vehicleList);
			// Best-effort: publish any namespace the roster carries. The :5000
			// schema strips `namespace` today, so this publishes nothing — it is
			// free and correct if the C2 schema is ever loosened. No datasource
			// `source` here (REST roster), so per-agent topic subscriptions are
			// only enabled once the agent_profile topic feeds a source.
			publishAgentProfiles(
				vehicleList
					.map((v) => {
						const ns = readNamespace(v as Record<string, unknown>);
						return {
							agent_id: vehicleAgentId(v) ?? "",
							namespace: ns ?? null,
							name: ns,
						};
					})
					.filter((r) => r.agent_id),
			);
		});
		return () => {
			cancelled = true;
		};
	}, [execute, nonce]);

	return { vehicles, error, loading, refresh };
}

/** Parsed battery/fuel/sensor telemetry, keyed by agent_id (widget-local). */
type ProfileTelemetryMap = Record<
	string,
	ReturnType<typeof parseAgentProfileTelemetry>
>;

/**
 * Feed the agent store from the buffered `agent_profile` source (when that
 * OPTIONAL topic is configured).
 *
 * Each `std_msgs/msg/String` message wraps the full agent profile as a JSON
 * string in its `data` field; we parse it defensively (tolerating an
 * already-parsed object, skipping non-string/garbage) and publish
 * `{ agent_id, namespace, name, source }` — the `source` is the agent_profile
 * topic's datasource, so per-agent localization/autonomy subscriptions can be
 * issued against it WHEN this topic is present. Runs in an effect over the
 * buffered source — NEVER in render. Selects ONLY the agent_profile topic's
 * buffer (via the provider's own `getSource`), so the feedback topic's messages
 * are never folded in.
 *
 * ⚠ The returned telemetry map is the PRIMARY source for the detail's
 * battery/fuel/sensor lines. It used to be discarded at the call site while those
 * lines read the roster `row.vehicle` instead — and the `:5000 /Vehicles` schema
 * is `{agent_id}` only, so `vehicle_info` is never present there and battery and
 * fuel could not populate under any circumstances. The parse below reads exactly
 * the fields the rows need, off the `agent_profile` topic, which does carry them
 * today. The roster stays a fallback for whenever the backend widens its schema.
 *
 * @param source - The buffered agent_profile source (or undefined).
 * @param profileTopic - The agent_profile SelectedTopic (for its `.source`).
 * @returns Parsed profile telemetry keyed by agent_id.
 */
function useAgentProfilePublisher(
	source: BufferedSource | undefined,
	profileTopic: SelectedTopic | undefined,
): ProfileTelemetryMap {
	const buffer = source?.data;
	const profileSource = profileTopic?.source ?? null;
	const [telemetry, setTelemetry] = useState<ProfileTelemetryMap>({});
	useEffect(() => {
		if (!buffer) return;
		const rows: {
			agent_id: string;
			namespace: string | null;
			name?: string | null;
			source: typeof profileSource;
		}[] = [];
		const parsedTelemetry: ProfileTelemetryMap = {};
		for (const value of buffer) {
			if (value == null) continue;
			let parsed: Record<string, unknown> | null = null;
			try {
				const data = (value as { data?: unknown }).data;
				if (typeof data === "string") {
					parsed = JSON.parse(data) as Record<string, unknown>;
				} else if (typeof value === "object") {
					// Already-parsed object (e.g. topic `property` into the field).
					parsed = value as Record<string, unknown>;
				}
			} catch {
				continue;
			}
			if (parsed == null || typeof parsed !== "object") continue;
			const agentId = parsed.agent_id;
			if (typeof agentId !== "string" || agentId === "") continue;
			const ns = readNamespace(parsed);
			rows.push({
				agent_id: agentId,
				namespace: ns ?? null,
				name: ns,
				source: profileSource,
			});
			parsedTelemetry[agentId] = parseAgentProfileTelemetry(parsed);
		}
		if (rows.length > 0) publishAgentProfiles(rows);
		if (Object.keys(parsedTelemetry).length > 0) {
			setTelemetry((prev) => ({ ...prev, ...parsedTelemetry }));
		}
	}, [buffer, profileSource]);
	return telemetry;
}

/**
 * Choose which parsed telemetry a row renders: the live `agent_profile` topic
 * stash when it carries anything, else the roster record.
 *
 * "Carries anything" means a battery reading, a fuel reading, or at least one
 * sensor — a profile message that parsed to all-empty is not better than the
 * roster and must not mask it.
 *
 * Pure and exported so the precedence is testable without a renderer.
 *
 * @param stash - Telemetry parsed off the agent_profile topic, if any.
 * @param roster - Telemetry parsed off the `c2.vehicles.list` record, if any.
 * @returns Whichever should be rendered (possibly undefined).
 */
export function pickProfileTelemetry(
	stash: ReturnType<typeof parseAgentProfileTelemetry> | undefined,
	roster: ReturnType<typeof parseAgentProfileTelemetry> | undefined,
): ReturnType<typeof parseAgentProfileTelemetry> | undefined {
	const stashHasData =
		stash != null &&
		(stash.batteryPct != null ||
			stash.fuelPct != null ||
			stash.sensors.length > 0);
	return stashHasData ? stash : (roster ?? stash);
}

/**
 * Badge variant for a telemetry health reading: a status, so it is coloured by
 * meaning (never the default fill, which reads as a button).
 */
function healthBadgeVariant(
	health: string,
): "success" | "warning" | "destructive" {
	if (health === "online") return "success";
	if (health === "offline") return "destructive";
	return "warning";
}

/** A small labelled key/value line inside the expanded detail. */
function DetailLine(props: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-2 min-w-0">
			<span className="text-muted-foreground shrink-0">
				{props.label}
			</span>
			<span className="font-medium text-right min-w-0 break-words">
				{props.value}
			</span>
		</div>
	);
}

/**
 * Per-agent autonomy detail, mounted ONLY while the row is expanded.
 *
 * A hoisted component that wraps its OWN `LocalDataSourcesProvider` with a single
 * `{namespace}/edge/multi_robot/autonomy_status` subscription
 * (`autonomy_msgs/msg/AutonomyStatus`, `buffersSize: 1`). On collapse the parent
 * unmounts it, which tears the provider down and auto-unsubscribes. The
 * single-topic array is inline (the child mounts/unmounts as a unit, so a fresh
 * array per render does not thrash a long-lived subscription). Degrades per
 * series via `getTopicHealth`; shows an unavailable note with no
 * namespace/source.
 */
function AgentAutonomyDetail(props: {
	namespace: string | null;
	source: DatasourceProviderSettings | null;
}) {
	if (!props.namespace) {
		return (
			<div className="text-muted-foreground">
				autonomy unavailable (no namespace)
			</div>
		);
	}
	if (!props.source) {
		return (
			<div className="text-muted-foreground">
				autonomy unavailable (configure the feedback/telemetry topic)
			</div>
		);
	}
	const topic: SelectedTopic = {
		topic: buildNamespacedTopic(props.namespace, "autonomy_status"),
		datasource_id: props.source.id,
		source: props.source,
		type: "autonomy_msgs/msg/AutonomyStatus",
		rawType: "autonomy_msgs/msg/AutonomyStatus",
		property: "",
	};
	return (
		<LocalDataSourcesProvider SelectedTopics={[topic]} buffersSize={1}>
			<AgentAutonomyBody topic={topic} />
		</LocalDataSourcesProvider>
	);
}

/** Autonomy detail body: reads the latest AutonomyStatus and renders it. */
function AgentAutonomyBody({ topic }: { topic: SelectedTopic }) {
	const { getSource, getTopicHealth } = useLocalDataSource();
	const source = getSource(topic) as BufferedSource | undefined;
	const health = getTopicHealth(topic);
	const parsed = useMemo(() => {
		const latest = source?.data[source.data.length - 1];
		return parseAutonomyStatus(latest ?? null);
	}, [source]);

	if (health === "offline" || !parsed) {
		return (
			<div className="text-muted-foreground">
				autonomy: {health === "offline" ? "offline" : "no data"}
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-1">
			<DetailLine
				label="status"
				value={autonomyStatusLabel(parsed.status)}
			/>
			{parsed.primitives.length === 0 ? (
				<div className="text-muted-foreground">no primitives</div>
			) : (
				parsed.primitives.map((p, i) => (
					<DetailLine
						key={i}
						label={`primitive ${i + 1}`}
						value={`${p.progress}`}
					/>
				))
			)}
		</div>
	);
}

/**
 * One fleet row — collapsed summary + an expandable detail panel.
 *
 * A hoisted (module-level) component so it can call {@link useAgentName} for the
 * agent's namespace name — hooks can't run inside the `.map` of the parent. Its
 * identity is stable across renders, so rows don't remount (the stable
 * component-identity rule in AGENTS.md). The full `agent_id` stays in
 * the `title` tooltip.
 *
 * Collapsed: status dot, name, state, position. Expanded: Position & speed,
 * State + task progress, Battery & fuel %, Autonomy status + progress. The
 * autonomy subscription only mounts while expanded (see {@link AgentAutonomyDetail}).
 */
function FleetRowItem({
	row,
	telemetrySource,
	profileStash,
	narrow,
}: {
	row: FleetRow;
	/** Narrow container: the collapsed row drops the position readout. */
	narrow?: boolean;
	/** The fleet's configured feedback-topic ROS source, used as the autonomy
	 *  subscription source for roster-fed agents (which carry no ROS source). */
	telemetrySource?: DatasourceProviderSettings;
	/** This agent's telemetry parsed off the `agent_profile` topic, if any. */
	profileStash?: ReturnType<typeof parseAgentProfileTelemetry>;
}) {
	const name = useAgentName(row.agent_id);
	const record = useAgentRecord(row.agent_id);
	const [open, setOpen] = useState(false);
	const live = row.telemetry != null;
	const pos = row.telemetry?.position;

	// Battery/fuel/sensors: the `agent_profile` TOPIC stash first (it carries
	// `vehicle_info` today), the roster record only as a fallback.
	//
	// This was the other way round, which meant they could never populate: the
	// `:5000 /Vehicles` schema is `{agent_id}` only, so `parseAgentProfileTelemetry`
	// was handed a record with no `vehicle_info` in it and both lines rendered "—"
	// forever, while the parsed topic values sat in a map the call site threw away.
	// The roster fallback keeps working the moment the backend widens that schema.
	const rosterTelemetry = row.vehicle
		? parseAgentProfileTelemetry(row.vehicle)
		: undefined;
	const profileTelemetry = pickProfileTelemetry(
		profileStash,
		rosterTelemetry,
	);

	// Autonomy subscription identity: the namespace from the store record (ROS
	// agent_profile) or the roster vehicle; the source from the store record or
	// the fleet's configured feedback topic (roster-fed agents have no source).
	const namespace =
		record?.namespace ?? readNamespace(row.vehicle ?? {}) ?? null;
	const autonomySource = record?.source ?? telemetrySource ?? null;
	return (
		<div className="border rounded-md text-xs">
			{/* Disclosure, not a toolbar action: a full-width row button. */}
			<button
				type="button"
				className="w-full p-2 flex items-center gap-2 text-left rounded-md transition-colors hover:bg-muted/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				{open ? (
					<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="size-3 shrink-0 text-muted-foreground" />
				)}
				<span
					className={`inline-block w-2 h-2 rounded-full shrink-0 ${
						live ? "bg-success" : "bg-muted-foreground"
					}`}
				/>
				<span
					className="font-medium truncate flex-1 min-w-0"
					title={row.agent_id}
				>
					{name}
				</span>
				{row.unregistered && (
					<Badge variant="outline">unregistered</Badge>
				)}
				{row.telemetry?.state != null && (
					<span className="text-muted-foreground shrink-0">
						{agentStateLabel(row.telemetry.state)}
					</span>
				)}
				{pos && !narrow && (
					<span className="text-muted-foreground shrink-0 tabular-nums">
						({pos.x.toFixed(2)}, {pos.y.toFixed(2)})
					</span>
				)}
			</button>

			{open && (
				<div className="border-t p-2 flex flex-col gap-3">
					{/* Position & speed */}
					<div className="flex flex-col gap-1">
						<div className="font-medium">Position &amp; speed</div>
						{pos ? (
							<>
								<DetailLine
									label="position"
									value={`${pos.x.toFixed(5)}, ${pos.y.toFixed(5)}`}
								/>
								{pos.z != null && (
									<DetailLine
										label="altitude"
										value={pos.z.toFixed(2)}
									/>
								)}
							</>
						) : (
							<div className="text-muted-foreground">
								non-geographic frame
							</div>
						)}
					</div>

					{/* State + task progress */}
					<div className="flex flex-col gap-1">
						<div className="font-medium">State &amp; task</div>
						<DetailLine
							label="state"
							value={
								row.telemetry?.state != null
									? agentStateLabel(row.telemetry.state)
									: "—"
							}
						/>
					</div>

					{/* Battery & fuel % */}
					<div className="flex flex-col gap-1">
						<div className="font-medium">Battery &amp; fuel</div>
						<DetailLine
							label="battery"
							value={
								profileTelemetry?.batteryPct != null
									? `${profileTelemetry.batteryPct}%`
									: "—"
							}
						/>
						<DetailLine
							label="fuel"
							value={
								profileTelemetry?.fuelPct != null
									? `${profileTelemetry.fuelPct}%`
									: "—"
							}
						/>
						{profileTelemetry &&
							profileTelemetry.sensors.length > 0 && (
								<DetailLine
									label="sensors"
									value={`${profileTelemetry.sensors.length} reporting`}
								/>
							)}
					</div>

					{/* Autonomy status + progress (subscribes only while open) */}
					<div className="flex flex-col gap-1">
						<div className="font-medium">Autonomy</div>
						<AgentAutonomyDetail
							namespace={namespace}
							source={autonomySource}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

/** Inner body once the roster call definition is resolved. */
function FleetBody(props: {
	definition: RemoteCallDefinition;
	hasTopic: boolean;
	topic?: SelectedTopic;
	profileTopic?: SelectedTopic;
}) {
	const [rootRef, { size }] = useContainerSize<HTMLDivElement>();
	const narrow = size === "xs";
	const { vehicles, error, loading, refresh } = useVehicleRoster(
		props.definition,
	);
	const { getSource, getTopicHealth } = useLocalDataSource();

	// Still runs the agent_profile publisher when that optional topic is
	// configured — it feeds the agent store name/namespace/source (and provides a
	// ROS source when present). The detail no longer relies on its stashed
	// battery/fuel telemetry (that now comes from the roster `row.vehicle`).
	const profileSource = props.profileTopic
		? getSource(props.profileTopic)
		: undefined;
	// The returned map is CONSUMED (it used to be discarded): it is where the
	// rows' battery/fuel/sensor readings come from. See `pickProfileTelemetry`.
	const profileTelemetry = useAgentProfilePublisher(
		profileSource as BufferedSource | undefined,
		props.profileTopic,
	);

	// Every agent publishes its own Feedback on the shared topic, so dedupe the
	// buffered window by agent_id (last wins) rather than showing only the newest
	// message — otherwise a single row cycles through the agents. Select ONLY the
	// feedback topic's buffer so the agent_profile topic's strings aren't parsed
	// as telemetry.
	//
	// The provider rebuilds a topic's `Source` object only on the flush that
	// delivered new data for it (untouched sources keep their reference), so
	// `feedbackSource` itself is the change-fresh dependency — keying the memo on
	// it (not on the whole `sources` map) recomputes exactly when feedback lands
	// and reads the same value it keys on (no React-Compiler dead-read trap).
	const hasTopic = props.hasTopic;
	const feedbackSource = props.topic
		? (getSource(props.topic) as BufferedSource | undefined)
		: undefined;
	const rows: FleetRow[] = useMemo(() => {
		if (!hasTopic || !feedbackSource) return mergeFleet(vehicles, []);
		return mergeFleet(vehicles, collectTelemetry([feedbackSource.data]));
	}, [vehicles, hasTopic, feedbackSource]);

	// Per-series telemetry health (does not blank the roster).
	const telemetryHealth = props.topic
		? getTopicHealth(props.topic)
		: "offline";

	return (
		<div
			ref={rootRef}
			className={`h-full min-w-0 flex flex-col gap-2 text-sm ${narrow ? "p-2" : "p-3"}`}
		>
			{/* Header: badges wrap among themselves; refresh keeps its own
			    non-wrapping slot on the right, so it never drops to a line of
			    its own. */}
			<div className="flex items-center gap-2 shrink-0 min-w-0">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
					<Badge variant="secondary">
						{vehicles.length} registered
					</Badge>
					{props.hasTopic ? (
						<Badge variant={healthBadgeVariant(telemetryHealth)}>
							telemetry: {telemetryHealth}
						</Badge>
					) : (
						<Badge variant="outline">no telemetry topic</Badge>
					)}
				</div>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<Button
						size="icon-sm"
						variant="ghost"
						onClick={refresh}
						disabled={loading}
						title="Refresh the vehicle roster"
						aria-label="Refresh the vehicle roster"
					>
						<RefreshCw className={loading ? "animate-spin" : ""} />
					</Button>
				</div>
			</div>
			{/* A roster failure is a sentence, not a chip: it can be long, and
			    in a badge it forced the header to wrap around it. */}
			{error && (
				<div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md shrink-0 break-words">
					Could not refresh the vehicle roster — {error}
				</div>
			)}

			{/* Radix wraps the content in a `display: table` div that grows to
			    its widest row, so `truncate` never engaged; forcing it to block
			    keeps every row at the viewport's width. */}
			{rows.length === 0 ? (
				<PanelEmptyState>
					{loading ? "Loading roster…" : "No vehicles registered."}
				</PanelEmptyState>
			) : (
				<ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block">
					<div className="flex flex-col gap-1 pr-2">
						{rows.map((row) => (
							<FleetRowItem
								key={row.agent_id}
								row={row}
								telemetrySource={props.topic?.source}
								profileStash={profileTelemetry[row.agent_id]}
								narrow={narrow}
							/>
						))}
					</div>
				</ScrollArea>
			)}
		</div>
	);
}

/**
 * Host: resolves the `c2.vehicles.list` definition from the available remote
 * calls (optionally pinned to a datasource), then wires the optional telemetry
 * topic into a local-datasource provider. Renders a placeholder until a C2
 * datasource exposing the roster call exists.
 */
const FleetStatusWidget: React.FC<FleetStatusProps> = (props) => {
	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);

	const definition = useMemo(
		() => calls.find((call) => call.name === C2Call.VehiclesList),
		[calls],
	);

	if (!definition) {
		return (
			<PanelEmptyState>
				No C2 datasource available. Add a C2 Control datasource to load
				the vehicle roster.
			</PanelEmptyState>
		);
	}

	const topics: SelectedTopic[] = [];
	if (props.topic) topics.push(props.topic);
	if (props.agent_profile_topic) topics.push(props.agent_profile_topic);

	return (
		// Buffer a window of recent messages so all interleaved agents (one
		// publisher each on the shared topic) are present; FleetBody dedupes the
		// window by agent_id. Sized for a comfortable multi-agent fleet.
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={128}>
			<FleetBody
				definition={definition}
				hasTopic={Boolean(props.topic)}
				topic={props.topic}
				profileTopic={props.agent_profile_topic}
			/>
		</LocalDataSourcesProvider>
	);
};

/**
 * Widget definition for the fleet / vehicle widget.
 * @returns Widget definition.
 */
export function FleetStatusDefinition(): WidgetDefinition<FleetStatusProps> {
	return {
		id: "c2-fleet-status-widget",
		name: "C2 Fleet Status",
		description: "Vehicle roster with live presence",
		titleProp: "title",
		icon: <Truck />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				topic: { type: "object", title: "Edge feedback topic" },
				agent_profile_topic: {
					type: "object",
					title: "Agent profile topic (optional)",
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
							acceptsRaw: ["task_msgs/msg/Feedback"],
						},
					},
				} as TopicSelectElement,
				{
					type: "TopicSelect",
					scope: "#/properties/agent_profile_topic",
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
					scope: "#/properties/datasource_id",
				} as ControlElement,
			],
		} as VerticalLayout,

		data: {
			title: "Fleet Status",
		},
		Component: FleetStatusWidget,
		extensibilityHook: c2DatasourceSelectHook,
	} as WidgetDefinition<FleetStatusProps>;
}
