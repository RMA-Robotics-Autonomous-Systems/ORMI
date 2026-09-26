import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@workspace/ui/lib/utils";

/**
 * A shadowed button's pressed state: `--elevation-pressed` for the shadow and
 * `--pressed-offset` (globals.css, default 0px) for how far the face moves
 * into it, right and down. The outline toggle does the same while on.
 */
const PRESSED =
	"active:shadow-pressed active:translate-x-(--pressed-offset) active:translate-y-(--pressed-offset)";

/**
 * The edge of a filled button, `--action-border-color` (globals.css, default
 * transparent). An inset outline rather than a border, so it takes no space:
 * a button is the same size whatever a preset sets. It replaces `outline-none`
 * (tailwind-merge drops that for `outline-solid`); focus is the ring, which
 * is a box-shadow and unaffected.
 */
const ACTION_BORDER =
	"outline-solid outline-(length:--border-width) -outline-offset-(length:--border-width) outline-(color:--action-border-color)";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,translate] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default: `bg-primary text-primary-foreground shadow-xs ${PRESSED} ${ACTION_BORDER} hover:bg-primary/90`,
				destructive: `bg-destructive text-white shadow-xs ${PRESSED} ${ACTION_BORDER} hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40`,
				outline: `border border-field-border bg-background shadow-xs ${PRESSED} hover:bg-accent hover:text-accent-foreground`,
				secondary: `bg-secondary text-secondary-foreground shadow-xs ${PRESSED} ${ACTION_BORDER} hover:bg-secondary/80`,
				ghost: "hover:bg-accent hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
				lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
				icon: "size-9",
				"icon-sm": "size-8",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
