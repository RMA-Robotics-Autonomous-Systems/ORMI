"use client"
import { Button } from "@/library/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/library/components/ui/sheet"
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from "lucide-react";
import { ActionDialog } from "@/library/components/advanced/ActionDialog/action-dialog";
import { Widget, WidgetDefinition } from "@/library/core/widgets/widget-interface";
import { PluginsHooks } from "@/library/core/plugins/plugins-types";
import { usePluginsManager } from "@/library/core/plugins/components/plugins-provider";
import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components";
import { TemplateComponent } from "./template";
import { Template } from "../templates-types";

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
            <Button asChild variant={"ghost"} >
                <SheetTrigger>Templates</SheetTrigger>
            </Button>
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