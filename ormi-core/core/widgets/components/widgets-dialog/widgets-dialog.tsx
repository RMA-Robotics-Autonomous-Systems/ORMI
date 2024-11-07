"use client";

/*
    Dialog that display available widgets as cards

    when click on a widget card, it will open a dialog to configure the widget;
    The confirator returns the widget configuration to be saved.

*/


import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

import { usePluginsManager } from "../../../plugins/components/plugins-provider";
import PluginsManager from "../../../plugins/plugins-manager";
import { PluginsHooks } from "../../../plugins/plugins-types";
import WidgetCard from "../widget-card/widget-card";

import style from "./widgets-dialog.module.css";
import WidgetDefinition from "../../widget-interface";

const WidgetsDialog = () => {

    const pluginsManager = usePluginsManager() as PluginsManager;

    const widgets: WidgetDefinition[] = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button>Widgets</Button>
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
                        return <WidgetCard key={index} definition={widget} />
                    })}
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default WidgetsDialog;