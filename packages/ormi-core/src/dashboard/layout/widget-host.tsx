"use client";

import React from "react";
import ReactDOM from "react-dom";
import { useAtomValue } from "jotai";
import { widgetAtomFamily } from "../atoms";
import { WidgetDefinition } from "../../widgets/widget-interface";
import { widgetNotFound } from "../../widgets/components/widget-not-found";
import {
	ButtonHolder,
	ButtonHolderProvider,
} from "@workspace/ui/combined/ButtonHolder";

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
	/**
	 * Optional target element for ButtonHolder portal (Flex layout only).
	 * If provided, ButtonHolder will be rendered into this target via portal.
	 * Used for tab title button integration in FlexLayout.
	 */
	portalTarget?: HTMLElement;
}

/**
 * Portal ButtonHolder into a target element (Flex layout tab titles).
 * @param props - Component props.
 * @returns React element or null.
 */
const ButtonHolderPortal: React.FC<{ portalTarget: HTMLElement }> = ({
	portalTarget,
}) => {
	// Verify target is still in DOM before creating portal
	if (!portalTarget.isConnected) {
		return null;
	}

	// Portal the ButtonHolder component into the tab title container
	// This preserves the React context and event handlers from the content area
	return ReactDOM.createPortal(<ButtonHolder />, portalTarget);
};

/**
 * Renders a single widget instance.
 * Subscribes to widgetAtomFamily so only the affected host re-renders
 * when settings change — not the entire widget list.
 */
const WidgetHostComponent: React.FC<WidgetHostProps> = ({
	widgetId,
	getDefinition,
	className,
	portalTarget,
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
		<ButtonHolderProvider>
			<div className={className ?? "w-full h-full overflow-hidden"}>
				{/* Portal ButtonHolder to tab title (Flex only) */}
				{portalTarget && (
					<ButtonHolderPortal portalTarget={portalTarget} />
				)}
				<WidgetComponent {...widget.settings} />
			</div>
		</ButtonHolderProvider>
	);
};

/** Memoised widget host — skips re-render unless widgetId or getDefinition reference changes. */
export const WidgetHost = React.memo(WidgetHostComponent);
WidgetHost.displayName = "WidgetHost";
