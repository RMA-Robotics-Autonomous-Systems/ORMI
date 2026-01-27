"use client";
import { BookTemplateIcon } from "lucide-react";

import { useState } from "react";
import { useTemplates } from "../templates-provider";
import { WidgetTemplate } from "../templates-types";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import { WidgetDefinition } from "../../widgets";

export function AddToTemplatesBtn(props: {
  widget: WidgetDefinition;
  data: any;
}) {
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
    };

    const template: WidgetTemplate = {
      name: props.widget.name,
      type: "widget",
      widget: widget,
      public: false,
      tags: [],
      yours: true,
    };

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
          <Button onClick={handleSaveTemplate}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
