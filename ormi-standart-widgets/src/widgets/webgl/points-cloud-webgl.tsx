import React from 'react';
import { LocalDataSourcesProvider } from "ormi-core/datasources";
import { DatasourceTopic, DatasourceTopicFilter } from "ormi-core/datasources";
import { AsyncTopicControlType } from "ormi-core/jsonforms";
import { usePluginsManager } from "ormi-core/plugins";
import { PluginsHooks } from "ormi-core/plugins";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { CircleAlertIcon } from "lucide-react";
import { PointsCloudProps } from "./types/points-cloud-types";
import PointsCloudCompWebGL from "./components/points-cloud-comp";

export function PointsCloudDefinition() {
    const pluginsManager = usePluginsManager();
    return {
        id: 'std-points-cloud-webgl',
        name: 'Points Cloud WebGL',
        description: 'Display a points cloud using raw WebGL',
        titleProp: 'title',
        icon: <CircleAlertIcon />,
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                topic: { type: 'object', title: 'Topic' },
                maxPoints: { type: 'number', title: 'Max Points', minimum: 0 }
            },
            required: ['title']
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
                        buffer: 1
                    }
                } as AsyncTopicControlType,
                { type: "Control", scope: "#/properties/maxPoints" } as ControlElement
            ]
        } as VerticalLayout,
        data: {
            title: 'Status',
            use3D: false,
            maxPoints: 100
        },
        Component: (data: PointsCloudProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
                <PointsCloudCompWebGL {...data} />
            </LocalDataSourcesProvider>
        )
    };
}
