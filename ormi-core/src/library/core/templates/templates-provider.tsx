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

    addTemplate: (template: Template) => Promise<string>;
    removeTemplate: (template_id: string) => Promise<boolean>;
    onLoad: () => Promise<Map<string, Template>>;
}

const TemplatesProvider = (props: TemplatesProviderProps) => {


    const [templates, setTemplates] = useState<Map<string, Template>>(new Map<string, Template>());

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    const addTemplate = async (template: Template, key?: string) => {


        const template_id = await props.addTemplate(template);

        // check if key already exists
        if (templates.has(template_id)) {
            throw new Error("Key already exists");
        }

        const newTemplates = new Map(templates.set(template_id, template));

        setTemplates(newTemplates);

    };

    const removeTemplate = async (id: string) => {

        if (!templates.has(id)) {
            throw new Error("Key does not exist");
        }

        const template = templates.get(id);

        if (!await props.removeTemplate(id)) {
            console.error("Failed to remove template");
            return;
        }

        const newTemplates = new Map(templates);
        newTemplates.delete(id);

        setTemplates(newTemplates);

    };

    useEffect(() => {

        new Promise(async () => {
            const loadedTemplates = await props.onLoad();

            setTemplates(loadedTemplates);
        })

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