"use client"
import { Button } from "ormi-components";
import { BookTemplateIcon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "ormi-components";
import { useState } from "react";
import { WidgetDefinition } from "@/library/core/widgets/widget-interface";
import { useTemplates } from "../templates-provider";
import React from "react";
import { Template } from "../templates-types";

export function AddToTemplatesBtn(props: { widget: WidgetDefinition, data: any }) {
    const [open, setOpen] = useState(false);
    const { addTemplate } = useTemplates();

    const handleSaveTemplate = () => {
        // Implementation for saving to templates
        props.widget.data = props.data;

        const widget = {
            widget_id: props.widget.id,
            box_id: "",
            title: props.widget.name,
            settings: props.widget.data,
        }

        const template: Template = {
            name: props.widget.name,
            widget: widget,
            public: false,
            tags: [],
            yours: true,
        }

        addTemplate(template);

        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost">
                    Save to templates <BookTemplateIcon className="ml-2 h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Save to Templates</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to save this to your templates?
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSaveTemplate}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}