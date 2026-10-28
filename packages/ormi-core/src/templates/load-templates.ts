import type { Template } from "./templates-types";

type TemplatesUpdate = (
	update: (prev: Map<string, Template>) => Map<string, Template>,
) => void;

/**
 * Run the provider's initial template load and apply it.
 *
 * The loaded map is merged UNDER the current one, so a template added while
 * the load was in flight survives it. A failed load keeps the current list and
 * is logged, never thrown: nothing awaits the effect that starts it. Returns a
 * cancel function for the effect cleanup; a cancelled load applies nothing.
 *
 * @param onLoad - The provider's persistence read.
 * @param setTemplates - The provider's state setter (functional form).
 * @returns A function that cancels the pending load.
 */
export function startTemplatesLoad(
	onLoad: () => Promise<Map<string, Template>>,
	setTemplates: TemplatesUpdate,
): () => void {
	let cancelled = false;
	// `Promise.resolve().then` also catches an `onLoad` that throws synchronously.
	Promise.resolve()
		.then(onLoad)
		.then(
			(loaded) => {
				if (!cancelled)
					setTemplates((prev) => new Map([...loaded, ...prev]));
			},
			(error: unknown) => {
				if (!cancelled)
					console.error("Failed to load templates", error);
			},
		);
	return () => {
		cancelled = true;
	};
}
