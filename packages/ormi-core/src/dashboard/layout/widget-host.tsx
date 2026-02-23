"use client";

import React from "react";
import { useAtomValue } from "jotai";
import { widgetAtomFamily } from "../atoms";
import { WidgetDefinition } from "../../widgets/widget-interface";
import { widgetNotFound } from "../../widgets/components/widget-not-found";
import { ButtonHolderProvider } from "@workspace/ui/combined/ButtonHolder";

/** Props for WidgetHost. */
export interface WidgetHostProps {
	/** Instance ID of the widget (the box_id). */
	widgetId: string;
	/**
	 * Resolver for widget definitions by type ID.
	 * Passed explicitly so the engine's existing resolver is reused
	 * without a second call to usePluginsManager inside each host.
	 */
	getDefinition: (widgetId: string) => WidgetDefinition;
	/** Optional class name applied to the wrapper div. */
	className?: string;
}

/**
 * Renders a single widget instance.
 * Subscribes to widgetAtomFamily so only the affected host re-renders
 * when settings change — not the entire widget list.
 */
const WidgetHostComponent: React.FC<WidgetHostProps> = ({
	widgetId,
	getDefinition,
	className,
}) => {
	const widget = useAtomValue(widgetAtomFamily(widgetId));

	if (!widget) {
		const Fallback = widgetNotFound.Component;
		return (
			<div className={className ?? "w-full h-full overflow-hidden"}>
				<Fallback settings={["Widget not found", widgetId]} />
			</div>
		);
	}

	const definition = getDefinition(widget.widget_id);

	return (
		<ButtonHolderProvider>
			<div className={className ?? "w-full h-full overflow-hidden"}>
				{definition.Component(widget.settings)}
			</div>
		</ButtonHolderProvider>
	);
};

/** Memoised widget host — skips re-render unless widgetId or getDefinition reference changes. */
export const WidgetHost = React.memo(WidgetHostComponent);
WidgetHost.displayName = "WidgetHost";
