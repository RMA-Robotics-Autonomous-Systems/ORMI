
import { ActionDialog, Button } from "@/components";
import { Template } from "../templates-types";
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from "lucide-react";
import { WidgetDefinition } from "@/widgets";
import { toast } from '@/library/hooks/use-toast'; // Adjust import according to your project

interface TemplateProps {
    template: Template;
    templateId: string;
    removeTemplate: (id: string) => void;
    addWidget: (widget: WidgetDefinition, settings: object) => void;
    availableWidgets: WidgetDefinition[];
}

export const TemplateComponent = (props: TemplateProps) => {

    const { template, templateId, availableWidgets } = props;

    return (
        <div key={templateId} className="flex items-center justify-between p-2 border-b border-gray-200">
            <div>
                {template.widget.settings.title}
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
                            action: () => props.removeTemplate(templateId)
                        }
                    ]
                }
                    trigger={<Button variant="destructive"><TrashIcon /></Button>}
                />

                <Button variant="outline" onClick={() => {
                    // Use the pre-fetched widgets list instead of calling hooks inside event handlers
                    const definition = availableWidgets.find(w => w.id === template.widget.widget_id);
                    if (!definition) {
                        // Import any notification/alert system if needed

                        // Show an error message
                        toast({
                            variant: "destructive",
                            title: "Widget unavailable",
                        });
                        return; // Exit early to prevent adding a non-existent widget
                    }

                    props.addWidget(definition, template.widget.settings);
                }}><PlusIcon /></Button>
            </div>
        </div>
    )

}