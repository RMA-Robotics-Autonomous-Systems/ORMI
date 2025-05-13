"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { Button } from "@/library/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/library/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/library/components/ui/popover"

import { usePluginsManager } from "@/library/core/plugins/components/plugins-provider"
import PluginsManager from "@/library/core/plugins/plugins-manager"
import { PluginsHooks } from "@/library/core/plugins/plugins-types"
import { WidgetDefinition } from "../../widget-interface"
import { WidgetCard } from "../widget-card/widget-card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/library/components/ui/hover-card"


export function WidgetsCombo(props: { onValidate: (widget: WidgetDefinition, settings: object) => void }) {
    const [open, setOpen] = React.useState(false)

    const pluginsManager = usePluginsManager() as PluginsManager;
    const widgets: WidgetDefinition[] = pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, []);


    const handleValidate = (widget: WidgetDefinition, settings: object) => {

        props.onValidate(widget, settings);

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
                        <CommandEmpty>No widgets found. You need to add and connect a datasource first</CommandEmpty>
                        <CommandGroup>
                            {widgets.map((widget) => (
                                <CommandItem
                                    key={widget.id}
                                    value={widget.id}
                                // onSelect={}
                                >
                                    <HoverCard>
                                        <HoverCardTrigger><WidgetCard definition={widget} onValidate={handleValidate} displayType={"list"} /></HoverCardTrigger>
                                        <HoverCardContent>
                                            {widget.description}
                                        </HoverCardContent>
                                    </HoverCard>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
