import { SelectedTopic } from 'ormi-core/datasources';
import { VerticalLayout } from '@jsonforms/core';
import 'uplot/dist/uPlot.min.css';
interface TimeSeriesSettings {
    title: string;
    timeHistory: number;
    updateFrequency: number;
    topics: {
        topic: SelectedTopic;
        color: string;
        fill: boolean;
    }[];
}
export declare function TimeChartComponent(props: TimeSeriesSettings): import("react/jsx-runtime").JSX.Element;
export declare function TimeSeriesChartDefinition(): {
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
            timeHistory: {
                type: string;
                title: string;
                default: number;
            };
            updateFrequency: {
                type: string;
                title: string;
                default: number;
            };
            axis: {
                type: string;
                title: string;
                properties: {
                    yMin: {
                        type: string;
                        title: string;
                    };
                    yMax: {
                        type: string;
                        title: string;
                    };
                    yLabel: {
                        type: string;
                        title: string;
                    };
                };
            };
            topics: {
                type: string;
                title: string;
                items: {
                    type: string;
                    properties: {
                        topic: {
                            type: string;
                            title: string;
                        };
                        color: {
                            type: string;
                            title: string;
                        };
                        fill: {
                            type: string;
                            title: string;
                            default: boolean;
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
    };
    Component: (data: TimeSeriesSettings) => import("react/jsx-runtime").JSX.Element;
};
export {};
