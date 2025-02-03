import { useEffect, useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { DatasourceTopic, SelectedTopic } from "@/core/datasources/datasource-interface";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
// import { IMU } from "@/core/types/movement";
import { LocalDataSourcesProvider, useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import {
    Airspeed,
} from "react-typescript-flight-indicators";

import { Vector3 } from "@/core/types/common";

interface AirSpeedProps {
    title: string;
    topic: SelectedTopic;

    speedAxis: string;    // with axis to show the orientation
    invert: boolean;

}

export function WidgetAirspeedIndicator(props: AirSpeedProps) {

    const { sources } = useLocalDataSource();

    const [speed, setSpeed] = useState(0);

    useEffect(() => {

        const data = sources.get(props.topic.topic);

        if (!data) {
            return;
        }

        const value = data.data[0];
        if (!value) {
            return;
        }


        const speeds = value.twist.twist.linear as Vector3 | { x: number, y: number, z: number };

        // convert m/s to knots
        speeds.x = speeds.x * 1.94384;
        speeds.y = speeds.y * 1.94384;
        speeds.z = speeds.z * 1.94384;

        if (props.invert) {
            speeds.x = -speeds.x;
            speeds.y = -speeds.y;
            speeds.z = -speeds.z;
        }


        switch (props.speedAxis) {
            case 'x':
                setSpeed(speeds.x);
                break;
            case 'y':
                setSpeed(speeds.y);
                break;
            case 'z':
                setSpeed(speeds.z);
                break;
        }


    }, [sources]);

    return (
        <div className="flex justify-center items-center" style={{ padding: "1rem", height: "100%" }}>
            <Airspeed speed={speed * 10} size={"100%"} showBox={false} />

        </div>
    );
}



// a few lines later ...



export function AirspeedDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'speed-widget',
        name: 'Speed Indicator',
        description: 'Speed Indicator',
        titleProp: 'title',
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                speedAxis: {
                    type: 'string',
                    title: 'Speed Axis',
                    enum: ['x', 'y', 'z'],
                },
                invert: {
                    type: 'boolean',
                    title: 'Invert',
                    default: false
                }

            },
            required: ['title', 'topic']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                } as ControlElement,
                {
                    "type": "TopicSelect",
                    "scope": "#/properties/topic",
                    "options": {
                        "asyncFunction": async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'Movement');
                        },
                        "propertyType": "Movement"
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/speedAxis",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/invert",
                } as ControlElement,
            ],
        } as VerticalLayout,
        data: {
            title: 'Control the robot'
        },
        Component: (data: AirSpeedProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
                <WidgetAirspeedIndicator {...data} />
            </LocalDataSourcesProvider>
        )

    }

}