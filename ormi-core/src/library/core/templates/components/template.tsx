
import { ActionDialog, Button } from "@/components";
import { Template } from "../templates-types";
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from "lucide-react";
import { WidgetDefinition } from "@/widgets";

interface TemplateProps {
    template: Template;
    key: string;
    removeTemplate: (id: string) => void;
    addWidget: (widget: WidgetDefinition, settings: object) => void;
    availableWidgets: WidgetDefinition[];
}

export const TemplateComponent = (props: TemplateProps) => {

    const { template, key, availableWidgets } = props;

    return (
        <div key={key} className="flex items-center justify-between p-2 border-b border-gray-200">
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
                            action: () => props.removeTemplate(key)
                        }
                    ]
                }
                    trigger={<Button variant="destructive"><TrashIcon /></Button>}
                />

                <Button variant="outline" onClick={() => {
                    // Use the pre-fetched widgets list instead of calling hooks inside event handlers
                    const definition = availableWidgets.find(w => w.id === template.widget.widget_id);
                    if (!definition) {
                        throw new Error("Widget definition not found");
                    }

                    props.addWidget(definition, template.widget.settings);
                }}><PlusIcon /></Button>
            </div>
        </div>
    )

}