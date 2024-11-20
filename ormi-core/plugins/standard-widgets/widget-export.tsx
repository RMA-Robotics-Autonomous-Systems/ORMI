"use client";

import { WidgetDefinition } from '@/core/widgets/widget-interface';

import { VerticalLayout, ControlElement } from "@jsonforms/core";
import dynamic from 'next/dynamic';

import { Skeleton } from "@/components/ui/skeleton"


const getTopicOptions = async () => {

    // return random topics after 1 second
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                { value: '/imu/vel/x', label: '/imu/vel/x' },
                { value: '/imu/vel/y', label: '/imu/vel/y' },
                { value: '/imu/vel/z', label: '/imu/vel/z' },
                { value: '/imu/vel/w', label: '/imu/vel/w' },
            ]);
        }, 1000);
    });

}

const WidgetExport = (widgets: WidgetDefinition[]) => {

    // create 50 random widgets
    for (let i = 1; i <= 150; i++) {

        const title: ControlElement = {
            type: "Control",
            scope: "#/properties/title",
        }

        const topic: ControlElement = {
            "type": "Control",
            "scope": "#/properties/topic",
            "options": {
                "async": true,
                "asyncFunction": getTopicOptions,
            }
        }

        // array of topics
        const topics: ControlElement = {
            type: "Control",
            scope: "#/properties/topics",
            options: {
                detail: {
                    type: "VerticalLayout",
                    elements: [topic]
                }
            }
        }


        const l: VerticalLayout = {
            type: "VerticalLayout",
            elements: [title, topics],
        }

        widgets.push({
            id: `widget-${i}`,
            name: `Widget ${i}`,
            description: `Description of widget ${i}`,
            // image: 'https://api.dicebear.com/9.x/bottts/png?seed=' + i,
            titleProp: 'title',

            schema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        title: 'Title'
                    },
                    topics: {
                        type: 'array',
                        title: 'Topics',
                        items: {
                            "type": "object",
                            "properties": {
                                "topic": {
                                    "type": "string",
                                    "title": "Topic"
                                }
                            }
                        }
                    }
                }
            },

            uischema: l,

            data: {
                title: `Widget ${i}`
            },

            Component: (data: any) => {
                return (
                    <div>
                        <h1>{data.title}</h1>
                        <p>Description of widget {i}</p>
                        {data.topics && data.topics.map((topic: any, index: number) => (
                            <p key={index}>{topic.topic}</p>
                        ))}
                    </div>
                )
            }

        });
    }

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title],
    }

    const DynamicComponent = dynamic(() => import('./widgets/line-chart').then(mod => mod.LineChart), {
        loading: () => <Skeleton />,
    })

    const chartWidget: WidgetDefinition = {
        id: 'chart-widget-line',
        name: 'Chart',
        description: 'Display a line chart',
        titleProp: 'title',
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
            }
        },
        uischema: layout,
        data: {
            title: 'Chart'
        },
        Component: (data: any) => <DynamicComponent {...data} />
    }

    widgets.push(chartWidget);


    return widgets;
}

export default WidgetExport;