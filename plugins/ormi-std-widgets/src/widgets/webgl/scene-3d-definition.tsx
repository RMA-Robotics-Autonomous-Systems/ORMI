import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	LocalDataSourcesProvider,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import {
	WidgetDefinition,
	FrameSelectElement,
} from "@workspace/ormi-core/widgets";
import { Box as Box3DIcon } from "lucide-react";
import { Scene3DComp } from "./components/scene-3d-comp";
import { Scene3DProps } from "./types/scene-3d-types";

/**
 * Unified 3D Scene widget definition
 * Combines Point Cloud and Path visualization in a single 3D canvas
 */
export function Scene3DDefinition(): WidgetDefinition {
	return {
		id: "std-scene-3d",
		name: "3D Scene",
		description:
			"Unified 3D visualization with support for point clouds, paths, and more",
		titleProp: "title",
		icon: <Box3DIcon />,
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				targetFrame: {
					type: "string",
					title: "Target Frame",
					description:
						"Transform all layers into this coordinate frame",
				},
				showGrid: {
					type: "boolean",
					title: "Show Grid",
					default: true,
				},
				showAxes: {
					type: "boolean",
					title: "Show Axes",
					default: true,
				},
				// Point Cloud Layers
				pointCloudLayers: {
					type: "array",
					title: "Point Cloud Layers",
					items: {
						type: "object",
						properties: {
							label: {
								type: "string",
								title: "Label",
							},
							enabled: {
								type: "boolean",
								title: "Enabled",
								default: true,
							},
							topics: {
								type: "array",
								title: "Topics",
								items: {
									type: "object",
									properties: {
										topic: {
											type: "object",
											title: "Topic",
										},
									},
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
								default: false,
							},
							decayTime: {
								type: "number",
								title: "Decay Time (ms)",
								minimum: 0,
								default: 1000,
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
							},
							useTransparency: {
								type: "boolean",
								title: "Transparency",
								default: false,
							},
							customColor: {
								type: "string",
								title: "Custom Color",
								default: "#ffffff",
							},
						},
					},
				},
				// Path Layers
				pathLayers: {
					type: "array",
					title: "Path Layers",
					items: {
						type: "object",
						properties: {
							label: {
								type: "string",
								title: "Label",
							},
							enabled: {
								type: "boolean",
								title: "Enabled",
								default: true,
							},
							topic: { type: "object", title: "Topic" },
							lineWidth: {
								type: "number",
								title: "Line Width",
								minimum: 0.001,
								default: 15,
							},
							lineColor: {
								type: "string",
								title: "Line Color",
								default: "#3b82f6",
							},
						},
					},
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
					type: "FrameSelect",
					scope: "#/properties/targetFrame",
					options: {
						placeholder: "Select target frame",
					},
				} as FrameSelectElement,
				{
					type: "Control",
					scope: "#/properties/showGrid",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/showAxes",
				} as ControlElement,
				// Point Cloud Layers
				{
					type: "Control",
					scope: "#/properties/pointCloudLayers",
					options: {
						detail: {
							type: "VerticalLayout",
							elements: [
								{
									type: "Control",
									scope: "#/properties/label",
								} as ControlElement,
								{
									type: "Control",
									scope: "#/properties/enabled",
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
															accepts: [
																"PointsCloud",
															],
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
								} as ControlElement,
							],
						},
					},
				} as ControlElement,
				// Path Layers
				{
					type: "Control",
					scope: "#/properties/pathLayers",
					options: {
						detail: {
							type: "VerticalLayout",
							elements: [
								{
									type: "Control",
									scope: "#/properties/enabled",
								} as ControlElement,
								{
									type: "TopicSelect",
									scope: "#/properties/topic",
									options: {
										dataRequirements: {
											accepts: ["Path"],
										},
									},
								},
								{
									type: "Control",
									scope: "#/properties/lineWidth",
								} as ControlElement,
								{
									type: "Control",
									scope: "#/properties/lineColor",
								} as ControlElement,
							],
						},
					},
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "3D Scene",
			targetFrame: "",
			showGrid: true,
			showAxes: true,
			pointCloudLayers: [],
			pathLayers: [],
		},
		Component: (data: Scene3DProps) => {
			// Collect all topics from all layers for the data source provider
			const allTopics: SelectedTopic[] = [];

			if (data.pointCloudLayers) {
				for (const layer of data.pointCloudLayers) {
					if (layer.enabled === false) continue;
					if (layer.topics) {
						for (const entry of layer.topics) {
							if (entry.topic) {
								allTopics.push(entry.topic);
							}
						}
					}
				}
			}

			if (data.pathLayers) {
				for (const layer of data.pathLayers) {
					if (layer.enabled === false) continue;
					if (layer.topic) {
						allTopics.push(layer.topic);
					}
				}
			}

			return (
				<LocalDataSourcesProvider
					SelectedTopics={allTopics}
					buffersSize={1}
				>
					<Scene3DComp {...data} />
				</LocalDataSourcesProvider>
			);
		},
	};
}
