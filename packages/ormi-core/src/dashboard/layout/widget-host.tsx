"use client";

import React from "react";
import { useAtomValue } from "jotai";
import { widgetAtomFamily } from "../atoms";
import { WidgetDefinition } from "../../widgets/widget-interface";
import { widgetNotFound } from "../../widgets/components/widget-not-found";
import { WidgetScopeProvider } from "@workspace/ui/combined/ButtonHolder";
import { WidgetErrorBoundary } from "./widget-error-boundary";

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
 *
 * Wraps the widget body in a WidgetScopeProvider so the widget's
 * useButtonHolder() resolves to this widget's bucket in the single
 * shell-level ButtonHolder registry.
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
	const WidgetComponent = definition.Component;

	return (
		<WidgetScopeProvider value={widgetId}>
			<div className={className ?? "w-full h-full overflow-hidden"}>
				{/*
				 * Isolate the widget body so a throw (e.g. on data briefly
				 * absent now that widgets mount before their datasource is
				 * ready) renders a localized fallback instead of crashing the
				 * whole layout. The boundary wraps the body only — the host
				 * chrome stays usable. resetKeys is the widget id, so a fresh
				 * widget identity clears a prior error; the fallback also
				 * offers a manual retry. Pattern 10: definition.Component
				 * stays the stable module-level reference (WidgetComponent),
				 * the boundary only wraps it.
				 */}
				<WidgetErrorBoundary resetKeys={[widgetId]}>
					<WidgetComponent {...widget.settings} />
				</WidgetErrorBoundary>
			</div>
		</WidgetScopeProvider>
	);
};

/** Memoised widget host — skips re-render unless widgetId or getDefinition reference changes. */
export const WidgetHost = React.memo(WidgetHostComponent);
WidgetHost.displayName = "WidgetHost";
