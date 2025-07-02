"use client"

import React from "react";
import { TemplateComponent } from "./template";
import { Template } from "../templates-types";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@workspace/ui/components/accordion";
import { Button } from "@workspace/ui/components/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@workspace/ui/components/sheet";
import { PluginsHooks, usePluginsManager } from '@workspace/ormi-plugins';

import { WidgetDefinition } from "../../widgets";

interface WidgetTemplateDrawerProps {
    templates: Map<string, Template>;
    removeTemplate: (id: string) => void;
    addWidget: (widget: WidgetDefinition, settings: object) => void;
}


export function WidgetTemplateDrawer(props: WidgetTemplateDrawerProps) {
    const { templates, removeTemplate, addWidget } = props;

    const pluginsManager = usePluginsManager();

    // Pre-fetch available widgets once at component level
    const availableWidgets = pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, []);

    // filter templates if the property "yours" is set to true
    const yourTemplates = Array.from(templates.entries()).filter(([key, template]) => template.yours).reduce((acc, [key, template]) => {
        acc.set(key, template);
        return acc;
    }, new Map<string, Template>());

    const publicTemplates = Array.from(templates.entries()).filter(([key, template]) => !template.yours).reduce((acc, [key, template]) => {
        acc.set(key, template);
        return acc;
    }, new Map<string, Template>());

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant={"ghost"}>Templates</Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Saved widgets</SheetTitle>
                    <SheetDescription>
                        List of available widgets templates
                    </SheetDescription>
                </SheetHeader>
                <div>
                    <Accordion type="single" defaultValue="user-template" collapsible>
                        <AccordionItem value="user-template" >
                            <AccordionTrigger>Your templates</AccordionTrigger>
                            <AccordionContent>
                                {Array.from(yourTemplates.entries()).map(([key, template]) => (
                                    <TemplateComponent key={key} templateId={key} availableWidgets={availableWidgets} template={template} removeTemplate={removeTemplate} addWidget={addWidget} />
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="public-template">
                            <AccordionTrigger>Public templates</AccordionTrigger>
                            <AccordionContent>
                                {Array.from(publicTemplates.entries()).map(([key, template]) => (
                                    <TemplateComponent key={key} templateId={key} availableWidgets={availableWidgets} template={template} removeTemplate={removeTemplate} addWidget={addWidget} />
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </SheetContent>
        </Sheet>
    )
}