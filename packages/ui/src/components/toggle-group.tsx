"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@workspace/ui/lib/utils";
import { toggleVariants } from "@workspace/ui/components/toggle";
import {
	assignRefs,
	INDICATED_ITEM_CLASS,
	INDICATOR_CLASS,
	useSlidingIndicator,
} from "@workspace/ui/hooks/use-sliding-indicator";

const ToggleGroupContext = React.createContext<
	VariantProps<typeof toggleVariants>
>({
	size: "default",
	variant: "default",
});

/**
 * A row of toggles. A single-select group (`type="single"`) is a segmented
 * control: its "on" look is carried by one indicator that slides between
 * items (`useSlidingIndicator`). A multi-select group has no single active
 * item, so each item paints its own look.
 */
function ToggleGroup({
	className,
	variant,
	size,
	children,
	ref,
	...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
	VariantProps<typeof toggleVariants>) {
	const listRef = React.useRef<HTMLDivElement | null>(null);
	const indicatorRef = React.useRef<HTMLSpanElement | null>(null);
	const single = props.type === "single";
	useSlidingIndicator({
		listRef,
		indicatorRef,
		itemSlot: "toggle-group-item",
		activeState: "on",
		enabled: single,
	});

	return (
		<ToggleGroupPrimitive.Root
			ref={(node) => assignRefs(node, ref, listRef)}
			data-slot="toggle-group"
			data-variant={variant}
			data-size={size}
			className={cn(
				"group/toggle-group relative isolate flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
				className,
			)}
			{...props}
		>
			{single && (
				<span
					ref={indicatorRef}
					aria-hidden
					data-slot="toggle-group-indicator"
					className={INDICATOR_CLASS}
				/>
			)}
			<ToggleGroupContext.Provider value={{ variant, size }}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive.Root>
	);
}

/**
 * One item. `first-of-type` / `last-of-type` rather than `first` / `last`:
 * the group's indicator is a `span` sibling ahead of the item buttons.
 */
function ToggleGroupItem({
	className,
	children,
	variant,
	size,
	...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
	VariantProps<typeof toggleVariants>) {
	const context = React.useContext(ToggleGroupContext);

	return (
		<ToggleGroupPrimitive.Item
			data-slot="toggle-group-item"
			data-variant={context.variant || variant}
			data-size={context.size || size}
			className={cn(
				toggleVariants({
					variant: context.variant || variant,
					size: context.size || size,
				}),
				"min-w-0 flex-1 shrink-0 rounded-none shadow-none data-[state=on]:shadow-well first-of-type:rounded-l-md last-of-type:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first-of-type:border-l",
				INDICATED_ITEM_CLASS,
				className,
			)}
			{...props}
		>
			{children}
		</ToggleGroupPrimitive.Item>
	);
}

export { ToggleGroup, ToggleGroupItem };
