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
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { C2Call } from "../datasource/remote-calls";
import { C2Vehicle } from "../types/c2-types";
import { FleetRow, collectTelemetry, mergeFleet } from "./fleet-helpers";

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
			setVehicles(list as C2Vehicle[]);
		});
		return () => {
			cancelled = true;
		};
	}, [execute]);

	return { vehicles, error, loading };
}

/** Inner body once the roster call definition is resolved. */
function FleetBody(props: {
	definition: RemoteCallDefinition;
	hasTopic: boolean;
	topic?: SelectedTopic;
}) {
	const { vehicles, error, loading } = useVehicleRoster(props.definition);
	const { sources, getTopicHealth } = useLocalDataSource();

	// Every agent publishes its own Feedback on the shared topic, so dedupe the
	// buffered window by agent_id (last wins) rather than showing only the newest
	// message — otherwise a single row cycles through the agents.
	const hasTopic = props.hasTopic;
	const rows: FleetRow[] = useMemo(() => {
		if (!hasTopic) return mergeFleet(vehicles, []);
		const buffers = [
			...(sources as Map<string, BufferedSource>).values(),
		].map((source) => source.data);
		return mergeFleet(vehicles, collectTelemetry(buffers));
	}, [vehicles, sources, hasTopic]);

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
					{rows.map((row) => {
						const live = row.telemetry != null;
						return (
							<div
								key={row.agent_id}
								className="border rounded-md p-2 text-xs flex items-center gap-2"
							>
								<span
									className={`inline-block w-2 h-2 rounded-full shrink-0 ${
										live ? "bg-emerald-500" : "bg-zinc-400"
									}`}
								/>
								<span
									className="font-medium truncate flex-1"
									title={row.agent_id}
								>
									{row.agent_id}
								</span>
								{row.unregistered && (
									<Badge variant="outline">
										unregistered
									</Badge>
								)}
								{row.telemetry?.state != null && (
									<span className="text-muted-foreground shrink-0">
										{String(row.telemetry.state)}
									</span>
								)}
								{row.telemetry?.position && (
									<span className="text-muted-foreground shrink-0">
										({row.telemetry.position.x.toFixed(2)},{" "}
										{row.telemetry.position.y.toFixed(2)})
									</span>
								)}
							</div>
						);
					})}
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

	const topics = props.topic ? [props.topic] : [];

	return (
		// Buffer a window of recent messages so all interleaved agents (one
		// publisher each on the shared topic) are present; FleetBody dedupes the
		// window by agent_id. Sized for a comfortable multi-agent fleet.
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={128}>
			<FleetBody
				definition={definition}
				hasTopic={Boolean(props.topic)}
				topic={props.topic}
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
