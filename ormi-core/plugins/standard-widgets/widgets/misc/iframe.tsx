import { WidgetDefinition } from "@/core/widgets/widget-interface";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { GlobeIcon } from "lucide-react";

interface IFrameProps {
    title: string;
    url: string;
}

export function IframeDefinition(): WidgetDefinition {

    return {
        id: 'iframe-widget',
        name: 'IFrame viewer',
        description: 'Display the differents filters and actions',
        titleProp: 'title',
        icon: <GlobeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                url: {
                    type: "string",
                    title: "Url"
                }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title"
                } as ControlElement,
                {
                    type: "Control",
                    scope: "#/properties/url"
                } as ControlElement
            ]

        } as VerticalLayout,
        data: {
            title: 'Plugins viewer'
        },
        Component: (props: IFrameProps) => (
            <div style={{ width: "100%", height: "100%" }}>
                <iframe style={{ width: "100%", height: "100%" }} src={props.url}></iframe>
            </div>
        )

    } as WidgetDefinition;
}