import { cva, type VariantProps } from "class-variance-authority";

/**
 * Shared appearance for the four input-binding chips (digital/analog trigger
 * and their binding pickers).
 *
 * Uses the app's theme tokens rather than raw `black/10` so the chips read
 * correctly in dark mode, and matches the `Badge`/`Button` primitives:
 * `border-input` outline, `bg-muted` surface, `ring` on focus, `success` while
 * held. The previous `scale-110` hover/active transform moved neighbouring
 * controls on a dense dashboard and is gone.
 */
export const triggerChipVariants = cva(
	"flex w-full items-center justify-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm font-medium text-foreground select-none border-input transition-colors [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			/** Whether the bound input is currently held. */
			active: {
				true: "border-success bg-success/15",
				false: "",
			},
			/** Whether the chip responds to pointer input. */
			interactive: {
				true: "cursor-pointer hover:bg-accent hover:text-accent-foreground",
				false: "",
			},
		},
		defaultVariants: {
			active: false,
			interactive: false,
		},
	},
);

/** Props accepted by {@link triggerChipVariants}. */
export type TriggerChipVariantProps = VariantProps<typeof triggerChipVariants>;

/** Fixed width the trigger chips share so rows of them line up. */
export const TRIGGER_CHIP_WIDTH = "w-40";
