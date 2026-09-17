import { useEffect, useState } from "react";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { ControlElement, VerticalLayout } from "@jsonforms/core";

import { Airspeed } from "react-typescript-flight-indicators";

import { GaugeCircleIcon } from "lucide-react";
import {
	SelectedTopic,
	useLocalDataSource,
	DatasourceTopic,
	DatasourceTopicFilter,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { Movement, Vector3 } from "@workspace/ormi-core/types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

/**
 * Props for airspeed indicator widget.
 */
interface AirSpeedProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	speedAxis: string;
	invert: boolean;
}

/**
 * Airspeed indicator widget displaying movement speed.
 * @param props - Widget props.
 * @returns React element.
 */
export function WidgetAirspeedIndicator(props: AirSpeedProps) {
	const { getSource } = useLocalDataSource();

	const [speed, setSpeed] = useState(0);

	useEffect(() => {
		const data = getSource(props.topic);

		if (!data) {
			return;
		}

		const value = data.data[0] as Movement | Vector3;
		if (!value) {
			return;
		}

		// The slot takes a `Movement`, whose speed lives in `linear`, and a
		// bare `Vector3`, which *is* the speed. Both arrive here as the same
		// three components once the wrapper is stepped over.
		const source = ((value as Movement).linear ?? value) as Vector3;

		// A copy, never the message: `data.data` holds the datasource's own
		// buffered message, and scaling it in place would compound on every
		// re-run of this effect and corrupt the value for every other widget
		// reading the same topic.
		const sign = props.invert ? -1 : 1;
		const KNOTS_PER_MPS = 1.94384;
		const speeds = {
			x: (source.x ?? 0) * KNOTS_PER_MPS * sign,
			y: (source.y ?? 0) * KNOTS_PER_MPS * sign,
			z: (source.z ?? 0) * KNOTS_PER_MPS * sign,
		};

		switch (props.speedAxis) {
			case "x":
				setSpeed(speeds.x);
				break;
			case "y":
				setSpeed(speeds.y);
				break;
			case "z":
				setSpeed(speeds.z);
				break;
			case "all":
				setSpeed(
					Math.sqrt(
						speeds.x * speeds.x +
							speeds.y * speeds.y +
							speeds.z * speeds.z,
					),
				);
				break;
			default:
				setSpeed(speeds.x);
				break;
		}
	}, [getSource, props.topic, props.speedAxis, props.invert]);

	return (
		<div
			className="flex justify-center items-center"
			style={{ padding: "1rem", height: "100%" }}
		>
			<Airspeed speed={speed * 10} size={"100%"} showBox={false} />
		</div>
	);
}

// a few lines later ...

/**
 * Airspeed widget wrapper providing the local datasource for the indicator.
 * @param data - Widget props.
 * @returns React element.
 */
const AirspeedWidget: React.FC<AirSpeedProps> = (data) =>
	data.topic ? (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<WidgetAirspeedIndicator {...data} />
		</LocalDataSourcesProvider>
	) : (
		<div className="flex justify-center items-center h-full text-muted-foreground">
			Please select a topic in the widget configuration.
		</div>
	);

/** Settings for Airspeed widget. */

/**
 * Widget definition for airspeed indicator.
 * @returns Widget definition.
 */
export function AirspeedDefinition(): WidgetDefinition<AirSpeedProps> {
	return {
		id: "speed-widget",
		name: "Speed Indicator",
		description: "Speed Indicator",
		titleProp: "title",
		icon: <GaugeCircleIcon />,
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
				speedAxis: {
					type: "string",
					title: "Speed Axis",
					enum: ["x", "y", "z", "all"],
				},
				invert: {
					type: "boolean",
					title: "Invert",
					default: false,
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
						// The type claim is true and stays: this widget reads
						// `linear.{x,y,z}` off a Twist. What is NOT true is
						// that a `Movement` topic wants a gauge. `Movement`
						// covers `geometry_msgs/Twist` and `TwistStamped`
						// alike, and in the field a bare Twist is
						// overwhelmingly a *command* (`/cmd_vel`); a measured
						// velocity arrives inside an odometry message, which
						// is not a `Movement` at all. A dial reads as a
						// measurement, so a commanded value shown on one is
						// read as one.
						//
						// `dataRequirements` cannot express that difference —
						// both are the same type — and it is not the place to:
						// it answers whether this slot *may* take a `Movement`,
						// which it may. Whether a `Movement` click should land
						// here is a routing question, and the plugin's topic
						// claims answer it — `alternative`, so the slot stays a
						// real destination that is offered beside the teleop
						// control that publishes the topic, and is never the
						// answer on its own.
						//
						// `Vector3` is widened onto the same slot: the widget
						// reads three components and the operator already
						// chooses which one with `speedAxis`, so a bare
						// velocity vector is shown honestly rather than not at
						// all. It is claimed as an alternative for the same
						// reason — a vector's components are not necessarily
						// speeds, and the vector readout is the confident
						// answer for a `Vector3` click.
						dataRequirements: {
							accepts: ["Movement", "Vector3"],
						},
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/speedAxis",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/invert",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Speed Indicator",
		},
		Component: AirspeedWidget,
	};
}
