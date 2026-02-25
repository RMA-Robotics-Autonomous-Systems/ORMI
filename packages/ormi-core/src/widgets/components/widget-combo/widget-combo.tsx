"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { WidgetDefinition } from "../../widget-interface";
import { WidgetCard } from "../widget-card/widget-card";

import { Button } from "@workspace/ui/components/button";
import {
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	Command,
} from "@workspace/ui/components/command";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@workspace/ui/components/popover";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@workspace/ui/components/hover-card";

/**
 * Widget picker combo for adding a widget.
 * @param props - Component props.
 * @returns React element.
 */
export function WidgetsCombo(props: {
	widgetDefinitions: WidgetDefinition[];
	onValidate: (
		widget: WidgetDefinition,
		settings: Record<string, unknown>,
	) => void;
}) {
	const [open, setOpen] = React.useState(false);

	const { widgetDefinitions } = props;

	const handleValidate = (
		widget: WidgetDefinition,
		settings: Record<string, unknown>,
	) => {
		props.onValidate(widget, settings);

		setOpen(false); // close the popover
	};

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
						<CommandEmpty>
							No widgets found. You need to add and connect a
							datasource first
						</CommandEmpty>
						<CommandGroup>
							{widgetDefinitions.map((widget) => (
								<CommandItem
									key={widget.id}
									value={widget.id}
									// onSelect={}
								>
									<HoverCard>
										<HoverCardTrigger>
											<WidgetCard
												definition={widget}
												onValidate={handleValidate}
												displayType={"list"}
											/>
										</HoverCardTrigger>
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
	);
}
