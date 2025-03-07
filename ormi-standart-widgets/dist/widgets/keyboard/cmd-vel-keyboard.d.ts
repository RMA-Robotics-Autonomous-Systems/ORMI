import { VerticalLayout } from "@jsonforms/core";
import { SelectedTopic } from "ormi-core/datasources";
interface KeyboardControlData {
    title: string;
    forward: string;
    backward: string;
    left: string;
    right: string;
    startingSpeed: number;
    incSpeed: string;
    decSpeed: string;
    unlock: string;
    unlocktoggle: boolean;
    topic: SelectedTopic;
    publicationFrequency: number;
}
export declare function KeyBoardControl(props: KeyboardControlData): import("react/jsx-runtime").JSX.Element;
export declare function KeyboardControlDefinition(): {
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
            forward: {
                type: string;
                title: string;
            };
            backward: {
                type: string;
                title: string;
            };
            left: {
                type: string;
                title: string;
            };
            right: {
                type: string;
                title: string;
            };
            startingSpeed: {
                type: string;
                title: string;
                default: number;
            };
            incSpeed: {
                type: string;
                title: string;
            };
            decSpeed: {
                type: string;
                title: string;
            };
            unlock: {
                type: string;
                title: string;
            };
            unlocktoggle: {
                type: string;
                title: string;
            };
            topic: {
                type: string;
                title: string;
            };
            publicationFrequency: {
                type: string;
                title: string;
                default: number;
            };
        };
        required: string[];
    };
    uischema: VerticalLayout;
    data: {
        title: string;
    };
    Component: (data: KeyboardControlData) => import("react/jsx-runtime").JSX.Element;
};
export {};
