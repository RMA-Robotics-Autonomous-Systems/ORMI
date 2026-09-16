"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import MapLibreMap, { MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { ControlElement, Categorization } from "@jsonforms/core";
import MapsGrid, { useMapGrid } from "./gps-components/maps-grid";

import { MapIcon } from "lucide-react";
import {
	SelectedTopic,
	DatasourceTopicFilter,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { PluginsManager } from "@workspace/ormi-plugins";
import {
	BASEMAPS_REQUIRING_KEY,
	DEFAULT_BASEMAP_URL,
	VECTOR_BASEMAPS,
	basemapOneOf,
} from "@workspace/utils";
import { Spinner } from "@workspace/ui/components/spinner";
import { WidgetScopeProvider } from "@workspace/ui/combined/ButtonHolder";

// Import new sub-components and hooks
import { useMapStyle } from "./hooks/useMapStyle";
import { useMapInitialization } from "./hooks/useMapInitialization";
import { MapToolbar } from "./components/MapToolbar";
import { GpsTopicsLayer } from "./components/GpsTopicsLayer";
import { LocalTopicsLayer } from "./components/LocalTopicsLayer";
import { LocalTopic } from "./local-topic-visualizer-types";
import { IMULocalTopic } from "./local-components/imu-local";

/** Settings for MapsBoxViewer widget. */
interface MapsViewerSettings extends Record<string, unknown> {
	title: string;
	mapUrl: string;
	use3D: boolean;
	apiKey?: string;
	basemapApiKey?: string;

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

	// Private, per-instance ButtonHolder scope for the in-map keyed bus between
	// markers and the topic/layer overlays. Isolated from the widget-level
	// bucket (used by MapToolbar, which is rendered outside this scope), so
	// marker toggles never leak into the tile header / tab strip. Placed
	// OUTSIDE the keyed <MapLibreMap> below, so it stays stable across the
	// key={`map-${refreshCounter}`} remount.
	const localScopeId = `maps-${useId()}`;

	// Custom hooks
	const { startingLocation, isLoading } = useMapInitialization();
	const gridHook = useMapGrid(mapRef, showGrid);
	const mapStyle = useMapStyle({
		mapUrl: props.mapUrl,
		basemapApiKey: props.basemapApiKey,
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
			<WidgetScopeProvider value={localScopeId}>
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

					{/* GPS Topics Layer (also hosts the consolidated control panel) */}
					<GpsTopicsLayer
						topics={props.topics || []}
						mapRef={mapRef}
						customLayers={customLayersState}
						onLayerVisibilityChange={handleLayerVisibilityChange}
						onLayerOpacityChange={handleLayerOpacityChange}
					/>

					{/* Local Topics Layer */}
					<LocalTopicsLayer
						localTopics={[
							...(props.localTopics?.pathTopics || []),
							...(props.localTopics?.imuTopics || []),
						]}
					/>
				</MapLibreMap>
			</WidgetScopeProvider>
		</div>
	);
}

/**
 * Widget definition for MapsBoxViewer.
 * @returns Widget definition.
 */
export function MapsBoxViewerDefinition(): WidgetDefinition<MapsViewerSettings> {
	const defaultMapTypes = ["simple", "heatmap", "path", "multipoints"];

	const definition: WidgetDefinition<MapsViewerSettings> = {
		id: "map-box-viewer",
		name: "Maps",
		description: "Show robot locations on map",
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
					oneOf: basemapOneOf(),
					default: DEFAULT_BASEMAP_URL,
				},

				basemapApiKey: {
					type: "string",
					title: "Basemap API Key",
				},

				use3D: {
					type: "boolean",
					title: "Use 3D",
					default: false,
				},
				apiKey: {
					type: "string",
					title: "MapTiler API Key (3D buildings, raster basemaps only)",
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
								enum: defaultMapTypes,
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
							scope: "#/properties/basemapApiKey",
							rule: {
								effect: "SHOW",
								condition: {
									scope: "#/properties/mapUrl",
									schema: {
										enum: [...BASEMAPS_REQUIRING_KEY],
									},
								},
							},
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/use3D",
						} as ControlElement,
						{
							type: "Control",
							scope: "#/properties/apiKey",
							// The MapTiler key only buys 3D buildings on a
							// RASTER basemap, which carries no vector geometry
							// of its own. The bundled vector styles ship their
							// own `building-3d` layer, so asking for a key
							// there would be asking for something unused.
							rule: {
								effect: "SHOW",
								condition: {
									type: "AND",
									conditions: [
										{
											scope: "#/properties/use3D",
											schema: { const: true },
										},
										{
											scope: "#/properties/mapUrl",
											schema: {
												not: {
													enum: [...VECTOR_BASEMAPS],
												},
											},
										},
									],
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
		Component: MapsBoxViewer,

		/**
		 * Extensibility hook to allow plugins to extend available map types.
		 * Resolves the "std-widgets-map-type" filter and updates the makerType enum.
		 */
		extensibilityHook: ((
			def: WidgetDefinition<MapsViewerSettings>,
			pluginsManager: PluginsManager,
		) => {
			// Seed with a fresh copy: "std-widgets-map-type" filters mutate the array
			// in place (per the plugin filter contract), so passing the shared
			// `defaultMapTypes` would accumulate duplicates across every hook run.
			const mapTypes = pluginsManager.applyFilter<string[]>(
				"std-widgets-map-type",
				[...defaultMapTypes],
			);

			// Update the makerType enum in topics items schema
			if (
				def.schema &&
				typeof def.schema === "object" &&
				"properties" in def.schema &&
				def.schema.properties &&
				typeof def.schema.properties === "object"
			) {
				const properties = def.schema.properties as Record<
					string,
					unknown
				>;
				if (
					properties.topics &&
					typeof properties.topics === "object"
				) {
					const topicsSchema = properties.topics as Record<
						string,
						unknown
					>;
					if (
						topicsSchema.items &&
						typeof topicsSchema.items === "object"
					) {
						const topicsItems = topicsSchema.items as Record<
							string,
							unknown
						>;
						if (
							topicsItems.properties &&
							typeof topicsItems.properties === "object"
						) {
							const topicsProperties =
								topicsItems.properties as Record<
									string,
									unknown
								>;
							if (topicsProperties.makerType) {
								const makerType =
									topicsProperties.makerType as Record<
										string,
										unknown
									>;
								// Dedupe defensively in case two plugins register the same type.
								makerType.enum = [...new Set(mapTypes)];
							}
						}
					}
				}
			}

			return def;
		}) as (
			def: WidgetDefinition<MapsViewerSettings>,
			pluginsManager: PluginsManager,
		) => WidgetDefinition<MapsViewerSettings>,
	};

	return definition;
}
