"use client"

import { Template } from 'ormi-core/templates';

const handleSave = async (template: Template) : Promise<string> => {
    try {

        const response = await fetch(`/api/templates/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({content : template}),
        });

        if (!response.ok) {
            throw new Error(`Error saving template: ${response.statusText}`);
        }
        
        return "qsd";
    } catch (error) {
        console.error("Failed to save template:", error);
        return "";
    }
};

const handleDelete = async (templateId: string): Promise<boolean> => {
    return true;
}

const handleLoad = async (): Promise<Map<string, Template>> => {
    try {

        const response = await fetch(`/api/templates`);
        
        if (!response.ok) {
            throw new Error(`Error loading templates: ${response.statusText}`);
        }
        
        const data = await response.json(); 

        console.log("Templates loaded:", data);


        const templates = new Map<string, Template>();
        
        data.forEach((template: any) => {
            templates.set(template.id, {
                name: template.name,
                widget: template.widget, // Directly use the widget property
                public: template.public,
                tags: template.tags,
                yours: template.yours
            });
        });

        console.log("Templates loaded:", templates);

        return templates;
        
    } catch (error) {
        console.error("Failed to load dashboard:", error);
        return new Map<string, Template>();
    }
};

export { handleSave, handleDelete,handleLoad };