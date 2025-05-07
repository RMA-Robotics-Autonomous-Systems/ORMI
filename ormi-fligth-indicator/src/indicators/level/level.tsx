import { useEffect, useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { AsyncTopicControlType } from "ormi-core/jsonforms";
import { PluginsHooks, usePluginsManager } from "ormi-core/plugins";

import {
    AttitudeIndicator,
} from "react-typescript-flight-indicators";


import { Vector3, IMU } from "ormi-core/types";
import { LocalDataSourcesProvider, useLocalDataSource, DatasourceTopic, DatasourceTopicFilter, SelectedTopic } from "ormi-core/datasources";


import { CompassIcon } from "lucide-react";

interface LevelProps {
    title: string;
    topic: SelectedTopic;

    pitchAxis: string;    // with axis to show the orientation
    rollAxis: string;    // with axis to show the orientation

    invert: boolean;

}

export function WidgetLevelIndicator(props: LevelProps) {

    const { sources } = useLocalDataSource();
    const [pitch, setPitch] = useState(0);
    const [roll, setRoll] = useState(0);

    useEffect(() => {

        const data = sources.get(props.topic.topic);
        if (!data) {
            return;
        }

        const value = data.data[0] as IMU;
        if (!value) {
            return;
        }

        let orientation = { x: 0, y: 0, z: 0 } as Vector3;

        // convert the value.orientation to the orientation (quaternion to euler)
        const quaternion = value.orientation;
        const q0 = quaternion.w;
        const q1 = quaternion.x;
        const q2 = quaternion.y;
        const q3 = quaternion.z;

        orientation = {
            x: Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2)),
            y: Math.asin(2 * (q0 * q2 - q3 * q1)),
            z: Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3))
        };

        if (props.invert) {
            orientation.x = -orientation.x;
            orientation.y = -orientation.y;
            orientation.z = -orientation.z;
        }

        switch (props.pitchAxis) {
            case 'X':
                setPitch((orientation.x * 180 / Math.PI));
                break;
            case 'Y':
                setPitch((orientation.y * 180 / Math.PI));
                break;
                break;
            case 'Z':
                setPitch((orientation.z * 180 / Math.PI));
                break;
                break;
        }

        switch (props.rollAxis) {
            case 'X':
                setRoll((orientation.x * 180 / Math.PI));
                break;
            case 'Y':
                setRoll((orientation.y * 180 / Math.PI));
                break;
                break;
            case 'Z':
                setRoll((orientation.z * 180 / Math.PI));
                break;
                break;
        }

    }, [sources]);

    return (
        <div className="flex justify-center items-center" style={{ padding: "1rem", height: "100%" }}>
            <AttitudeIndicator size={"100%"} pitch={pitch} roll={roll} showBox={false} />
        </div>
    );
}

export function LevelDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'level-widget',
        name: 'Level Indicator',
        description: 'Level Indicator',
        titleProp: 'title',
        icon: <CompassIcon />,
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
                pitchAxis: {
                    type: 'string',
                    title: 'Orientation Axis',
                    enum: ['X', 'Y', 'Z'],
                    default: 'Z'
                },
                rollAxis: {
                    type: 'string',
                    title: 'Roll Axis',
                    enum: ['X', 'Y', 'Z'],
                    default: 'Z'
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
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /IMU/ }));
                        },
                        buffer: 1
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/pitchAxis",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/rollAxis",
                } as ControlElement,

                {
                    type: "Control",
                    scope: "#/properties/invert",
                } as ControlElement
            ],
        } as VerticalLayout,
        data: {
            title: 'Control the robot'
        },
        Component: (data: LevelProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
                <WidgetLevelIndicator {...data} />
            </LocalDataSourcesProvider>
        )

    }

}
