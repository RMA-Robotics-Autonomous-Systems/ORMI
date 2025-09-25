"use client"

import React, { JSX, useEffect, useRef, useState } from "react";
import Map, { MapRef, StyleSpecification } from 'react-map-gl/maplibre';
import "maplibre-gl/dist/maplibre-gl.css";
import TopicMarker from "./marker-simple";
import { ControlElement, VerticalLayout, Categorization } from "@jsonforms/core";
import HeatMarker from "./marker-heat";
import PathMarker from "./marker-path";
import { TopicListOverlay } from "./topics-overlay";
import MapsGrid, { GridUtils, useMapGrid } from "./maps-grid";

import { MapIcon, MinusIcon, PlusIcon, RefreshCcw, RefreshCcwIcon } from "lucide-react";
import { SelectedTopic, LocalDataSourcesProvider, DatasourceTopic, DatasourceTopicFilter } from "@workspace/ormi-core/datasources";
import { AsyncTopicControlType } from "@workspace/ormi-core/renderers";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { Spinner } from "@workspace/ui/components/spinner";
import { ButtonHolderProvider, useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import MultiPoints from "./marker-multipoints";

interface MapsViewerSettings {
    title: string;
    mapUrl: string;
    use3D: boolean;
    apiKey?: string;
    topics: {
        name: string;
        topic: SelectedTopic;
        makerType: "simple" | "heatmap" | "path" | "multipoints" | any;
        numericalTopic?: SelectedTopic;
    }[];
    customLayers: {
        name: string;
        url: string;
        opacity: number;
        visible: boolean;
    }[];
}

export default function MapsBoxViewer(props: MapsViewerSettings) {
    const [startingLocation, setStartingLocation] = useState<[number, number]>([4.3930369, 50.843941]); // brussels default
    const [isLoading, setIsLoading] = useState(true);

    const [refreshCounter, setRefreshCounter] = useState(0);
    const [showGrid, setShowGrid] = useState(false);

    const [rasterStyle, setRasterStyle] = useState<StyleSpecification>();
    const mapRef = useRef<MapRef>(null);

    const { setButtonItem, removeButtonItem } = useButtonHolder();
    const gridHook = useMapGrid(mapRef, showGrid);

    const pluginsManager = usePluginsManager();


    useEffect(() => {
        // Generate custom layer sources and layers
        const customSources: { [key: string]: any } = {};
        const customLayersData: any[] = [];

        (props.customLayers || []).forEach((layer, index) => {
            if (layer.url && layer.visible) {
                const sourceId = `custom-layer-${index}`;
                const layerId = `custom-layer-${index}`;

                console.log(`Processing custom layer ${index}:`, {
                    name: layer.name,
                    url: layer.url,
                    opacity: layer.opacity,
                    visible: layer.visible
                });

                // Determine source type based on URL
                if (layer.url.startsWith('cog://')) {
                    // COG protocol source
                    customSources[sourceId] = {
                        type: 'raster',
                        url: layer.url
                    };
                    console.log(`Created COG source: ${sourceId}`);
                } else if (layer.url.includes('{z}') && layer.url.includes('{x}') && layer.url.includes('{y}')) {
                    // Standard tile template - fix TiTiler URL format
                    let tileUrl = layer.url;
                    if (layer.url.includes('cog/tiles/') && !layer.url.includes('WebMercatorQuad')) {
                        // Fix TiTiler URL format
                        tileUrl = layer.url.replace('cog/tiles/', 'cog/tiles/WebMercatorQuad/');
                        tileUrl = tileUrl.replace('.png', ''); // Remove .png extension for TiTiler
                    }
                    customSources[sourceId] = {
                        type: 'raster',
                        tiles: [tileUrl],
                        tileSize: 256
                    };
                    console.log(`Created tile source: ${sourceId}`, customSources[sourceId]);
                } else {
                    // Assume it's a single image or GeoTIFF
                    customSources[sourceId] = {
                        type: 'raster',
                        url: layer.url
                    };
                    console.log(`Created raster source: ${sourceId}`);
                }

                customLayersData.push({
                    id: layerId,
                    type: 'raster',
                    source: sourceId,
                    paint: {
                        'raster-opacity': layer.opacity || 1
                    }
                });

                console.log(`Created layer: ${layerId}`);
            }
        });

        console.log('Custom sources:', customSources);
        console.log('Custom layers:', customLayersData);

        const baseStyle: StyleSpecification = {
            version: 8,
            sources: {
                'raster-tiles': {
                    type: 'raster',
                    tiles: [props.mapUrl],
                },
                'grid': {
                    type: 'geojson',
                    data: GridUtils.createGridLines([-180, -85, 180, 85], 1000) // Start with 1km grid
                },
                ...customSources
            },
            layers: [
                {
                    id: 'simple-tiles',
                    type: 'raster',
                    source: 'raster-tiles',
                    minzoom: 0,
                    maxzoom: 22
                },
                ...customLayersData,
                {
                    id: 'grid-layer',
                    type: 'line',
                    source: 'grid',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#888888',
                        'line-width': 1,
                        'line-opacity': showGrid ? 0.5 : 0
                    }
                }
            ]
        };

        if (props.use3D && props.apiKey) {
            setRasterStyle({
                version: 8,
                sources: {
                    'raster-tiles': {
                        type: 'raster',
                        tiles: [props.mapUrl],
                    },
                    'grid': {
                        type: 'geojson',
                        data: GridUtils.createGridLines([-180, -85, 180, 85], 1000) // Start with 1km grid
                    },
                    // Add OSM vector tiles source
                    'openmaptiles': {
                        type: 'vector',
                        url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${props.apiKey}`
                    },
                    ...customSources
                },
                layers: [
                    {
                        id: 'simple-tiles',
                        type: 'raster',
                        source: 'raster-tiles',
                        minzoom: 0,
                        maxzoom: 22
                    },
                    ...customLayersData,
                    {
                        id: 'grid-layer',
                        type: 'line',
                        source: 'grid',
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': '#888888',
                            'line-width': 1,
                            'line-opacity': showGrid ? 0.5 : 0
                        }
                    },
                    // Add 3D building layer using OSM data
                    {
                        'id': '3d-buildings',
                        'source': 'openmaptiles',
                        'source-layer': 'building',
                        'type': 'fill-extrusion',
                        'minzoom': 15,
                        'filter': ['!=', ['get', 'hide_3d'], true],
                        'paint': {
                            'fill-extrusion-color': [
                                'interpolate',
                                ['linear'],
                                ['get', 'render_height'], 0, 'lightgray', 200, 'royalblue', 400, 'lightblue'
                            ],
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                16,
                                ['get', 'render_height']
                            ],
                            'fill-extrusion-base': ['case',
                                ['>=', ['get', 'zoom'], 16],
                                ['get', 'render_min_height'], 0
                            ]
                        }
                    },
                ]
            });
        } else {
            setRasterStyle(baseStyle);
        }

        console.log('Final MapLibre style:', baseStyle);
        setIsLoading(false);

        if (typeof window !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setStartingLocation([position.coords.longitude, position.coords.latitude]);
                    setIsLoading(false);
                },
                () => {
                    setIsLoading(false);
                }
            );
        } else {
            setIsLoading(false);
        }


        setButtonItem(
            "map-box-viewer-widget-zoom-in",
            <Button variant={"ghost"} onClick={() => {
                if (mapRef.current) {
                    const currentZoom = mapRef.current.getZoom();
                    mapRef.current.setZoom(currentZoom + 1);
                }
            }}>
                <PlusIcon />
            </Button>,
            1
        );


        setButtonItem("map-box-viewer-widget-zoom-out",
            <Button variant={"ghost"} onClick={() => {
                if (mapRef.current) {
                    const currentZoom = mapRef.current.getZoom();
                    mapRef.current.setZoom(currentZoom - 1);
                }
            }}>
                <MinusIcon />
            </Button>,
            1
        );


        // refresh button
        setButtonItem("map-box-viewer-widget-refresh",
            <Button variant={"ghost"} onClick={() => {
                // Force a full rerender by incrementing the refresh counter
                // This will cause the useEffect to run again and remount the Map component
                setRefreshCounter(prev => prev + 1);
            }}>
                <RefreshCcwIcon />
            </Button>,
            1
        );

        // grid toggle button
        setButtonItem("map-box-viewer-widget-grid",
            <Button variant={showGrid ? "default" : "ghost"} onClick={() => {
                setShowGrid(prev => !prev);
            }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                </svg>
            </Button>,
            1
        );



        return () => {
            removeButtonItem("map-box-viewer-widget-zoom-in");
            removeButtonItem("map-box-viewer-widget-zoom-out");
            removeButtonItem("map-box-viewer-widget-refresh");
            removeButtonItem("map-box-viewer-widget-grid");
        }

    }, [props, refreshCounter, showGrid]); // Add showGrid to dependencies

    if (isLoading) {
        return <Spinner />;
    }

    const getAllTopics = () => {
        // merge all topics (from the props) and the numerical topics if they exist
        // clear duplicates, check on unique source IDs (not just topic names)
        const allTopics: SelectedTopic[] = [];
        const seenSourceIds = new Set<string>();

        props.topics.forEach(t => {
            if (t.topic) {
                const sourceId = `${t.topic.source.id}::${t.topic.topic}${t.topic.property ? '::' + t.topic.property : ''}`;
                if (!seenSourceIds.has(sourceId)) {
                    allTopics.push(t.topic);
                    seenSourceIds.add(sourceId);
                }
            }
            if (t.numericalTopic) {
                const numericalSourceId = `${t.numericalTopic.source.id}::${t.numericalTopic.topic}${t.numericalTopic.property ? '::' + t.numericalTopic.property : ''}`;
                if (!seenSourceIds.has(numericalSourceId)) {
                    allTopics.push(t.numericalTopic);
                    seenSourceIds.add(numericalSourceId);
                }
            }
        });
        return allTopics.filter(t => t !== undefined && t.topic !== undefined && t.topic !== "");
    }

    return (
        <div className="h-full w-full" style={{ display: "grid" }}>
            <ButtonHolderProvider>
                <Map
                    key={`map-${refreshCounter}`}
                    initialViewState={{
                        longitude: startingLocation[0],
                        latitude: startingLocation[1],
                        zoom: 15,
                        pitch: 45,
                        bearing: 0
                    }}
                    style={{ width: "100%", height: "100%" }}
                    mapStyle={rasterStyle}
                    ref={mapRef}
                    onMoveEnd={gridHook.updateGridForViewport}
                    onZoomEnd={gridHook.updateGridForViewport}
                >
                    <MapsGrid mapRef={mapRef} showGrid={showGrid} />
                    {(props.topics || []).length !== 0 && (
                        <LocalDataSourcesProvider SelectedTopics={getAllTopics()} buffersSize={50} >
                            {props.topics.map(t => {
                                if (t.makerType === "simple") {
                                    return <TopicMarker key={t.name} topic={t.topic} name={t.name} scale={1} />;
                                } else if (t.makerType === "heatmap") {
                                    return <HeatMarker key={t.name} topic={t.topic} name={t.name} scale={1} numericalTopic={t.numericalTopic} />;
                                } else if (t.makerType === "path") {
                                    return <PathMarker key={t.name} topic={t.topic} name={t.name} scale={1} />;
                                } else if (t.makerType === "multipoints") {
                                    return <MultiPoints key={t.name} topic={t.topic} name={t.name} scale={1} />;
                                }
                                return pluginsManager.applyFilter<JSX.Element | null>("std-widgets-map-components", null, t);
                            })}

                            <TopicListOverlay topics={props.topics} mapRef={mapRef as React.RefObject<MapRef>} />
                        </LocalDataSourcesProvider >
                    )}
                </Map>
            </ButtonHolderProvider>
        </div>
    );
}

export function MapsBoxViewerDefinition() {
    const pluginsManager = usePluginsManager();

    const mapType = pluginsManager.applyFilter<string[]>("std-widgets-map-type", ["simple", "heatmap", "path", "multipoints"]);
    const topicFilter = pluginsManager.applyFilter<DatasourceTopicFilter>("std-widgets-map-topic-available-type", new DatasourceTopicFilter({ type: /GeolocationPosition/ }));


    return {
        id: 'map-box-viewer',
        name: 'Maps',
        description: 'Display the location of collection of robots',
        titleProp: 'title',

        icon: <MapIcon />,

        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },

                mapUrl: {
                    type: 'string',
                    title: 'Map URL',
                    oneOf: [
                        {
                            const: "https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png",
                            title: "Carto Voyager Labels Under"
                        },
                        {
                            const: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                            title: "OpenStreetMap"
                        },
                        {
                            const: "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
                            title: "OpenStreetMap Humanitarian"
                        },
                        {
                            const: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
                            title: "OpenTopoMap A"
                        },
                        {   //https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/5/15/10.png
                            const: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
                            title: "Stadia Maps Alidade Smooth Dark"
                        },
                        {   //https://tiles.stadiamaps.com/tiles/alidade_satellite/7/72/44.jpg
                            const: "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg",
                            title: "Stadia Maps Alidade Satellite"
                        },
                        {   //https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/88796/141595
                            const: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                            title: "ArcGIS World Imagery"
                        },
                        {
                            const: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
                            title: "ArcGIS World Topo Map"
                        },
                        {
                            const: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png",
                            title: "GeoDataCenter WMTS TopPlus Open (gray)"
                        },
                        {
                            const: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
                            title: "GeoDataCenter WMTS TopPlus Open (color)"
                        },
                    ],
                    default: "https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png"
                },

                use3D: {
                    type: 'boolean',
                    title: 'Use 3D',
                    default: false
                },
                apiKey: {
                    type: 'string',
                    title: 'API Key',
                },
                topics: {
                    type: 'array',
                    title: 'Topics',
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string", title: "Name" },
                            makerType: { type: "string", title: "Marker Type", enum: mapType },
                            topic: { type: "object", title: "Topic" },
                            numericalTopic: { type: "object", title: "Numerical Topic (only for heatmap)" }
                        },

                    }
                },
                customLayers: {
                    type: 'array',
                    title: 'Custom Layers',
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string", title: "Layer Name" },
                            url: {
                                type: "string",
                                title: "Source URL",
                                description: "COG protocol (cog://...) or tile URL template ({z}/{x}/{y})"
                            },
                            opacity: {
                                type: "number",
                                title: "Opacity",
                                default: 1,
                                minimum: 0,
                                maximum: 1,
                                multipleOf: 0.1
                            },
                            visible: { type: "boolean", title: "Visible", default: true }
                        },
                        required: ["name", "url"]
                    }
                }
            },
            required: ['title']
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
                                    schema: { const: true }
                                }
                            }
                        } as ControlElement,

                    ]
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
                                                asyncFunction: async () => {
                                                    return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], topicFilter);
                                                },
                                                canSelectProperty: false,
                                                buffer: 1
                                            }
                                        } as AsyncTopicControlType,
                                        {
                                            type: "TopicSelect",
                                            scope: "#/properties/numericalTopic",
                                            options: {
                                                asyncFunction: async () => {
                                                    return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /number/ }));
                                                },
                                                canSelectProperty: false,
                                                buffer: 200
                                            },
                                            rule: {
                                                effect: "SHOW",
                                                condition: {
                                                    scope: "#/properties/makerType",
                                                    schema: { const: "heatmap" }
                                                }
                                            }
                                        } as AsyncTopicControlType
                                    ]
                                }
                            }
                        } as ControlElement
                    ]
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
                                        } as ControlElement
                                    ]
                                }
                            }
                        } as ControlElement
                    ]
                }
            ]
        } as Categorization,
        data: {
            title: 'Maps',
            use3D: false,
            customLayers: [],
        },
        Component: (data: MapsViewerSettings) => (
            <MapsBoxViewer {...data} />
        )
    }
};