"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@workspace/ui/lib/utils";
import {
	assignRefs,
	INDICATED_ITEM_BORDER_CLASS,
	INDICATED_ITEM_CLASS,
	INDICATOR_CLASS,
	useSlidingIndicator,
} from "@workspace/ui/hooks/use-sliding-indicator";

function Tabs({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

/**
 * The tab strip. The active tab's look is carried by one indicator that
 * slides between tabs (`useSlidingIndicator`); until it is placed, and
 * whenever it cannot be (a hidden list), the active tab paints its own look.
 */
function TabsList({
	className,
	children,
	ref,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
	const listRef = React.useRef<HTMLDivElement | null>(null);
	const indicatorRef = React.useRef<HTMLSpanElement | null>(null);
	useSlidingIndicator({
		listRef,
		indicatorRef,
		itemSlot: "tabs-trigger",
		activeState: "active",
		copyBorder: true,
	});

	return (
		<TabsPrimitive.List
			ref={(node) => assignRefs(node, ref, listRef)}
			data-slot="tabs-list"
			className={cn(
				"bg-muted text-muted-foreground relative isolate inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px] shadow-well",
				className,
			)}
			{...props}
		>
			<span
				ref={indicatorRef}
				aria-hidden
				data-slot="tabs-indicator"
				className={INDICATOR_CLASS}
			/>
			{children}
		</TabsPrimitive.List>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-(--motion-base) focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				INDICATED_ITEM_CLASS,
				INDICATED_ITEM_BORDER_CLASS,
				className,
			)}
			{...props}
		/>
	);
}

/**
 * A tab's panel. It enters with a short fade and a `--motion-distance` rise
 * at `--motion-fast` (a tab change is the UI's own state); leaving is
 * instant, since Radix unmounts the inactive panel.
 */
function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn(
				"flex-1 outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-(--motion-fast) data-[state=active]:ease-(--motion-ease) data-[state=active]:[--tw-enter-translate-y:var(--motion-distance)]",
				className,
			)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
