"use client"
import React, { createContext, useContext, useEffect, useState } from "react";
import { Widget } from "../widgets/widget-interface";


import { generateUniqueID } from "../utils/Utils";
import { useNavbar } from "@/library/components/advanced/navbar/navbar-provider";
import { WidgetTemplateDrawer } from "./components/templates-drawer";
import { Button } from "@/library/components/ui/button";

interface TemplatesProviderContextInterface {
    templates: Map<string, Widget>;
    addTemplate: (widget: Widget, key?: string) => void;
    removeTemplate: (id: string) => void;
}

export const TemplatesProviderContext = createContext<TemplatesProviderContextInterface | undefined>(undefined);

interface TemplatesProviderProps {
    children: React.ReactNode;

    onSave: (templates: Map<string, Widget>) => void;
    onLoad: () => Map<string, Widget>;
}

const TemplatesProvider = (props: TemplatesProviderProps) => {


    const [templates, setTemplates] = useState<Map<string, Widget>>(new Map<string, Widget>());

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    const addTemplate = (widget: Widget, key?: string) => {

        if (!key) {
            key = generateUniqueID();
        }

        // check if key already exists
        if (templates.has(key)) {
            throw new Error("Key already exists");
        }

        const newTemplates = new Map(templates.set(key, widget));

        setTemplates(newTemplates);

        props.onSave(newTemplates);
    };

    const removeTemplate = (id: string) => {

        if (!templates.has(id)) {
            throw new Error("Key does not exist");
        }

        const newTemplates = new Map(templates);
        newTemplates.delete(id);

        setTemplates(newTemplates);

        props.onSave(newTemplates);
    };

    useEffect(() => {
        const loadedTemplates = props.onLoad();

        setTemplates(loadedTemplates);



        return () => {
            // props.onSave(templates);
        };
    }, [props]);

    return (
        <TemplatesProviderContext.Provider value={{ templates, addTemplate, removeTemplate }}>
            {props.children}
        </TemplatesProviderContext.Provider>
    );

}

const useTemplates = () => {
    const context = useContext(TemplatesProviderContext);

    if (context === undefined) {
        throw new Error("useTemplates must be used within a TemplatesProvider");
    }

    return context;
}

export { TemplatesProvider, useTemplates };