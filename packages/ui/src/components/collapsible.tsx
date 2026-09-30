"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { cn } from "@workspace/ui/lib/utils";

function Collapsible({
	...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
	return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
	...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
	return (
		<CollapsiblePrimitive.CollapsibleTrigger
			data-slot="collapsible-trigger"
			{...props}
		/>
	);
}

/**
 * The collapsible body. It snaps open and shut by default: widget bodies use
 * it, and a panel of live readings does not grow into place. `animated` opts
 * chrome (a docs sidebar section, a settings group) into height motion
 * (`motion-collapse`, globals.css), timed by the motion tokens.
 */
function CollapsibleContent({
	className,
	animated = false,
	...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent> & {
	/** Animate the height on open and close. Default `false`. */
	animated?: boolean;
}) {
	return (
		<CollapsiblePrimitive.CollapsibleContent
			data-slot="collapsible-content"
			className={cn(animated && "motion-collapse", className)}
			{...props}
		/>
	);
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
