"use client"

import React, { useEffect, useState } from "react";
import Map from 'react-map-gl/maplibre';
import "maplibre-gl/dist/maplibre-gl.css";
import TopicMaker from "./marker-simple";
import { LocalDataSourcesProvider } from "@/core/datasources/components/local-datasource-provider";
import { DatasourceTopic, SelectedTopic } from "@/core/datasources/datasource-interface";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { Spinner } from "@/components/spinner";
import HeatMarker from "./marker-heat";
import PathMarker from "./marker-path";
import { set } from "lodash";

interface MapsViewerSettings {
    title: string;
    mapUrl: string;
    topics: {
        name: string;
        topic: SelectedTopic;
        makerType: "simple" | "heatmap" | "path",
    }[]
}

export default function MapsBoxViewer(props: MapsViewerSettings) {
    const [startingLocation, setStartingLocation] = useState<[number, number]>([4.3930369, 50.843941]); // brussels default
    const [isLoading, setIsLoading] = useState(true);

    const [rasterStyle, setRasterStyle] = useState<any>();

    useEffect(() => {

        setRasterStyle({
            version: 8,
            sources: {
                'raster-tiles': {
                    type: 'raster',
                    tiles: [props.mapUrl],
                    tileSize: 256,
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }
            },
            layers: [
                {
                    id: 'simple-tiles',
                    type: 'raster',
                    source: 'raster-tiles',
                    minzoom: 0,
                    maxzoom: 22
                }
            ]
        });

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
                    zoom: 10
                }}
                style={{ width: "100%", height: "100%" }}
                mapStyle={rasterStyle}
            >
                {(props.topics || []).length !== 0 && (
                    <LocalDataSourcesProvider SelectedTopics={props.topics.map(t => t.topic)} buffersSize={50} >
                        {props.topics.map(t => {
                            if (t.makerType === "simple") {
                                return <TopicMaker key={t.name} topic={t.topic} name={t.name} scale={1} />;
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

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const mapUrl: ControlElement = {
        type: "Control",
        scope: "#/properties/mapUrl",
    }

    const topic: AsyncTopicControlType = {
        "type": "TopicSelect",
        "scope": "#/properties/topic",
        "options": {
            "asyncFunction": async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'gps');
            },
            "propertyType": "gps"
        }
    }

    const name: ControlElement = {
        "type": "Control",
        "scope": "#/properties/name",
    }

    const makerType: ControlElement = {
        "type": "Control",
        "scope": "#/properties/makerType",
    }

    // array of topics
    const topics: ControlElement = {
        type: "Control",
        scope: "#/properties/topics",
        options: {
            detail: {
                type: "Group",
                elements: [name, makerType, topic]
            }
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, mapUrl, topics],
    }

    return {
        id: 'map-box-viewer',
        name: 'Maps',
        description: 'Display the location of collection of robots',
        titleProp: 'title',
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
                        {
                            const: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
                            title: "OpenStreetMap DE"
                        },
                        {
                            const: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                            title: "OpenTopoMap"
                        },
                        {
                            const: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
                            title: "Stadia Maps"
                        },
                        {
                            const: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
                            title: "Stadia Maps Dark"
                        },
                        {
                            const: "https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png",
                            title: "OPNVKarte"
                        }
                    ]
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
        uischema: layout,
        data: {
            title: 'Chart'
        },
        Component: (data: MapsViewerSettings) => (
            <MapsBoxViewer {...data} />
        )
    }
};