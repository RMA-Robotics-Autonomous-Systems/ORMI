import { VerticalLayout } from "@jsonforms/core";
interface NotAPongProps {
    title: string;
    mouseControl?: boolean;
    aiVsAi?: boolean;
}
export declare function NotAPongDefinition(): {
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
            mouseControl: {
                type: string;
                title: string;
            };
            aiVsAi: {
                type: string;
                title: string;
            };
        };
        required: string[];
    };
    uischema: VerticalLayout;
    data: {
        title: string;
    };
    Component: (data: NotAPongProps) => import("react/jsx-runtime").JSX.Element;
};
export {};
