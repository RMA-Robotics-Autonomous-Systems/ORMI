import { useEffect, useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";

import {
    HeadingIndicator,
} from "react-typescript-flight-indicators";




import { CompassIcon } from "lucide-react";
import { SelectedTopic, useLocalDataSource, DatasourceTopic, DatasourceTopicFilter, LocalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { AsyncTopicControlType } from "@workspace/ormi-core/renderers";
import { IMU, Vector3 } from "@workspace/ormi-core/types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

interface HeadingProps {
    title: string;
    topic: SelectedTopic;

    orientationAxis: string;    // with axis to show the orientation
    eastValue: number;           // Est value (in degrees)
    invert: boolean;

}

export function WidgetHeadingIndicator(props: HeadingProps) {

    const { getSource } = useLocalDataSource();
    const [heading, setHeading] = useState(0);

    useEffect(() => {

        const data = getSource(props.topic);
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

        switch (props.orientationAxis) {
            case 'X':
                setHeading((orientation.x * 180 / Math.PI) + props.eastValue);
                break;
            case 'Y':
                setHeading((orientation.y * 180 / Math.PI) + props.eastValue);
                break;
            case 'Z':
                setHeading((orientation.z * 180 / Math.PI) + props.eastValue);
                break;
        }
        // set the orientation value

    }, [getSource, props.topic, props.orientationAxis, props.eastValue, props.invert]);

    return (
        <div className="flex justify-center items-center" style={{ padding: "1rem", height: "100%" }}>
            <HeadingIndicator size={"100%"} heading={heading} showBox={false} />
        </div>
    );
}

export function HeadingDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'heading-widget',
        name: 'Heading Indicator',
        description: 'Heading Indicator',
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
                orientationAxis: {
                    type: 'string',
                    title: 'Orientation Axis',
                    enum: ['X', 'Y', 'Z'],
                    default: 'Z'
                },
                eastValue: {
                    type: 'number',
                    title: 'East Value',
                    default: 0
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
                        buffer: 1,
                        canSelectProperty: false,
                    }
                } as AsyncTopicControlType,
                {
                    type: "Control",
                    scope: "#/properties/orientationAxis",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/eastValue",
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/invert",
                } as ControlElement
            ],
        } as VerticalLayout,
        data: {
            title: 'Heading Indicator'
        },
        Component: (data: HeadingProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
                <WidgetHeadingIndicator {...data} />
            </LocalDataSourcesProvider>
        )

    }

}
