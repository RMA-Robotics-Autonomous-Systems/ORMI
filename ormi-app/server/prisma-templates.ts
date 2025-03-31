"use client"

import React from 'react';
import { Layouts } from "react-grid-layout";
import { Widget } from "ormi-core/widgets";
import { Datasource } from "ormi-core/datasources";
import { Template } from 'ormi-core/templates';

const handleSave = async (templates: Map<string, Template>) => {
    try {


        const response = await fetch(`/api/templates/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: newDashboard }),
        });

        if (!response.ok) {
            throw new Error(`Error saving dashboard: ${response.statusText}`);
        }
        
        return true;
    } catch (error) {
        console.error("Failed to save dashboard:", error);
        return false;
    }
};

const handleLoad = async (): Promise<Map<string, Template>> => {
    try {

        const response = await fetch(`/api/templates}`);
        
        if (!response.ok) {
            throw new Error(`Error loading dashboard: ${response.statusText}`);
        }
        
        const data = await response.json();
        const templates = new Map<string, Template>();
        
        data.forEach((template: any) => {
            templates.set(template.id, {
                name: template.name,
                widget: template.content,
                public: template.public,
                tags: template.tags,
                yours: template.yours
            });
        });

        return templates;
        
    } catch (error) {
        console.error("Failed to load dashboard:", error);
        return new Map<string, Template>();
    }
};

export { handleSave, handleLoad };