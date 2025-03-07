import "maplibre-gl/dist/maplibre-gl.css";
import { SelectedTopic } from "ormi-core/datasources";
import { VerticalLayout } from "@jsonforms/core";
interface MapsViewerSettings {
    title: string;
    mapUrl: string;
    use3D: boolean;
    apiKey?: string;
    topics: {
        name: string;
        topic: SelectedTopic;
        makerType: "simple" | "heatmap" | "path";
    }[];
}
export default function MapsBoxViewer(props: MapsViewerSettings): import("react/jsx-runtime").JSX.Element;
export declare function MapsBoxViewerDefinition(): {
    id: string;
    name: string;
    description: string;
    titleProp: string;
    icon: import("react/jsx-runtime").JSX.Element;
    schema: {
        type: string;
        properties: {
            title: {
                type: string;
                title: string;
            };
            mapUrl: {
                type: string;
                title: string;
                oneOf: {
                    const: string;
                    title: string;
                }[];
            };
            use3D: {
                type: string;
                title: string;
                default: boolean;
            };
            apiKey: {
                type: string;
                title: string;
            };
            topics: {
                type: string;
                title: string;
                items: {
                    type: string;
                    properties: {
                        name: {
                            type: string;
                            title: string;
                        };
                        topic: {
                            type: string;
                            title: string;
                        };
                        makerType: {
                            type: string;
                            title: string;
                            enum: string[];
                            default: string;
                        };
                    };
                    required: string[];
                };
            };
        };
        required: string[];
    };
    uischema: VerticalLayout;
    data: {
        title: string;
        use3D: boolean;
    };
    Component: (data: MapsViewerSettings) => import("react/jsx-runtime").JSX.Element;
};
export {};
