"use client";

/*
    Dialog that display available widgets as cards

    when click on a widget card, it will open a dialog to configure the widget;
    The confirator returns the widget configuration to be saved.

*/

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"; // Import the plus icon

import { usePluginsManager } from "../../../plugins/components/plugins-provider";
import PluginsManager from "../../../plugins/plugins-manager";
import { PluginsHooks } from "../../../plugins/plugins-types";
import WidgetCard from "../widget-card/widget-card";

import style from "./widgets-dialog.module.css";
import { WidgetDefinition } from "../../widget-interface";
import { useDashboardManager } from "@/core/dashboard/components/dashboard-provider";

const WidgetsDialog = () => {
    const [isOpen, setIsOpen] = useState(false);

    const pluginsManager = usePluginsManager() as PluginsManager;
    const { addWidget, locked } = useDashboardManager();

    const widgets: WidgetDefinition[] = pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, []);

    const handleValidate = (widget: WidgetDefinition, settings: object) => {
        addWidget(widget, settings);
        setIsOpen(false); // close the dialog
    }

    return (
        !locked && (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button className={style.floatingButton} onClick={() => setIsOpen(true)}>
                        <Plus size={32} /> {/* Increase the size of the plus icon */}
                    </Button>
                </DialogTrigger>
                <DialogContent className="">
                    <DialogHeader>
                        <DialogTitle>Widgets</DialogTitle>
                        <DialogDescription>
                            Select a widget to add to the dashboard
                        </DialogDescription>
                    </DialogHeader>
                    <div className={style.widget_container}>
                        {widgets.map((widget, index) => {
                            return <WidgetCard key={index} definition={widget} onValidate={handleValidate} />
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        )
    )
}

export default WidgetsDialog;