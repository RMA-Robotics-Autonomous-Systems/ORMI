"use client"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from "lucide-react";
import { ActionDialog } from "@/components/advanced/ActionDialog/action-dialog";
import { Widget, WidgetDefinition } from "@/core/widgets/widget-interface";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";

interface WidgetTemplateDrawerProps {
    templates: Map<string, Widget>;
    removeTemplate: (id: string) => void;
    addWidget: (widget: WidgetDefinition, settings: object) => void;
}

export function WidgetTemplateDrawer(props: WidgetTemplateDrawerProps) {
    const { templates, removeTemplate, addWidget } = props;

    const pluginsManager = usePluginsManager();

    // Pre-fetch available widgets once at component level
    const availableWidgets = pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, []);

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
                    {Array.from(templates.entries()).map(([key, widget]) => (
                        <div key={key} className="flex items-center justify-between p-2 border-b border-gray-200">
                            <div>
                                {widget.settings.title}
                            </div>
                            <div className="flex gap-2">
                                <ActionDialog title="Remove template" message="Are you certain?" actions={
                                    [
                                        {
                                            title: <XIcon />,
                                            action: () => { }
                                        },
                                        {
                                            title: <CheckIcon />,
                                            action: () => removeTemplate(key)
                                        }
                                    ]
                                }
                                    trigger={<Button variant="destructive"><TrashIcon /></Button>}
                                />

                                <Button variant="outline" onClick={() => {
                                    // Use the pre-fetched widgets list instead of calling hooks inside event handlers
                                    const definition = availableWidgets.find(w => w.id === widget.widget_id);
                                    if (!definition) {
                                        throw new Error("Widget definition not found");
                                    }

                                    addWidget(definition, widget.settings);
                                }}><PlusIcon /></Button>
                            </div>
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    )
}