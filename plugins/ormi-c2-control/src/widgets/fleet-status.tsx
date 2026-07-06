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
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { ChevronDown, ChevronRight, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

/**
 * F7 — Fleet / vehicle widget.
 *
 * Combines two sources:
 *  - **Roster** from the `c2.vehicles.list` remote call (imperative, one-shot,
 *    fetch-on-mount — §4.1 F3) — a last-known-value list that must NOT blank
 *    when telemetry goes offline.
 *  - **Live presence/health** from `/multi_robot/edge/feedback`, read
 *    defensively (§7: the `Feedback.msg` shape has two divergent variants).
 *
 * This is a multi-topic-plus-roster widget, so it degrades per-series via
 * `getTopicHealth` rather than blanking the whole body (§13).
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
} {
	const { execute } = useRemoteCall<Record<string, never>, unknown>(
		definition,
	);
	const [vehicles, setVehicles] = useState<C2Vehicle[]>([]);
	const [error, setError] = useState<string | null>(null);
	// Starts true; the one-shot fetch flips it false on resolution. Resetting it
	// on refetch isn't needed — the call definition only changes when the C2
	// datasource itself changes, which remounts this subtree.
	const [loading, setLoading] = useState(true);

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
	}, [execute]);

	return { vehicles, error, loading };
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
 * The detail's battery/fuel/sensor lines do NOT consume this — they read the
 * roster `row.vehicle` (`vehicle_info`) directly. The returned telemetry map is
 * retained for compatibility but is otherwise unused; the store publish is the
 * meaningful side effect here.
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

/** A small labelled key/value line inside the expanded detail. */
function DetailLine(props: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-muted-foreground">{props.label}</span>
			<span className="font-medium text-right">{props.value}</span>
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
 * series via `getTopicHealth` (§13); shows an unavailable note with no
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
 * identity is stable across renders, so rows don't remount (Component-identity
 * rule §10 / the Group A `GeometryRow` pattern). The full `agent_id` stays in
 * the `title` tooltip.
 *
 * Collapsed: status dot, name, state, position. Expanded: Position & speed,
 * State + task progress, Battery & fuel %, Autonomy status + progress. The
 * autonomy subscription only mounts while expanded (see {@link AgentAutonomyDetail}).
 */
function FleetRowItem({
	row,
	telemetrySource,
}: {
	row: FleetRow;
	/** The fleet's configured feedback-topic ROS source, used as the autonomy
	 *  subscription source for roster-fed agents (which carry no ROS source). */
	telemetrySource?: DatasourceProviderSettings;
}) {
	const name = useAgentName(row.agent_id);
	const record = useAgentRecord(row.agent_id);
	const [open, setOpen] = useState(false);
	const live = row.telemetry != null;
	const pos = row.telemetry?.position;

	// Battery/fuel/sensors come from the ROSTER vehicle record (the
	// `c2.vehicles.list` response carries `vehicle_info` at top level), NOT the
	// optional agent_profile-topic stash.
	const profileTelemetry = row.vehicle
		? parseAgentProfileTelemetry(row.vehicle)
		: undefined;

	// Autonomy subscription identity: the namespace from the store record (ROS
	// agent_profile) or the roster vehicle; the source from the store record or
	// the fleet's configured feedback topic (roster-fed agents have no source).
	const namespace =
		record?.namespace ?? readNamespace(row.vehicle ?? {}) ?? null;
	const autonomySource = record?.source ?? telemetrySource ?? null;
	return (
		<div className="border rounded-md text-xs">
			<button
				type="button"
				className="w-full p-2 flex items-center gap-2 text-left"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				{open ? (
					<ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
				)}
				<span
					className={`inline-block w-2 h-2 rounded-full shrink-0 ${
						live ? "bg-success" : "bg-muted-foreground"
					}`}
				/>
				<span
					className="font-medium truncate flex-1"
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
				{pos && (
					<span className="text-muted-foreground shrink-0">
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
	const { vehicles, error, loading } = useVehicleRoster(props.definition);
	const { getSource, getTopicHealth } = useLocalDataSource();

	// Still runs the agent_profile publisher when that optional topic is
	// configured — it feeds the agent store name/namespace/source (and provides a
	// ROS source when present). The detail no longer relies on its stashed
	// battery/fuel telemetry (that now comes from the roster `row.vehicle`).
	const profileSource = props.profileTopic
		? getSource(props.profileTopic)
		: undefined;
	useAgentProfilePublisher(
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

	// Per-series telemetry health (does not blank the roster, §13).
	const telemetryHealth = props.topic
		? getTopicHealth(props.topic)
		: "offline";

	return (
		<div className="h-full flex flex-col p-3 gap-2 text-sm">
			<div className="flex items-center gap-2 shrink-0 text-xs">
				<Badge variant="secondary">{vehicles.length} registered</Badge>
				{props.hasTopic ? (
					<Badge
						variant={
							telemetryHealth === "online" ? "default" : "outline"
						}
					>
						telemetry: {telemetryHealth}
					</Badge>
				) : (
					<Badge variant="outline">no telemetry topic</Badge>
				)}
				{error && <Badge variant="destructive">roster: {error}</Badge>}
			</div>

			<ScrollArea className="flex-1 min-h-0">
				<div className="flex flex-col gap-1 pr-2">
					{loading && rows.length === 0 && (
						<div className="text-muted-foreground text-xs">
							Loading roster…
						</div>
					)}
					{!loading && rows.length === 0 && (
						<div className="text-muted-foreground text-xs">
							No vehicles registered.
						</div>
					)}
					{rows.map((row) => (
						<FleetRowItem
							key={row.agent_id}
							row={row}
							telemetrySource={props.topic?.source}
						/>
					))}
				</div>
			</ScrollArea>
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
			<div className="h-full flex items-center justify-center p-3 text-sm text-muted-foreground text-center">
				No C2 datasource available. Add a C2 Control datasource to load
				the vehicle roster.
			</div>
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
 * Widget definition for the fleet / vehicle widget (F7).
 * @returns Widget definition.
 */
export function FleetStatusDefinition(): WidgetDefinition<FleetStatusProps> {
	return {
		id: "c2-fleet-status-widget",
		name: "C2 Fleet Status",
		description:
			"Vehicle roster (c2.vehicles.list) cross-referenced with live /multi_robot/edge/feedback presence",
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
	} as WidgetDefinition<FleetStatusProps>;
}
