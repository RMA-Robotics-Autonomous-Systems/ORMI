import { CloudIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { PointsCloudProps } from "./types/points-cloud-drei-types";
import { PointsCloudComp } from "./components/points-cloud-drei-comp";
import { LocalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { FrameSelectElement } from "@workspace/ormi-core/widgets";

/**
 * Definition for the PointsCloudDrei widget with schema configuration
 */
export function PointsCloudDreiDefinition() {
	return {
		id: "std-points-cloud-drei",
		name: "Points Cloud Drei",
		description:
			"Display a real-time points cloud using optimized rendering",
		titleProp: "title",
		icon: <CloudIcon />,
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				topics: {
					type: "array",
					title: "Topics",
					items: {
						type: "object",
						properties: {
							topic: { type: "object", title: "Topic" },
						},
						required: ["topic"],
					},
				},
				pointSize: {
					type: "number",
					title: "Point Size",
					minimum: 0.001,
					default: 0.05,
				},
				rollingBuffer: {
					type: "boolean",
					title: "Rolling Buffer",
					description:
						"Accumulate points over time instead of replacing",
				},
				decayTime: {
					type: "number",
					title: "Decay Time (ms)",
					minimum: 0,
					description:
						"Remove points older than this (only with rolling buffer)",
				},
				theme: {
					type: "string",
					title: "Color Theme",
					enum: [
						"Default",
						"Neon",
						"Plasma",
						"Thermal",
						"Solid",
						"Distance",
					],
					default: "Default",
				},
				colorMode: {
					type: "string",
					title: "Color Mode",
					enum: ["source", "reflectivity"],
					default: "source",
					description:
						"Use source colors or map reflectivity to theme",
				},
				useTransparency: {
					type: "boolean",
					title: "Transparency",
					description: "Enable transparency for smoother point edges",
					default: false,
				},
				customColor: {
					type: "string",
					title: "Custom Color",
					description: "Color for Solid theme (hex format)",
					default: "#ffffff",
				},
				targetFrame: {
					type: "string",
					title: "Target Frame",
					description: "Transform points into this coordinate frame",
				},
				sourceConvention: {
					type: "string",
					title: "Source Coordinate System",
					enum: ["ROS", "THREE", "ENU", "NED", "NWU"],
					default: "ROS",
					description:
						"Coordinate convention of the incoming data (ROS, ENU, NED, NWU, or Three.js)",
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
					type: "Control",
					scope: "#/properties/topics",
					options: {
						detail: {
							type: "VerticalLayout",
							elements: [
								{
									type: "TopicSelect",
									scope: "#/properties/topic",
									options: {
										dataRequirements: {
											accepts: ["PointsCloud"],
										},
									},
								},
							],
						},
					},
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/pointSize",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/colorMode",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/theme",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/customColor",
					rule: {
						effect: "SHOW",
						condition: {
							scope: "#/properties/theme",
							schema: { enum: ["Solid"] },
						},
					},
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/useTransparency",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/rollingBuffer",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/decayTime",
					rule: {
						effect: "SHOW",
						condition: {
							scope: "#/properties/rollingBuffer",
							schema: { const: true },
						},
					},
				} as ControlElement,
				{
					type: "FrameSelect",
					scope: "#/properties/targetFrame",
					options: {
						placeholder: "Select target frame",
					},
				} as FrameSelectElement,
				{
					type: "Control",
					scope: "#/properties/sourceConvention",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Points Cloud",
			pointSize: 0.05,
			rollingBuffer: false,
			decayTime: 1000,
			theme: "Default",
			colorMode: "source",
			useTransparency: false,
			customColor: "#ffffff",
			targetFrame: "",
			sourceConvention: "ROS",
			topics: [],
		},
		Component: (data: PointsCloudProps) => (
			<LocalDataSourcesProvider
				SelectedTopics={
					data.topics && data.topics.length > 0
						? data.topics.map((entry) => entry.topic)
						: []
				}
				buffersSize={1}
			>
				<PointsCloudComp {...data} />
			</LocalDataSourcesProvider>
		),
	};
}
