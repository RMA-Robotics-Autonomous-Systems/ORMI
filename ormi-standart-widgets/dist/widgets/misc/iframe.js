import { jsx as _jsx } from "react/jsx-runtime";
import { GlobeIcon } from "lucide-react";
export function IframeDefinition() {
    return {
        id: 'iframe-widget',
        name: 'IFrame viewer',
        description: 'Display the differents filters and actions',
        titleProp: 'title',
        icon: _jsx(GlobeIcon, {}),
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
                },
                {
                    type: "Control",
                    scope: "#/properties/url"
                }
            ]
        },
        data: {
            title: 'Plugins viewer'
        },
        Component: function (props) { return (_jsx("div", { style: { width: "100%", height: "100%" }, children: _jsx("iframe", { style: { width: "100%", height: "100%" }, src: props.url }) })); }
    };
}
