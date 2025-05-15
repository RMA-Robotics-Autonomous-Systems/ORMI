import React from 'react';
import { CloudIcon } from "lucide-react";
import { LocalDataSourcesProvider, SelectedTopic } from "ormi-core/datasources";
import { DatasourceTopic, DatasourceTopicFilter } from "ormi-core/datasources";
import { AsyncTopicControlType } from "ormi-core/jsonforms";
import { usePluginsManager } from "ormi-core/plugins";
import { PluginsHooks } from "ormi-core/plugins";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { PointsCloudProps } from './types/points-cloud-drei-types';
import { PointsCloudComp } from './components/points-cloud-drei-comp';

/**
 * Definition for the PointsCloudDrei widget with schema configuration
 */
export function PointsCloudDreiDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'std-points-cloud-drei',
        name: 'Points Cloud Drei',
        description: 'Display a real-time points cloud using optimized rendering',
        titleProp: 'title',
        icon: <CloudIcon />,
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                topic: { type: 'object', title: 'Topic' },
                maxPoints: { type: 'number', title: 'Max Points', minimum: 0 },
                updateRate: { type: 'number', title: 'Update Rate (ms)', minimum: 10 },
                pointSize: { type: 'number', title: 'Point Size', minimum: 0.01 },
                rollingBuffer: { type: 'boolean', title: 'Use Rolling Buffer' },
                decayTime: { type: 'number', title: 'Decay Time (ms)', minimum: 0 },
                theme: {
                    type: 'string',
                    title: 'Theme',
                    enum: ['Default', 'Neon', 'Plasma', 'Thermal', 'Solid', 'Distance'],
                    default: 'Default'
                },
                useTransparency: {
                    type: 'boolean',
                    title: 'Use Transparency',
                    description: 'Enable transparency for smoother point edges',
                    default: false
                },
                customColor: {
                    type: 'string',
                    title: 'Custom Color',
                    description: 'Custom color for Solid theme (hex format)',
                    default: '#ffffff'
                },
                rotation: {
                    type: 'object',
                    title: 'Rotation (degrees)',
                    properties: {
                        x: { type: 'number', title: 'X-Axis', description: 'Rotation around X axis in degrees' },
                        y: { type: 'number', title: 'Y-Axis', description: 'Rotation around Y axis in degrees' },
                        z: { type: 'number', title: 'Z-Axis', description: 'Rotation around Z axis in degrees' }
                    }
                },
                translation: {
                    type: 'object',
                    title: 'Translation',
                    properties: {
                        x: { type: 'number', title: 'X-Axis', description: 'Offset along X axis' },
                        y: { type: 'number', title: 'Y-Axis', description: 'Offset along Y axis' },
                        z: { type: 'number', title: 'Z-Axis', description: 'Offset along Z axis' }
                    }
                }
            },
            required: ['title', 'topic']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                { type: "Control", scope: "#/properties/title" } as ControlElement,
                {
                    type: "TopicSelect", scope: "#/properties/topic", options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(
                                PluginsHooks.AVAILABLE_TOPICS,
                                [],
                                new DatasourceTopicFilter({ type: /PointsCloud/ })
                            );
                        },
                        buffer: 1,
                        canSelectProperty: false,
                    }
                } as AsyncTopicControlType,
                { type: "Control", scope: "#/properties/maxPoints" } as ControlElement,
                { type: "Control", scope: "#/properties/updateRate" } as ControlElement,
                { type: "Control", scope: "#/properties/pointSize" } as ControlElement,
                { type: "Control", scope: "#/properties/rollingBuffer" } as ControlElement,
                { type: "Control", scope: "#/properties/decayTime" } as ControlElement,
                { type: "Control", scope: "#/properties/theme" } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/customColor",
                    rule: {
                        effect: "SHOW",
                        condition: {
                            scope: "#/properties/theme",
                            schema: { enum: ["Solid"] }
                        }
                    }
                } as ControlElement,
                {
                    type: "Group",
                    label: "Rotation (degrees)",
                    elements: [
                        {
                            type: "HorizontalLayout",
                            elements: [
                                {
                                    type: "Control",
                                    scope: "#/properties/rotation/properties/x",
                                    options: {
                                        slider: true,
                                        min: -180,
                                        max: 180,
                                        step: 1
                                    }
                                },
                                {
                                    type: "Control",
                                    scope: "#/properties/rotation/properties/y",
                                    options: {
                                        slider: true,
                                        min: -180,
                                        max: 180,
                                        step: 1
                                    }
                                },
                                {
                                    type: "Control",
                                    scope: "#/properties/rotation/properties/z",
                                    options: {
                                        slider: true,
                                        min: -180,
                                        max: 180,
                                        step: 1
                                    }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "Group",
                    label: "Translation",
                    elements: [
                        {
                            type: "HorizontalLayout",
                            elements: [
                                {
                                    type: "Control",
                                    scope: "#/properties/translation/properties/x",
                                    options: {
                                        slider: true,
                                        min: -10,
                                        max: 10,
                                        step: 0.1
                                    }
                                },
                                {
                                    type: "Control",
                                    scope: "#/properties/translation/properties/y",
                                    options: {
                                        slider: true,
                                        min: -10,
                                        max: 10,
                                        step: 0.1
                                    }
                                },
                                {
                                    type: "Control",
                                    scope: "#/properties/translation/properties/z",
                                    options: {
                                        slider: true,
                                        min: -10,
                                        max: 10,
                                        step: 0.1
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        } as VerticalLayout,
        data: {
            title: 'Points Cloud',
            use3D: false,
            maxPoints: 1000,
            updateRate: 50,
            pointSize: 0.05,
            rollingBuffer: false,
            decayTime: 0,
            theme: 'Default',
            useTransparency: false,
            customColor: '#ffffff',
            rotation: { x: 0, y: 0, z: 0 },
            translation: { x: 0, y: 0, z: 0 }
        },
        Component: (data: PointsCloudProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
                <PointsCloudComp {...data} />
            </LocalDataSourcesProvider>
        )
    };
}
