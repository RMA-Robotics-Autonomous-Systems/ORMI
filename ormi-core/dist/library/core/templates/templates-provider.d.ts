import React from "react";
import { Widget } from "../widgets/widget-interface";
interface TemplatesProviderContextInterface {
    templates: Map<string, Widget>;
    addTemplate: (widget: Widget, key?: string) => void;
    removeTemplate: (id: string) => void;
}
export declare const TemplatesProviderContext: React.Context<TemplatesProviderContextInterface | undefined>;
interface TemplatesProviderProps {
    children: React.ReactNode;
    onSave: (templates: Map<string, Widget>) => void;
    onLoad: () => Map<string, Widget>;
}
declare const TemplatesProvider: (props: TemplatesProviderProps) => import("react/jsx-runtime").JSX.Element;
declare const useTemplates: () => TemplatesProviderContextInterface;
export { TemplatesProvider, useTemplates };
