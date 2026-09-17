import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	useLocalDataSource,
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { Axis3dIcon } from "lucide-react";

/** Components a vector may carry, in the order they are shown. */
const COMPONENTS = ["x", "y", "z", "w"] as const;

/** One component name of a vector. */
type ComponentName = (typeof COMPONENTS)[number];

/** Props for the vector readout widget. */
interface VectorReadoutProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	precision: number;
	showMagnitude: boolean;
}

/** Props for the readout body. */
interface VectorReadoutBodyProps {
	/** Display title of the backing datasource, for the offline card. */
	sourceTitle: string;
	/** Decimal places every component is rendered with. */
	precision: number;
	/** Whether the Euclidean norm is shown under the components. */
	showMagnitude: boolean;
}

/**
 * Read the numeric components a message carries, in `x, y, z, w` order.
 *
 * Only the components actually present are returned, so a `Vector2` renders as
 * two rows rather than two rows and two zeroes — a zero the operator cannot
 * tell apart from a measured one is worse than an absent row.
 *
 * @param message - One buffered message from the bound topic.
 * @returns The present components, empty when the message is not a vector.
 */
function readComponents(message: unknown): [ComponentName, number][] {
	if (!message || typeof message !== "object") return [];
	const source = message as Record<string, unknown>;

	const present: [ComponentName, number][] = [];
	for (const name of COMPONENTS) {
		const value = source[name];
		if (typeof value === "number" && Number.isFinite(value)) {
			present.push([name, value]);
		}
	}
	return present;
}

/**
 * Vector readout body: the components of the bound topic as labelled numbers.
 *
 * @param props - Component props.
 * @returns React element.
 */
function VectorReadout(props: VectorReadoutBodyProps) {
	const { sources, health } = useLocalDataSource();
	const firstKey = Array.from(sources.keys())[0];
	const message = firstKey ? sources.get(firstKey)?.data[0] : undefined;
	const components = readComponents(message);

	// Clamped rather than trusted: `precision` is persisted with the workspace
	// and `toFixed` throws a RangeError outside 0..100, which would take the
	// tile down rather than show a badly rounded number.
	const precision = Math.min(
		Math.max(Math.trunc(props.precision ?? 3), 0),
		9,
	);

	const magnitude = Math.sqrt(
		components.reduce((sum, [, value]) => sum + value * value, 0),
	);

	return (
		<DatasourceGate health={health} title={props.sourceTitle}>
			{components.length === 0 ? (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					Waiting for a vector on this topic.
				</div>
			) : (
				<div className="flex h-full flex-col justify-center gap-1 p-3 font-mono text-sm tabular-nums">
					{components.map(([name, value]) => (
						<div
							key={name}
							className="flex items-baseline justify-between gap-3"
						>
							<span className="text-muted-foreground uppercase">
								{name}
							</span>
							<span>{value.toFixed(precision)}</span>
						</div>
					))}
					{props.showMagnitude && (
						<div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-1">
							<span className="text-muted-foreground">|v|</span>
							<span>{magnitude.toFixed(precision)}</span>
						</div>
					)}
				</div>
			)}
		</DatasourceGate>
	);
}

/**
 * Vector readout widget: subscribes to the configured topic and renders it.
 *
 * Module-level and stable, because the dashboard uses `definition.Component`
 * directly as the component type.
 *
 * @param data - Widget settings.
 * @returns React element.
 */
function VectorReadoutWidget(data: VectorReadoutProps) {
	return data.topic ? (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<VectorReadout
				sourceTitle={data.topic.source.title}
				precision={data.precision}
				showMagnitude={data.showMagnitude}
			/>
		</LocalDataSourcesProvider>
	) : (
		<div className="flex justify-center items-center h-full text-muted-foreground">
			Please select a topic in the widget configuration.
		</div>
	);
}

/**
 * Widget definition for the vector readout.
 *
 * The plain answer to "what is on this vector topic": nothing else in the
 * registry takes a bare vector as its *subject*, so before this widget a
 * `Vector2`/`Vector3`/`Vector4` click could only be answered with a raw JSON
 * viewer or with an instrument that reinterprets the vector as something else.
 *
 * @returns Widget definition.
 */
export function VectorReadoutDefinition(): WidgetDefinition<VectorReadoutProps> {
	return {
		id: "vector-readout-widget",
		name: "Vector readout",
		description: "Show the components of a vector topic as numbers",
		titleProp: "title",
		icon: <Axis3dIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				topic: {
					type: "object",
					title: "Topic",
				},
				precision: {
					type: "integer",
					title: "Decimals",
					minimum: 0,
					maximum: 9,
					default: 3,
				},
				showMagnitude: {
					type: "boolean",
					title: "Show magnitude",
					default: true,
				},
			},
			// `topic` stays out: a topic binding cannot carry an honest
			// default, because no datasource exists when the definition is
			// built, and a required property with no default fails AJV before
			// the operator has touched the dialog.
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
							accepts: ["Vector2", "Vector3", "Vector4"],
						},
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/precision",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/showMagnitude",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Vector readout",
			precision: 3,
			showMagnitude: true,
		},
		Component: VectorReadoutWidget,
	} as WidgetDefinition<VectorReadoutProps>;
}
