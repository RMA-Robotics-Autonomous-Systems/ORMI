import { VerticalLayout } from "@jsonforms/core";
import { PointsCloudProps } from "./types/points-cloud-types";
export declare function PointsCloudDefinition(): {
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
            topic: {
                type: string;
                title: string;
            };
            maxPoints: {
                type: string;
                title: string;
                minimum: number;
            };
        };
        required: string[];
    };
    uischema: VerticalLayout;
    data: {
        title: string;
        use3D: boolean;
        maxPoints: number;
    };
    Component: (data: PointsCloudProps) => import("react/jsx-runtime").JSX.Element;
};
