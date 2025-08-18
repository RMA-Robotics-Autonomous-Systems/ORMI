"use client";
import { Button } from "@workspace/ui/components/button";
import { toast } from "sonner";
import { WidgetDefinition } from "../../widgets";
import { WidgetTemplate } from "../templates-types";
import { CheckIcon, PlusIcon, TrashIcon, XIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Badge } from "@workspace/ui/components/badge";

import { ActionDialog } from "@workspace/ui/combined/ActionDialog";


interface TemplateProps {
    template: WidgetTemplate;
    templateId: string;
    removeTemplate: (id: string) => void;
    addWidget: (widget: WidgetDefinition, settings: object) => void;
    availableWidgets: WidgetDefinition[];
    updateTemplate?: (id: string, updatedTemplate: WidgetTemplate) => void;
}

export const TemplateComponent = (props: TemplateProps) => {

    const { template, templateId, availableWidgets } = props;
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [editedTemplate, setEditedTemplate] = useState<WidgetTemplate>({ ...template });
    const [newTag, setNewTag] = useState("");

    const handleSaveOptions = () => {
        if (props.updateTemplate) {
            props.updateTemplate(templateId, editedTemplate);
            toast("Template updated successfully");
        }
        setOptionsOpen(false);
    };

    const addTag = () => {
        if (newTag.trim() && !editedTemplate.tags.includes(newTag.trim())) {
            setEditedTemplate((prev: WidgetTemplate) => ({
                ...prev,
                tags: [...prev.tags, newTag.trim()]
            }));
            setNewTag("");
        }
    };

    const removeTag = (tagToRemove: string) => {
        setEditedTemplate((prev: WidgetTemplate) => ({
            ...prev,
            tags: prev.tags.filter((tag: string) => tag !== tagToRemove)
        }));
    };

    if (!template.widget || !template.widget.settings) {
        return <div>
            <p className="text-red-500">Invalid template data</p>
            <Button variant="destructive" onClick={() => props.removeTemplate(templateId)}>Remove Template</Button>
            <p className="text-sm text-gray-500">This template is missing widget settings or widget definition.</p>
        </div>
    }

    return (
        <div key={templateId} className="flex items-center justify-between p-2 border-b border-gray-200">
            <div className="flex gap-2">
                {template.name}
                {template.public && <Badge variant="secondary" className="ml-2">Public</Badge>}
            </div>
            <div className="flex gap-2">
                {template.yours && <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                            <SettingsIcon className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Template Options</DialogTitle>
                            <DialogDescription>
                                Modify template settings and visibility
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="template-name">Template Name</Label>
                                <Input
                                    id="template-name"
                                    value={editedTemplate.name}
                                    onChange={(e) => setEditedTemplate((prev: WidgetTemplate) => ({
                                        ...prev,
                                        name: e.target.value
                                    }))}
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="public-toggle"
                                    checked={editedTemplate.public}
                                    onCheckedChange={(checked) => setEditedTemplate((prev: WidgetTemplate) => ({
                                        ...prev,
                                        public: checked
                                    }))}
                                />
                                <Label htmlFor="public-toggle">Make template public</Label>
                            </div>

                            <div>
                                <Label>Tags</Label>
                                <div className="flex gap-2 mb-2 flex-wrap">
                                    {editedTemplate.tags.map((tag: string) => (
                                        <Badge key={tag} variant="outline" className="cursor-pointer" onClick={() => removeTag(tag)}>
                                            {tag} <XIcon className="h-3 w-3 ml-1" />
                                        </Badge>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Add tag"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && addTag()}
                                    />
                                    <Button type="button" variant="outline" onClick={addTag}>Add</Button>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOptionsOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSaveOptions}>
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>}

                {(template.yours) && <ActionDialog title="Remove template" message="Are you certain?" actions={
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
                />}

                <Button variant="outline" onClick={() => {
                    // Use the pre-fetched widgets list instead of calling hooks inside event handlers
                    const definition = availableWidgets.find(w => w.id === template.widget.widget_id);
                    if (!definition) {
                        // Import any notification/alert system if needed

                        // Show an error message
                        toast("Widget unavailable: " + template.widget.widget_id);
                        return; // Exit early to prevent adding a non-existent widget
                    }

                    props.addWidget(definition, template.widget.settings);
                }}><PlusIcon /></Button>
            </div>
        </div>
    )

}