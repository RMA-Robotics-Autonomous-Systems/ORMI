"use client";

import { WidgetDefinition } from '@/core/widgets/widget-interface';

import { VerticalLayout, ControlElement } from "@jsonforms/core";


const getTopicOptions = async () => {

    // return random topics after 1 second
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                { value: 's', label: 'Science' },
                { value: 't', label: 'Technology' },
                { value: 'e', label: 'Engineering' },
                { value: 'm', label: 'Mathematics' },
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
                        {data.topics.map((topic: any, index: number) => (
                            <p key={index}>{topic.topic}</p>
                        ))}
                    </div>
                )
            }

        });
    }


    return widgets;
}

export default WidgetExport;