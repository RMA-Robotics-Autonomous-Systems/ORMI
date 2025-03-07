import { Widget, WidgetDefinition } from "../../../../library/core/widgets/widget-interface";
interface WidgetTemplateDrawerProps {
    templates: Map<string, Widget>;
    removeTemplate: (id: string) => void;
    addWidget: (widget: WidgetDefinition, settings: object) => void;
}
export declare function WidgetTemplateDrawer(props: WidgetTemplateDrawerProps): import("react/jsx-runtime").JSX.Element;
export {};
