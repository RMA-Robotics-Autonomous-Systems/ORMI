"use client";

import { Component } from "lucide-react";


const WidgetExport = (widgets: WidgetDefinition[]) => {

    // create 50 random widgets
    for (let i = 1; i <= 150; i++) {

        widgets.push({
            id: `widget-${i}`,
            name: `Widget ${i}`,
            description: `Description of widget ${i}`,
            image: 'https://api.dicebear.com/9.x/bottts/png?seed=' + i,

            schema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        title: 'Title'
                    }
                }
            },

            uischema: {
                type: 'VerticalLayout',
                elements: [
                    {
                        type: 'Control',
                        scope: '#/properties/title'
                    }
                ]
            },

            data: {
                title: `Widget ${i}`
            },

            Component: (data: object) => {
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