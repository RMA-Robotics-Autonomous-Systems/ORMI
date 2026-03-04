import { ControlElement, Categorization, Category } from "@jsonforms/core";
import {
	LocalDataSourcesProvider,
	PublisherDataSourcesProvider,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import {
	WidgetDefinition,
	FrameSelectElement,
	TopicSelectElement,
} from "@workspace/ormi-core/widgets";
import { KeyControlType } from "@workspace/ormi-jsonforms";
import { Box as Box3DIcon } from "lucide-react";
import { Scene3DComp } from "./components/scene-3d-comp";
import { Scene3DProps } from "./types/scene-3d-types";

/**
 * Unified 3D Scene widget definition
 * Combines Point Cloud and Path visualization in a single 3D canvas
 */
export function Scene3DDefinition(): WidgetDefinition<Scene3DProps> {
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
							topic: {
								type: "object",
								title: "Topic",
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
				// Map Grid Layers (OccupancyGrid / Costmap)
				mapGridLayers: {
					type: "array",
					title: "Map Grid Layers",
					items: {
						type: "object",
						properties: {
							enabled: {
								type: "boolean",
								title: "Enabled",
								default: true,
							},
							topic: { type: "object", title: "Topic" },
							colorMode: {
								type: "string",
								title: "Color Mode",
								enum: ["costmap", "grayscale", "heatmap"],
								default: "costmap",
							},
							opacity: {
								type: "number",
								title: "Opacity",
								minimum: 0,
								maximum: 1,
								default: 0.85,
							},
							showUnknown: {
								type: "boolean",
								title: "Show Unknown Cells",
								default: true,
							},
						},
					},
				},
				// Transform Tree Visualization
				transformTree: {
					type: "object",
					title: "Transform Tree",
					properties: {
						enabled: {
							type: "boolean",
							title: "Show Transform Tree",
							default: false,
						},
						sphereRadius: {
							type: "number",
							title: "Frame Sphere Radius",
							minimum: 0.01,
							maximum: 1.0,
							default: 0.05,
						},
						cylinderRadius: {
							type: "number",
							title: "Connection Cylinder Radius",
							minimum: 0.005,
							maximum: 0.5,
							default: 0.02,
						},
						colorScheme: {
							type: "string",
							title: "Color Scheme",
							enum: ["depth", "uniform", "rainbow"],
							default: "depth",
						},
						uniformColor: {
							type: "string",
							title: "Uniform Color",
							default: "#00ff88",
						},
						showLabels: {
							type: "boolean",
							title: "Show Frame Labels",
							default: true,
						},
					},
				},
				// Unified Pose Publisher
				posePublisherConfig: {
					type: "object",
					title: "Pose Publisher",
					properties: {
						enabled: {
							type: "boolean",
							title: "Enabled",
							default: false,
						},
						goalTopic: {
							type: "object",
							title: "Goal Pose Topic",
						},
						initialTopic: {
							type: "object",
							title: "Initial Pose Topic",
						},
						frameId: {
							type: "string",
							title: "Frame ID",
							default: "map",
						},
						goalShortcut: {
							type: "object",
							title: "Goal Pose Shortcut",
						},
						initialShortcut: {
							type: "object",
							title: "Initial Pose Shortcut",
						},
						markerColor: {
							type: "string",
							title: "Marker Color",
							default: "#ff4400",
						},
						markerSize: {
							type: "number",
							title: "Marker Size",
							minimum: 0.1,
							maximum: 5.0,
							default: 0.5,
						},
					},
				},
				// Joint Controller
				jointController: {
					type: "object",
					title: "Joint Controller",
					properties: {
						enabled: {
							type: "boolean",
							title: "Enabled",
							default: false,
						},
						jointStateTopic: {
							type: "object",
							title: "Joint State Topic",
						},
						commandTopic: {
							type: "object",
							title: "Command Topic",
						},
						duration: {
							type: "number",
							title: "Duration (sec)",
							minimum: 0.1,
							default: 1,
						},
					},
				},
			},
			required: ["title"],
		},
		uischema: {
			type: "Categorization",
			elements: [
				// Tab 1: General Settings
				{
					type: "Category",
					label: "General",
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
						{
							type: "Control",
							scope: "#/properties/transformTree/properties/enabled",
							label: "Show Transform Tree",
						} as ControlElement,
					],
				} as Category,
				// Tab 2: Topics
				{
					type: "Category",
					label: "Topics",
					elements: [
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
											scope: "#/properties/enabled",
										} as ControlElement,
										{
											type: "TopicSelect",
											scope: "#/properties/topic",
											options: {
												dataRequirements: {
													accepts: ["PointsCloud"],
												},
											},
										},
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
											options: { color: true },
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
											options: { color: true },
										} as ControlElement,
									],
								},
							},
						} as ControlElement,
						// Map Grid Layers
						{
							type: "Control",
							scope: "#/properties/mapGridLayers",
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
													accepts: ["MapGrid"],
												},
											},
										},
										{
											type: "Control",
											scope: "#/properties/colorMode",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/opacity",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/showUnknown",
										} as ControlElement,
									],
								},
							},
						} as ControlElement,
					],
				} as Category,
				// Tab 3: Transform Tree Settings
				{
					type: "Category",
					label: "Transform Tree",
					elements: [
						{
							type: "Control",
							scope: "#/properties/transformTree/properties/sphereRadius",
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/transformTree/properties/cylinderRadius",
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/transformTree/properties/colorScheme",
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/transformTree/properties/uniformColor",
							options: { color: true },
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/transformTree/properties/showLabels",
						} as ControlElement,
					],
				} as Category,
				// Tab 4: Pose Publisher
				{
					type: "Category",
					label: "Pose Publisher",
					elements: [
						{
							type: "Control",
							scope: "#/properties/posePublisherConfig/properties/enabled",
						} as ControlElement,
						{
							type: "TopicSelect",
							scope: "#/properties/posePublisherConfig/properties/goalTopic",
							options: {
								dataRequirements: {
									accepts: ["Pose"],
								},
							},
						} as TopicSelectElement,
						{
							type: "TopicSelect",
							scope: "#/properties/posePublisherConfig/properties/initialTopic",
							options: {
								dataRequirements: {
									accepts: ["InitialPose"],
								},
							},
						} as TopicSelectElement,
						{
							type: "FrameSelect",
							scope: "#/properties/posePublisherConfig/properties/frameId",
							options: {
								placeholder: "map",
							},
						} as FrameSelectElement,
						{
							type: "Key",
							scope: "#/properties/posePublisherConfig/properties/goalShortcut",
						} as KeyControlType,
						{
							type: "Key",
							scope: "#/properties/posePublisherConfig/properties/initialShortcut",
						} as KeyControlType,
						{
							type: "Control",
							scope: "#/properties/posePublisherConfig/properties/markerColor",
							options: { color: true },
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/posePublisherConfig/properties/markerSize",
						} as ControlElement,
					],
				} as Category,
				// Tab 5: Joint Controller
				{
					type: "Category",
					label: "Joint Controller",
					elements: [
						{
							type: "Control",
							scope: "#/properties/jointController/properties/enabled",
						} as ControlElement,
						{
							type: "TopicSelect",
							scope: "#/properties/jointController/properties/jointStateTopic",
							options: {
								dataRequirements: {
									accepts: ["JointState"],
								},
							},
						} as TopicSelectElement,
						{
							type: "TopicSelect",
							scope: "#/properties/jointController/properties/commandTopic",
							options: {
								dataRequirements: {
									accepts: ["JointTrajectory"],
								},
							},
						} as TopicSelectElement,
						{
							type: "Control",
							scope: "#/properties/jointController/properties/duration",
						} as ControlElement,
					],
				} as Category,
			],
		} as Categorization,
		data: {
			title: "3D Scene",
			targetFrame: "",
			showGrid: true,
			showAxes: true,
			pointCloudLayers: [],
			pathLayers: [],
			mapGridLayers: [],
			transformTree: {
				enabled: true,
				sphereRadius: 0.05,
				cylinderRadius: 0.02,
				colorScheme: "depth",
				uniformColor: "#00ff88",
				showLabels: true,
			},
			posePublisherConfig: {
				enabled: false,
				frameId: "map",
				goalShortcut: { type: "keyboard", key: "g" },
				initialShortcut: { type: "keyboard", key: "p" },
				markerColor: "#ff4400",
				markerSize: 0.5,
			},
			jointController: {
				enabled: false,
				duration: 1,
			},
		},
		Component: (data: Scene3DProps) => {
			// Collect all topics from all layers for the data source provider
			const allTopics: SelectedTopic[] = [];

			if (data.pointCloudLayers) {
				for (const layer of data.pointCloudLayers) {
					if (layer.enabled === false) continue;
					if (layer.topic) {
						allTopics.push(layer.topic);
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

			if (data.mapGridLayers) {
				for (const layer of data.mapGridLayers) {
					if (layer.enabled === false) continue;
					if (layer.topic) {
						allTopics.push(layer.topic);
					}
				}
			}

			// Subscribe to joint state topic for the joint controller
			if (
				data.jointController?.enabled &&
				data.jointController.jointStateTopic
			) {
				allTopics.push(data.jointController.jointStateTopic);
			}

			// Collect publisher topics (command side)
			const publisherTopics: SelectedTopic[] = [];
			if (
				data.jointController?.enabled &&
				data.jointController.commandTopic
			) {
				publisherTopics.push(data.jointController.commandTopic);
			}

			return (
				<PublisherDataSourcesProvider SelectedTopics={publisherTopics}>
					<LocalDataSourcesProvider
						SelectedTopics={allTopics}
						buffersSize={1}
					>
						<Scene3DComp {...data} />
					</LocalDataSourcesProvider>
				</PublisherDataSourcesProvider>
			);
		},
	};
}
