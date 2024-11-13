"use client";

import { WidgetDefinition } from '@/core/widgets/widget-interface';

import { VerticalLayout, ControlElement } from "@jsonforms/core";

const WidgetExport = (widgets: WidgetDefinition[]) => {

    // create 50 random widgets
    for (let i = 1; i <= 150; i++) {

        const title: ControlElement = {
            type: "Control",
            scope: "#/properties/title",
        }

        const l: VerticalLayout = {
            type: "VerticalLayout",
            elements: [title],
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
                    </div>
                )
            }

        });
    }


    return widgets;
}

export default WidgetExport;