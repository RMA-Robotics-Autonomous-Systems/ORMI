"use client"

import React, { useEffect, useState } from "react";
import Map, { StyleSpecification } from 'react-map-gl/maplibre';
import "maplibre-gl/dist/maplibre-gl.css";
import TopicMarker from "./marker-simple";
import { LocalDataSourcesProvider } from "@/core/datasources/components/local-datasource-provider";
import { DatasourceTopic, SelectedTopic } from "@/core/datasources/datasource-interface";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { Spinner } from "@/components/spinner";
import HeatMarker from "./marker-heat";
import PathMarker from "./marker-path";
import { MapIcon } from "lucide-react";

interface MapsViewerSettings {
    title: string;
    mapUrl: string;
    use3D: boolean;
    apiKey?: string;
    topics: {
        name: string;
        topic: SelectedTopic;
        makerType: "simple" | "heatmap" | "path",
    }[]
}

export default function MapsBoxViewer(props: MapsViewerSettings) {
    const [startingLocation, setStartingLocation] = useState<[number, number]>([4.3930369, 50.843941]); // brussels default
    const [isLoading, setIsLoading] = useState(true);

    const [rasterStyle, setRasterStyle] = useState<StyleSpecification>();

    useEffect(() => {
        setRasterStyle({
            version: 8,
            sources: {
                'raster-tiles': {
                    type: 'raster',
                    tiles: [props.mapUrl],
                },
            },
            layers: [
                {
                    id: 'simple-tiles',
                    type: 'raster',
                    source: 'raster-tiles',
                    minzoom: 0,
                    maxzoom: 22
                },
            ]
        });

        if (props.use3D && props.apiKey) {
            setRasterStyle({
                version: 8,
                sources: {
                    'raster-tiles': {
                        type: 'raster',
                        tiles: [props.mapUrl],
                    },
                    // Add OSM vector tiles source
                    'openmaptiles': {
                        type: 'vector',
                        url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${props.apiKey}`
                    }
                },
                layers: [
                    {
                        id: 'simple-tiles',
                        type: 'raster',
                        source: 'raster-tiles',
                        minzoom: 0,
                        maxzoom: 22
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
        }

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
    }, [props]); // Empty dependency array = run once on mount

    if (isLoading) {
        return <Spinner />;
    }

    return (
        <div className="h-full w-full" style={{ display: "grid" }}>
            <Map
                initialViewState={{
                    longitude: startingLocation[0],
                    latitude: startingLocation[1],
                    zoom: 15,  // Increased zoom to better see buildings
                    pitch: 45, // Add tilt
                    bearing: 0
                }}
                style={{ width: "100%", height: "100%" }}
                mapStyle={rasterStyle}
            >
                {(props.topics || []).length !== 0 && (
                    <LocalDataSourcesProvider SelectedTopics={props.topics.map(t => t.topic)} buffersSize={50} >
                        {props.topics.map(t => {
                            if (t.makerType === "simple") {
                                return <TopicMarker key={t.name} topic={t.topic} name={t.name} scale={1} />;
                            } else if (t.makerType === "heatmap") {
                                return <HeatMarker key={t.name} topic={t.topic} name={t.name} scale={1} />;
                            } else if (t.makerType === "path") {
                                return <PathMarker key={t.name} topic={t.topic} name={t.name} scale={1} />;
                            }

                            return null;
                        })}
                    </LocalDataSourcesProvider >
                )}
            </Map>
        </div>
    );
}

export function MapsBoxViewerDefinition() {
    const pluginsManager = usePluginsManager();

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
                            const: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                            title: "OpenStreetMap"
                        },
                        // {
                        //     const: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
                        //     title: "OpenStreetMap DE"
                        // },
                        // {
                        //     const: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                        //     title: "OpenTopoMap"
                        // },
                        // {
                        //     const: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
                        //     title: "Stadia Maps"
                        // },
                        // {
                        //     const: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
                        //     title: "Stadia Maps Dark"
                        // },
                        // {
                        //     const: "https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png",
                        //     title: "OPNVKarte"
                        // }
                    ]
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
                            name: {
                                "type": "string",
                                "title": "Name",
                            },
                            topic: {
                                "type": "object",
                                "title": "Topic",
                            },
                            makerType: {
                                "type": "string",
                                "title": "Maker Type",
                                "enum": ["simple", "heatmap", "path"],
                                "default": "simple"
                            }
                        },
                        "required": ["topic"]
                    }
                }
            },
            required: ['title']
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
                    scope: "#/properties/mapUrl",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/use3D",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/apiKey",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/topics",
                    options: {
                        detail: {
                            type: "Group",
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
                                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'gps');
                                        },
                                        propertyType: "gps"
                                    }
                                } as AsyncTopicControlType
                            ]
                        }
                    }
                } as ControlElement

            ]
        } as VerticalLayout,
        data: {
            title: 'Chart',
            use3D: false,
        },
        Component: (data: MapsViewerSettings) => (
            <MapsBoxViewer {...data} />
        )
    }
};