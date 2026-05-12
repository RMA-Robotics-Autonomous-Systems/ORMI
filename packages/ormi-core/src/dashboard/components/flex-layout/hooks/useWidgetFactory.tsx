import React, { useCallback, useEffect, useRef } from "react";
import { TabNode } from "flexlayout-react";
import { Widget, WidgetDefinition } from "../../../../widgets/widget-interface";
import { WidgetRenderer } from "../components/WidgetRenderer";

/** Props for useWidgetFactory. */
interface UseWidgetFactoryProps {
	widgets: Map<string, Widget>;
	getDefinition: (widget_id: string) => WidgetDefinition;
}

/**
 * Create a FlexLayout factory for widget rendering.
 * @param props - Hook props.
 * @returns FlexLayout factory function.
 */
export const useWidgetFactory = ({
	widgets,
	getDefinition,
}: UseWidgetFactoryProps) => {
	const contentCacheRef = useRef<Map<string, React.ReactNode>>(new Map());

	// Prune removed widgets from the cache so entries don't accumulate indefinitely.
	useEffect(() => {
		contentCacheRef.current.forEach((_, id) => {
			if (!widgets.has(id)) {
				contentCacheRef.current.delete(id);
			}
		});
	}, [widgets]);

	const factory = useCallback(
		(node: TabNode) => {
			const widgetId = node.getId();
			const widget = widgets.get(widgetId);
			const definition = widget ? getDefinition(widget.widget_id) : null;

			// Set save event listener for FlexLayout
			node.setEventListener("save", () => {
				// Called before serialization - nothing needed here
			});

			const cached = contentCacheRef.current.get(widgetId);
			if (cached) {
				return cached;
			}

			const content = (
				<WidgetRenderer
					key={widgetId}
					widgetId={widgetId}
					definition={definition}
				/>
			);

			contentCacheRef.current.set(widgetId, content);
			return content;
		},
		[widgets, getDefinition],
	); // Include getDefinition - should be stable from provider

	return factory;
};
