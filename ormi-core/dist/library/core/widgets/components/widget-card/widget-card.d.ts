import { WidgetDefinition } from "../../widget-interface";
interface WidgetCardProps {
    displayType?: "card" | "list" | "gear";
    definition: WidgetDefinition;
    data?: any;
    onValidate: (widget: WidgetDefinition, settings: object) => void;
    fromLoaded?: boolean;
}
export declare function WidgetCard(props: WidgetCardProps): import("react/jsx-runtime").JSX.Element;
export {};
