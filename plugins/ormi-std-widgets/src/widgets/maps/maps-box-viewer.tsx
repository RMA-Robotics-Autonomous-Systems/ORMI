"use client";

import React, { useEffect, useRef, useState } from "react";
import MapLibreMap, { MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { ControlElement, Categorization } from "@jsonforms/core";
import { CustomLayersOverlay } from "./layers-overlay";
import MapsGrid, { useMapGrid } from "./gps-components/maps-grid";

import { MapIcon } from "lucide-react";
import {
	SelectedTopic,
	DatasourceTopicFilter,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { Spinner } from "@workspace/ui/components/spinner";
import { ButtonHolderProvider } from "@workspace/ui/combined/ButtonHolder";

// Import new sub-components and hooks
import { useMapStyle } from "./hooks/useMapStyle";
import { useMapInitialization } from "./hooks/useMapInitialization";
import { MapToolbar } from "./components/MapToolbar";
import { GpsTopicsLayer } from "./components/GpsTopicsLayer";
import { LocalTopicsLayer } from "./components/LocalTopicsLayer";
import { LocalTopic } from "./local-topic-visualizer-types";
import { IMULocalTopic } from "./local-components/imu-local";

/** Settings for MapsBoxViewer widget. */
interface MapsViewerSettings {
	title: string;
	mapUrl: string;
	use3D: boolean;
	apiKey?: string;

	// GPS Topics (already in GPS coordinates)
	topics: {
		name: string;
		topic: SelectedTopic;
		makerType: "simple" | "heatmap" | "path" | "multipoints" | any;
		numericalTopic?: SelectedTopic;
	}[];

	// Local Topics (in local frames, need GPS origin for transformation)
	localTopics?: {
		pathTopics: LocalTopic[];
		imuTopics: IMULocalTopic[];
	};

	customLayers: {
		name: string;
		url: string;
		opacity: number;
		visible: boolean;
		bounds?: [[number, number], [number, number]];
	}[];
}

/**
 * Map viewer widget with GPS and local topic layers.
 * @param props - Widget settings.
 * @returns React element.
 */
export default function MapsBoxViewer(props: MapsViewerSettings) {
	// State management
	const [refreshCounter, setRefreshCounter] = useState(0);
	const [showGrid, setShowGrid] = useState(false);
	const [customLayersState, setCustomLayersState] = useState(
		props.customLayers,
	);

	// Refs
	const mapRef = useRef<MapRef>(null);

	// Custom hooks
	const { startingLocation, isLoading } = useMapInitialization();
	const gridHook = useMapGrid(mapRef, showGrid);
	const mapStyle = useMapStyle({
		mapUrl: props.mapUrl,
		use3D: props.use3D,
		apiKey: props.apiKey,
		customLayers: customLayersState,
		showGrid,
	});

	// Handlers for custom layer control
	const handleLayerVisibilityChange = (
		layerIndex: number,
		visible: boolean,
	) => {
		setCustomLayersState((prevLayers) =>
			prevLayers.map((layer, index) =>
				index === layerIndex ? { ...layer, visible } : layer,
			),
		);
	};

	const handleLayerOpacityChange = (layerIndex: number, opacity: number) => {
		setCustomLayersState((prevLayers) =>
			prevLayers.map((layer, index) =>
				index === layerIndex ? { ...layer, opacity } : layer,
			),
		);
	};

	const handleRefresh = () => {
		setRefreshCounter((prev) => prev + 1);
	};

	const handleToggleGrid = () => {
		setShowGrid((prev) => !prev);
	};

	// Sync customLayersState with props.customLayers when props change
	useEffect(() => {
		setCustomLayersState(props.customLayers);
	}, [props.customLayers]);

	if (isLoading) {
		return <Spinner />;
	}

	return (
		<div className="h-full w-full" style={{ display: "grid" }}>
			{/* Map toolbar buttons */}
			<MapToolbar
				mapRef={mapRef}
				showGrid={showGrid}
				onToggleGrid={handleToggleGrid}
				onRefresh={handleRefresh}
			/>
			<ButtonHolderProvider>
				<MapLibreMap
					key={`map-${refreshCounter}`}
					initialViewState={{
						longitude: startingLocation[0],
						latitude: startingLocation[1],
						zoom: 15,
						pitch: 45,
						bearing: 0,
					}}
					style={{ width: "100%", height: "100%" }}
					mapStyle={mapStyle}
					ref={mapRef}
					onMoveEnd={gridHook.updateGridForViewport}
					onZoomEnd={gridHook.updateGridForViewport}
				>
					{/* Grid overlay */}
					<MapsGrid mapRef={mapRef} showGrid={showGrid} />

					{/* GPS Topics Layer */}
					<GpsTopicsLayer
						topics={props.topics || []}
						mapRef={mapRef}
					/>

					{/* Local Topics Layer */}
					<LocalTopicsLayer
						localTopics={[
							...(props.localTopics?.pathTopics || []),
							...(props.localTopics?.imuTopics || []),
						]}
					/>

					{/* Custom Layers Overlay */}
					<CustomLayersOverlay
						customLayers={customLayersState}
						mapRef={mapRef}
						onLayerVisibilityChange={handleLayerVisibilityChange}
						onLayerOpacityChange={handleLayerOpacityChange}
					/>
				</MapLibreMap>
			</ButtonHolderProvider>
		</div>
	);
}

/**
 * Widget definition for MapsBoxViewer.
 * @returns Widget definition.
 */
export function MapsBoxViewerDefinition() {
	const pluginsManager = usePluginsManager();

	const mapType = pluginsManager.applyFilter<string[]>(
		"std-widgets-map-type",
		["simple", "heatmap", "path", "multipoints"],
	);
	const topicFilter = pluginsManager.applyFilter<DatasourceTopicFilter>(
		"std-widgets-map-topic-available-type",
		new DatasourceTopicFilter({ type: /GeolocationPosition/ }),
	);

	return {
		id: "map-box-viewer",
		name: "Maps",
		description: "Display the location of collection of robots",
		titleProp: "title",

		icon: <MapIcon />,

		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},

				mapUrl: {
					type: "string",
					title: "Map URL",
					oneOf: [
						{
							const: "https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png",
							title: "Carto Voyager Labels Under",
						},
						{
							const: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
							title: "OpenStreetMap",
						},
						{
							const: "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
							title: "OpenStreetMap Humanitarian",
						},
						{
							const: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
							title: "OpenTopoMap A",
						},
						{
							//https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/5/15/10.png
							const: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
							title: "Stadia Maps Alidade Smooth Dark",
						},
						{
							//https://tiles.stadiamaps.com/tiles/alidade_satellite/7/72/44.jpg
							const: "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg",
							title: "Stadia Maps Alidade Satellite",
						},
						{
							//https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/88796/141595
							const: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
							title: "ArcGIS World Imagery",
						},
						{
							const: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
							title: "ArcGIS World Topo Map",
						},
						{
							const: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png",
							title: "GeoDataCenter WMTS TopPlus Open (gray)",
						},
						{
							const: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
							title: "GeoDataCenter WMTS TopPlus Open (color)",
						},
					],
					default:
						"https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png",
				},

				use3D: {
					type: "boolean",
					title: "Use 3D",
					default: false,
				},
				apiKey: {
					type: "string",
					title: "API Key",
				},
				topics: {
					type: "array",
					title: "Topics",
					items: {
						type: "object",
						properties: {
							name: { type: "string", title: "Name" },
							makerType: {
								type: "string",
								title: "Marker Type",
								enum: mapType,
							},
							topic: { type: "object", title: "Topic" },
							numericalTopic: {
								type: "object",
								title: "Numerical Topic (only for heatmap)",
							},
						},
					},
				},
				localTopics: {
					type: "object",
					title: "Local Topics",
					properties: {
						pathTopics: {
							type: "array",
							title: "Path Topics",
							items: {
								type: "object",
								properties: {
									name: { type: "string", title: "Name" },
									topic: {
										type: "object",
										title: "Local Topic",
									},
									gpsOriginTopic: {
										type: "object",
										title: "GPS Origin",
									},
									visualizerType: {
										type: "string",
										title: "Visualizer Type (optional)",
									},
									transform: {
										type: "string",
										title: "Transform Mode",
										enum: ["continuous", "first", "none"],
										default: "continuous",
									},
								},
								required: ["name", "topic", "gpsOriginTopic"],
							},
						},
						imuTopics: {
							type: "array",
							title: "IMU Topics",
							items: {
								type: "object",
								properties: {
									name: { type: "string", title: "Name" },
									topic: {
										type: "object",
										title: "IMU Topic",
									},
									gpsOriginTopic: {
										type: "object",
										title: "GPS Origin",
									},
									visualizerType: {
										type: "string",
										title: "Visualizer Type (optional)",
									},
									transform: {
										type: "string",
										title: "Transform Mode",
										enum: ["none"],
										default: "none",
									},
									imuFrame: {
										type: "string",
										title: "IMU Frame Convention",
										enum: ["ENU", "NED", "NWU"],
										default: "ENU",
									},
									headingAxis: {
										type: "string",
										title: "Heading Axis",
										enum: ["X", "Y", "Z"],
										default: "Z",
									},
									minDistance: {
										type: "number",
										title: "Minimum Distance Between Arrows (meters)",
										default: 0.5,
										minimum: 0,
										description:
											"Only show arrows when GPS moves at least this distance",
									},
									maxArrows: {
										type: "number",
										title: "Maximum Number of Arrows",
										default: 500,
										minimum: 1,
										description:
											"Maximum arrows to display (older arrows are removed)",
									},
									timeWindow: {
										type: "number",
										title: "IMU Matching Time Window (ms)",
										default: 100,
										minimum: 1,
										description:
											"Time window for matching IMU data to GPS (milliseconds)",
									},
								},
								required: ["name", "topic", "gpsOriginTopic"],
							},
						},
					},
				},
				customLayers: {
					type: "array",
					title: "Custom Layers",
					items: {
						type: "object",
						properties: {
							name: { type: "string", title: "Layer Name" },
							url: {
								type: "string",
								title: "Source URL",
								description:
									"COG protocol (cog://...) or tile URL template ({z}/{x}/{y})",
							},
							opacity: {
								type: "number",
								title: "Opacity",
								default: 1,
								minimum: 0,
								maximum: 1,
								multipleOf: 0.1,
							},
							visible: {
								type: "boolean",
								title: "Visible",
								default: true,
							},
						},
						required: ["name", "url"],
					},
				},
			},
			required: ["title"],
		},
		uischema: {
			type: "Categorization",
			elements: [
				{
					type: "Category",
					label: "General",
					elements: [
						{
							type: "Control",
							scope: "#/properties/title",
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/mapUrl",
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/use3D",
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/apiKey",
							rule: {
								effect: "SHOW",
								condition: {
									scope: "#/properties/use3D",
									schema: { const: true },
								},
							},
						} as ControlElement,
					],
				},
				{
					type: "Category",
					label: "Topics",
					elements: [
						{
							type: "Control",
							scope: "#/properties/topics",
							options: {
								detail: {
									type: "VerticalLayout",
									elements: [
										{
											type: "Control",
											scope: "#/properties/name",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/makerType",
										} as ControlElement,
										{
											type: "TopicSelect",
											scope: "#/properties/topic",
											options: {
												dataRequirements: {
													accepts: [
														"GeolocationPosition",
													], // Geolocation data for map positioning
												},
											},
										} as TopicSelectElement,
										{
											type: "TopicSelect",
											scope: "#/properties/numericalTopic",
											options: {
												dataRequirements: {
													accepts: ["number"], // Numerical data for heatmap visualization
												},
											},
											rule: {
												effect: "SHOW",
												condition: {
													scope: "#/properties/makerType",
													schema: {
														const: "heatmap",
													},
												},
											},
										} as TopicSelectElement,
									],
								},
							},
						} as ControlElement,
					],
				},
				{
					type: "Category",
					label: "Local Topics",
					elements: [
						{
							type: "Control",
							scope: "#/properties/localTopics/properties/pathTopics",
							options: {
								detail: {
									type: "VerticalLayout",
									elements: [
										{
											type: "Control",
											scope: "#/properties/name",
										} as ControlElement,
										{
											type: "TopicSelect",
											scope: "#/properties/topic",
											options: {
												dataRequirements: {
													accepts: [
														"Path",
														"PointsCloud",
													], // Local coordinate topics (Path, PointCloud, etc.)
												},
											},
										} as TopicSelectElement,
										{
											type: "TopicSelect",
											scope: "#/properties/gpsOriginTopic",
											options: {
												dataRequirements: {
													accepts: [
														"GeolocationPosition",
													], // GPS topic to use as origin
												},
											},
										} as TopicSelectElement,
										{
											type: "Control",
											scope: "#/properties/transform",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/visualizerType",
										} as ControlElement,
									],
								},
							},
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/localTopics/properties/imuTopics",
							options: {
								detail: {
									type: "VerticalLayout",
									elements: [
										{
											type: "Control",
											scope: "#/properties/name",
										} as ControlElement,
										{
											type: "TopicSelect",
											scope: "#/properties/topic",
											options: {
												dataRequirements: {
													accepts: ["IMU"], // IMU data topics
												},
											},
										} as TopicSelectElement,
										{
											type: "TopicSelect",
											scope: "#/properties/gpsOriginTopic",
											options: {
												dataRequirements: {
													accepts: [
														"GeolocationPosition",
													], // GPS topic to use as origin
												},
											},
										} as TopicSelectElement,
										{
											type: "Control",
											scope: "#/properties/imuFrame",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/headingAxis",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/minDistance",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/maxArrows",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/timeWindow",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/transform",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/visualizerType",
										} as ControlElement,
									],
								},
							},
						} as ControlElement,
					],
				},
				{
					type: "Category",
					label: "Layers",
					elements: [
						{
							type: "Control",
							scope: "#/properties/customLayers",
							options: {
								detail: {
									type: "VerticalLayout",
									elements: [
										{
											type: "Control",
											scope: "#/properties/name",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/url",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/opacity",
										} as ControlElement,
										{
											type: "Control",
											scope: "#/properties/visible",
										} as ControlElement,
									],
								},
							},
						} as ControlElement,
					],
				},
			],
		} as Categorization,
		data: {
			title: "Maps",
			use3D: false,
			customLayers: [],
			localTopics: {
				pathTopics: [],
				imuTopics: [],
			},
		},
		Component: (data: MapsViewerSettings) => <MapsBoxViewer {...data} />,
	};
}
