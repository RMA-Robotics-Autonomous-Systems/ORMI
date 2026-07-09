"use client";

import {
	LocalDataSourcesProvider,
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { BatteryState } from "@workspace/ormi-core/types";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { BatteryFull } from "lucide-react";
import { useState } from "react";

import {
	enumLabel,
	HEALTH_LABELS,
	healthVariant,
	STATUS_LABELS,
	TECH_LABELS,
} from "./battery-enums";
import { useDiscoveredTopics } from "../shared/use-discovered-topics";

/** Webapp type tag applied by the converter to BatteryState topics. */
const BATTERY_WEBAPP_TYPE = "BatteryState";

/** Raw ROS type, used as a fallback discovery predicate. */
const BATTERY_ROS_TYPE = "sensor_msgs/msg/BatteryState";

/** Settings for the Battery State widget. */
interface BatteryWidgetProps extends Record<string, unknown> {
	title: string;
	/** Fixed column count; `0`/unset uses a responsive auto-fill grid. */
	columns: number;
	/** Whether per-cell voltage/temperature arrays start expanded. */
	showCells: boolean;
}

/** True when a number is a real, finite measurement (not NaN/Inf). */
const isMeasured = (v: number): boolean => Number.isFinite(v);

/** Format a measured float with a unit, or "—" when unmeasured. */
const fmt = (v: number, unit: string, digits = 2): string =>
	isMeasured(v) ? `${v.toFixed(digits)}${unit}` : "—";

/** One labelled metric cell in the secondary grid. */
function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			<span className="text-sm font-medium tabular-nums">{value}</span>
		</div>
	);
}

/**
 * One battery card. Reads the latest {@link BatteryState} directly each render
 * (never memoized on the provider version counter, per the React-Compiler +
 * external-store rule) and gates on its own topic health so an offline card
 * dims while its siblings keep rendering live values.
 */
