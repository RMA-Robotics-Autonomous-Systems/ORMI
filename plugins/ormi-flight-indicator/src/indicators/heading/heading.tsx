import { useEffect, useState } from "react";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { ControlElement, VerticalLayout } from "@jsonforms/core";

import { HeadingIndicator } from "react-typescript-flight-indicators";

import { CompassIcon } from "lucide-react";
import {
	SelectedTopic,
	useLocalDataSource,
	DatasourceTopic,
	DatasourceTopicFilter,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { readOrientation } from "../orientation";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

/**
 * Props for heading indicator widget.
 */
interface HeadingProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	orientationAxis: string;
	imuFrame: "ENU" | "NED" | "NWU";
}

/**
 * Heading indicator widget displaying compass heading.
 * @param props - Widget props.
 * @returns React element.
 */
export function WidgetHeadingIndicator(props: HeadingProps) {
	const { getSource } = useLocalDataSource();
	const [heading, setHeading] = useState(0);

	useEffect(() => {
		const data = getSource(props.topic);
		if (!data) {
			return;
		}

		const quaternion = readOrientation(data.data[0]);
		if (!quaternion) {
			return;
		}

		// convert the quaternion to euler angles
		const q0 = quaternion.w;
		const q1 = quaternion.x;
		const q2 = quaternion.y;
		const q3 = quaternion.z;

		// Convert quaternion to Euler angles (ZYX convention)
		// Roll (x-axis rotation)
		const sinr_cosp = 2 * (q0 * q1 + q2 * q3);
		const cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2);
		const roll = Math.atan2(sinr_cosp, cosr_cosp);

		// Pitch (y-axis rotation)
		const sinp = 2 * (q0 * q2 - q3 * q1);
		const pitch =
			Math.abs(sinp) >= 1
				? (Math.sign(sinp) * Math.PI) / 2
				: Math.asin(sinp);

		// Yaw (z-axis rotation)
		const siny_cosp = 2 * (q0 * q3 + q1 * q2);
		const cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3);
		const yaw = Math.atan2(siny_cosp, cosy_cosp);

		// Select the appropriate angle based on heading axis
		let headingRadians = 0;
		switch (props.orientationAxis) {
			case "X":
				headingRadians = roll;
				break;
			case "Y":
				headingRadians = pitch;
				break;
			case "Z":
				headingRadians = yaw;
				break;
		}

		// Convert based on IMU frame convention to aviation standard (0° = North)
		switch (props.imuFrame) {
			case "ENU": // East-North-Up: 0° = East, need to rotate 90° so 0° = North
				headingRadians = -(headingRadians - Math.PI / 2); // Convert East to North and flip sign to correct E/W
				break;
			case "NED": // North-East-Down: 0° = North (already correct)
				// No conversion needed
				break;
			case "NWU": // North-West-Up: 0° = North but coordinates are mirrored
				headingRadians = -headingRadians; // Mirror for West-positive convention
				break;
		}

		// Convert to degrees (HeadingIndicator expects degrees with 0° = North)
		setHeading((headingRadians * 180) / Math.PI);
	}, [getSource, props.topic, props.orientationAxis, props.imuFrame]);

	return (
		<div
			className="flex justify-center items-center"
			style={{ padding: "1rem", height: "100%" }}
		>
			<HeadingIndicator size={"100%"} heading={heading} showBox={false} />
		</div>
	);
}

/**
 * Heading widget wrapper providing the local datasource for the indicator.
 * @param data - Widget props.
 * @returns React element.
 */
const HeadingWidget: React.FC<HeadingProps> = (data) =>
	data.topic ? (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<WidgetHeadingIndicator {...data} />
		</LocalDataSourcesProvider>
	) : (
		<div className="flex justify-center items-center h-full text-muted-foreground">
			Please select a topic in the widget configuration.
		</div>
	);

/** Settings for Heading widget. */

/**
 * Widget definition for heading indicator.
 * @returns Widget definition.
 */
export function HeadingDefinition(): WidgetDefinition<HeadingProps> {
	return {
		id: "heading-widget",
		name: "Heading Indicator",
		description: "Heading Indicator",
		titleProp: "title",
		icon: <CompassIcon />,
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
				orientationAxis: {
					type: "string",
					title: "Orientation Axis",
					enum: ["X", "Y", "Z"],
					default: "Z",
				},
				imuFrame: {
					type: "string",
					title: "IMU Frame Convention",
					enum: ["ENU", "NED", "NWU"],
					default: "ENU",
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
						// The subject is an orientation, wherever it is
						// published. `IMU` and `Pose` each hold exactly one
						// field of quaternion shape, so reading it out of
						// either is a fact and not a guess; a quaternion topic
						// *is* the orientation. `readOrientation` is what makes
						// the four shapes one.
						//
						// Which of those types a click should actually land
						// here for is not a question `dataRequirements` can
						// answer — it says what the slot may take, not what a
						// topic wants — so the plugin's topic claims say it,
						// per type rather than per slot: `IMU` is the level indicator's,
						// `Pose` and a bare quaternion are alternatives,
						// because each carries more than the one orientation
						// these instruments read.
						dataRequirements: {
							accepts: ["IMU", "Pose"],
							acceptsRaw: [
								"geometry_msgs/msg/Quaternion",
								"geometry_msgs/msg/QuaternionStamped",
							],
						},
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/orientationAxis",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/imuFrame",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Heading Indicator",
		},
		Component: HeadingWidget,
	};
}
