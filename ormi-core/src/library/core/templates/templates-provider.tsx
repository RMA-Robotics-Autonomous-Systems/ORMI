"use client"
import React, { createContext, useContext, useEffect, useState } from "react";
import { Widget } from "../widgets/widget-interface";

import { Template } from "./templates-types";

import { generateUniqueID } from "../utils/Utils";
import { useNavbar } from "@/library/components/advanced/navbar/navbar-provider";

interface TemplatesProviderContextInterface {
    templates: Map<string, Template>;
    addTemplate: (widget: Template, key?: string) => void;
    removeTemplate: (id: string) => void;
}

export const TemplatesProviderContext = createContext<TemplatesProviderContextInterface | undefined>(undefined);

interface TemplatesProviderProps {
    children: React.ReactNode;

    onSave: (templates: Map<string, Template>) => void;
    onLoad: () => Map<string, Template>;
}

const TemplatesProvider = (props: TemplatesProviderProps) => {


    const [templates, setTemplates] = useState<Map<string, Template>>(new Map<string, Template>());

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    const addTemplate = (template: Template, key?: string) => {

        if (!key) {
            key = generateUniqueID();
        }

        // check if key already exists
        if (templates.has(key)) {
            throw new Error("Key already exists");
        }

        const newTemplates = new Map(templates.set(key, template));

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