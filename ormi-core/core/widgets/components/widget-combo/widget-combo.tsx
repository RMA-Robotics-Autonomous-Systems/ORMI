"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

import { usePluginsManager } from "@/core/plugins/components/plugins-provider"
import { useDashboardManager } from "@/core/dashboard/components/dashboard-provider"
import PluginsManager from "@/core/plugins/plugins-manager"
import { PluginsHooks } from "@/core/plugins/plugins-types"
import { WidgetDefinition } from "../../widget-interface"
import WidgetCard from "../widget-card/widget-card"


export function WidgetsCombo() {
    const [open, setOpen] = React.useState(false)

    const pluginsManager = usePluginsManager() as PluginsManager;
    const { addWidget } = useDashboardManager();
    const widgets: WidgetDefinition[] = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);


    const handleValidate = (widget: WidgetDefinition, settings: object) => {

        addWidget(widget, settings);

        setOpen(false); // close the popover
    }


    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[200px] justify-between"
                >
                    {"Select a widget"} <Search className="opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandInput placeholder="Search widgets..." />
                    <CommandList>
                        <CommandEmpty>No widgets found.</CommandEmpty>
                        <CommandGroup>
                            {widgets.map((widget) => (
                                <CommandItem
                                    key={widget.id}
                                    value={widget.id}
                                // onSelect={}
                                >
                                    <WidgetCard definition={widget} onValidate={handleValidate} displayType={"list"} />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
