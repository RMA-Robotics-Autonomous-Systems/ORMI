import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's own shadow sizes. Without these, the
 * token-routed shadows (globals.css `@theme inline`) are read as shadow
 * colours, so `cn("shadow-field", "shadow-none")` kept both and the winner
 * came down to stylesheet order.
 */
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			shadow: ["field", "overlay", "pressed", "well", "thumb"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
