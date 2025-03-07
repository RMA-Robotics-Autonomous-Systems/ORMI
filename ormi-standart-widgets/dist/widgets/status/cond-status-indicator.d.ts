import { SelectedTopic } from "ormi-core/datasources";
import { VerticalLayout } from "@jsonforms/core";
interface ConditionStatusIndicatorProps {
    title: string;
    topic: SelectedTopic;
    status: {
        name: string;
        color: string;
        condition: string;
        value: number;
    }[];
}
export declare function CondStatusIndicatorDefinition(): {
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
            status: {
                type: string;
                title: string;
                items: {
                    type: string;
                    properties: {
                        name: {
                            type: string;
                            title: string;
                        };
                        color: {
                            type: string;
                            title: string;
                        };
                        condition: {
                            type: string;
                            title: string;
                            oneOf: {
                                title: string;
                                const: string;
                            }[];
                        };
                        value: {
                            type: string;
                            title: string;
                        };
                    };
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
    Component: (data: ConditionStatusIndicatorProps) => import("react/jsx-runtime").JSX.Element;
};
export {};
