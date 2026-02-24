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

		const value = data.data[0] as Movement;
		if (!value) {
			return;
		}

		const speeds = value.linear as
			| Vector3
			| { x: number; y: number; z: number };

		// convert m/s to knots
		speeds.x = speeds.x * 1.94384;
		speeds.y = speeds.y * 1.94384;
		speeds.z = speeds.z * 1.94384;

		if (props.invert) {
			speeds.x = -speeds.x;
			speeds.y = -speeds.y;
			speeds.z = -speeds.z;
		}

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
							accepts: ["Movement"], // Accept both webapp type and raw type patterns
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
		Component: (data: AirSpeedProps) => (
			<LocalDataSourcesProvider
				SelectedTopics={[data.topic]}
				buffersSize={1}
			>
				<WidgetAirspeedIndicator {...data} />
			</LocalDataSourcesProvider>
		),
	};
}