function BatteryCard({
	topic,
	defaultShowCells,
}: {
	topic: SelectedTopic;
	defaultShowCells: boolean;
}) {
	const { getSource, getTopicHealth } = useLocalDataSource();
	const [showCells, setShowCells] = useState(defaultShowCells);

	const health = getTopicHealth(topic);
	// Read the freshest sample directly — do not key a memo on the version.
	const state = getSource(topic)?.data.at(-1) as BatteryState | undefined;

	const cardBase =
		"flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground";

	// Connecting and no data yet → skeleton placeholder.
	if (health === "connecting" && !state) {
		return (
			<div className={cardBase}>
				<Skeleton className="h-4 w-2/3" />
				<Skeleton className="h-6 w-1/2" />
				<Skeleton className="h-2 w-full" />
			</div>
		);
	}

	const identity = state?.location || state?.serialNumber || topic.topic;
	const offline = health === "offline";

	// Online but the buffer is still empty → nothing measured yet.
	if (!state) {
		return (
			<div className={cardBase}>
				<div className="flex items-center justify-between gap-2">
					<span className="truncate text-sm font-semibold">
						{topic.topic}
					</span>
				</div>
				<span className="text-xs text-muted-foreground">
					Waiting for first message…
				</span>
			</div>
		);
	}

	// Defensive: a raw (unconverted) BatteryState admitted via the rawType
	// discovery fallback would lack these arrays — never assume they exist.
	const cellVoltage = state.cellVoltage ?? [];
	const cellTemperature = state.cellTemperature ?? [];

	const hasPct = isMeasured(state.percentage);
	const pct = hasPct ? Math.min(Math.max(state.percentage, 0), 1) : 0;
	const currentHint = isMeasured(state.current)
		? state.current < 0
			? "discharging"
			: state.current > 0
				? "charging"
				: "idle"
		: undefined;

	return (
		<div className={`${cardBase} ${offline ? "opacity-50" : ""}`}>
			<div className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col">
					<span className="truncate text-sm font-semibold">
						{identity}
					</span>
					<span className="truncate text-[10px] text-muted-foreground">
						{topic.topic}
					</span>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					{offline ? (
						<Badge
							variant="outline"
							className="text-muted-foreground"
						>
							Offline
						</Badge>
					) : (
						<Badge variant={healthVariant(state.powerSupplyHealth)}>
							{enumLabel(HEALTH_LABELS, state.powerSupplyHealth)}
						</Badge>
					)}
					{!state.present && (
						<Badge
							variant="outline"
							className="text-muted-foreground"
						>
							Not present
						</Badge>
					)}
				</div>
			</div>

			{/* Percentage bar + label; the bar hides entirely when unmeasured. */}
			<div className="flex flex-col gap-1">
				<div className="flex items-baseline justify-between">
					<span className="text-2xl font-semibold tabular-nums">
						{fmt(state.voltage, " V")}
					</span>
					<span className="text-sm text-muted-foreground tabular-nums">
						{hasPct ? `${(pct * 100).toFixed(0)}%` : "—"}
					</span>
				</div>
				{hasPct && (
					<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary"
							style={{ width: `${pct * 100}%` }}
						/>
					</div>
				)}
			</div>

			<div className="grid grid-cols-2 gap-x-3 gap-y-2">
				<Metric label="Current" value={fmt(state.current, " A")} />
				<Metric label="Temp" value={fmt(state.temperature, " °C", 1)} />
				<Metric label="Charge" value={fmt(state.charge, " Ah")} />
				<Metric label="Capacity" value={fmt(state.capacity, " Ah")} />
				<Metric
					label="Design"
					value={fmt(state.designCapacity, " Ah")}
				/>
				<Metric
					label="Status"
					value={enumLabel(STATUS_LABELS, state.powerSupplyStatus)}
				/>
			</div>

			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
				<span>
					{enumLabel(TECH_LABELS, state.powerSupplyTechnology)}
				</span>
				{currentHint && <span>· {currentHint}</span>}
			</div>

			{/* Per-cell arrays behind a toggle to keep the card compact. */}
			{(cellVoltage.length > 0 || cellTemperature.length > 0) && (
				<div className="flex flex-col gap-1 border-t pt-2">
					<button
						type="button"
						onClick={() => setShowCells((prev) => !prev)}
						className="text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
					>
						{showCells ? "▾" : "▸"} Cells (
						{Math.max(cellVoltage.length, cellTemperature.length)})
					</button>
					{showCells && (
						<div className="flex flex-col gap-2 text-[11px]">
							{cellVoltage.length > 0 && (
								<div className="flex flex-col gap-1">
									<span className="font-medium text-muted-foreground">
										Voltage
									</span>
									<div className="flex flex-wrap gap-1">
										{cellVoltage.map((v, i) => (
											<span
												key={`v${i}`}
												className="rounded bg-muted px-1 tabular-nums"
											>
												{fmt(v, "V")}
											</span>
										))}
									</div>
								</div>
							)}
							{cellTemperature.length > 0 && (
								<div className="flex flex-col gap-1">
									<span className="font-medium text-muted-foreground">
										Temperature
									</span>
									<div className="flex flex-wrap gap-1">
										{cellTemperature.map((v, i) => (
											<span
												key={`t${i}`}
												className="rounded bg-muted px-1 tabular-nums"
											>
												{fmt(v, "°", 1)}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Renders one {@link BatteryCard} per discovered BatteryState topic.
 * Reads `getSource`/`getTopicHealth` from the provider at render; owns no
 * per-message state of its own.
 */
function BatteryGrid({
	topics,
	columns,
	showCells,
}: {
	topics: SelectedTopic[];
	columns: number;
	showCells: boolean;
}) {
	const gridTemplateColumns =
		columns > 0
			? `repeat(${columns}, minmax(0, 1fr))`
			: "repeat(auto-fill, minmax(220px, 1fr))";

	return (
		<div className="h-full overflow-auto p-2">
			<div className="grid gap-2" style={{ gridTemplateColumns }}>
				{topics.map((topic) => (
					<BatteryCard
						key={`${topic.source.id}::${topic.topic}`}
						topic={topic}
						defaultShowCells={showCells}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * Battery State widget host: discovers every `sensor_msgs/msg/BatteryState`
 * topic across all datasources and subscribes to all of them at once.
 *
 * Topic discovery is delegated to {@link useDiscoveredTopics}, which keeps the
 * `SelectedTopics` array identity stable unless the topic set actually changed,
 * so the local provider does not resubscribe on every poll.
 *
 * This is the module-level, stable `Component` reference for the widget
 * definition (widget pattern #10): it holds the polling interval and the
 * subscriptions, so a per-render inline component would remount and thrash them.
 */
const BatteryStateWidget: React.FC<BatteryWidgetProps> = (props) => {
	const topics = useDiscoveredTopics({
		webappType: BATTERY_WEBAPP_TYPE,
		rosType: BATTERY_ROS_TYPE,
	});
	const columns = Number(props.columns) || 0;
	const showCells = props.showCells === true;

	if (topics.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-3 text-sm text-muted-foreground">
				No battery topics found
			</div>
		);
	}

	return (
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={1}>
			<BatteryGrid
				topics={topics}
				columns={columns}
				showCells={showCells}
			/>
		</LocalDataSourcesProvider>
	);
};

/**
 * Widget definition for the Battery State widget.
 * @returns Widget definition.
 */
export function BatteryStateWidgetDefinition(): WidgetDefinition<BatteryWidgetProps> {
	return {
		id: "battery-state-widget",
		name: "Battery State",
		description:
			"Auto-subscribes to every sensor_msgs/msg/BatteryState topic and renders each battery's full state as a card",
		titleProp: "title",
		icon: <BatteryFull />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				columns: {
					type: "number",
					title: "Columns (0 = auto)",
				},
				showCells: {
					type: "boolean",
					title: "Expand per-cell arrays",
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
				},
				{
					type: "Control",
					scope: "#/properties/columns",
				},
				{
					type: "Control",
					scope: "#/properties/showCells",
				},
			],
		},

		data: {
			title: "Battery State",
			columns: 0,
			showCells: false,
		},
		Component: BatteryStateWidget,
	} as WidgetDefinition<BatteryWidgetProps>;
}
