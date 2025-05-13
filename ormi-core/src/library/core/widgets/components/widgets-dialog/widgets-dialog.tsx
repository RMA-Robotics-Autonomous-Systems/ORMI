"use client"

/*
    Dialog that display available widgets as cards

    when click on a widget card, it will open a dialog to configure the widget;
    The confirator returns the widget configuration to be saved.

*/

import { useState } from "react";
import { Button } from "@/library/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/library/components/ui/dialog"
import { Plus } from "lucide-react"; // Import the plus icon

import { usePluginsManager } from "../../../plugins/components/plugins-provider";
import PluginsManager from "../../../plugins/plugins-manager";
import { PluginsHooks } from "../../../plugins/plugins-types";
import { WidgetCard } from "../widget-card/widget-card";

import style from "./widgets-dialog.module.css";
import { WidgetDefinition } from "../../widget-interface";
import { useDashboardManager } from "@/library/core/dashboard/components/dashboard-provider";
import React from "react";

export function WidgetsDialog() {
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
                        {widgets.length > 0 ? (
                            widgets.map((widget, index) => (
                                <WidgetCard key={index} definition={widget} onValidate={handleValidate} />
                            ))
                        ) : (
                            <div className={style.empty_state}>
                                <p>No widgets available. Please add and connect a datasource first.</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        )
    )
}