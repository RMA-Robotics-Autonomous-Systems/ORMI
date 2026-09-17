"use client";

import React from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { widgetAtomFamily, widgetsAtom } from "../atoms";
import { removeWidget } from "../state/actions";
import { WidgetDefinition } from "../../widgets/widget-interface";
import {
	findSettingsMismatches,
	isWidgetDefinitionMissing,
	UnsupportedWidgetCard,
} from "../../widgets/components/widget-status";
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
 *
 * A stored configuration this build cannot render is an expected state, not an
 * exception: the host resolves it to an explicit unsupported-configuration card
 * that names the widget, states that the settings are kept as saved, and offers
 * the way out. It never lets unrenderable settings flow into a widget body,
 * because a widget fed settings its schema no longer accepts either throws or —
 * worse — renders a plausible wrong value.
 */
const WidgetHostComponent: React.FC<WidgetHostProps> = ({
	widgetId,
	getDefinition,
	className,
}) => {
	const widget = useAtomValue(widgetAtomFamily(widgetId));

	// The dashboard's remove path, reached without useDashboardActions: that
	// hook reads the registry context, whose value is a new object on every
	// DashboardShell render, which would re-render every widget host on every
	// dashboard change. useSetAtom subscribes to nothing.
	const setWidgets = useSetAtom(widgetsAtom);
	const handleRemove = React.useCallback(() => {
		setWidgets((prev) => removeWidget(prev, widgetId));
	}, [setWidgets, widgetId]);

	const wrapperClassName = className ?? "w-full h-full overflow-hidden";

	if (!widget) {
		return (
			<div className={wrapperClassName}>
				<UnsupportedWidgetCard
					reason="missing-instance"
					boxId={widgetId}
				/>
			</div>
		);
	}

	const definition = getDefinition(widget.widget_id);

	// Failure mode 1 — the plugin providing this widget type is not in this
	// build. Recoverable by enabling the plugin; otherwise the widget goes.
	if (isWidgetDefinitionMissing(definition)) {
		return (
			<div className={wrapperClassName}>
				<UnsupportedWidgetCard
					reason="missing-definition"
					title={widget.title}
					widgetTypeId={widget.widget_id}
					onRemove={handleRemove}
				/>
			</div>
		);
	}

	// Failure mode 2 — the widget type is present but its schema has moved on
	// from the saved configuration. Without this check the stale settings flow
	// straight into the body and the tile misreports instead of reporting.
	const mismatches = findSettingsMismatches(
		definition.schema,
		widget.settings,
	);
	if (mismatches.length > 0) {
		return (
			<div className={wrapperClassName}>
				<UnsupportedWidgetCard
					reason="unsatisfied-settings"
					title={widget.title}
					widgetTypeId={widget.widget_id}
					mismatches={mismatches}
					onRemove={handleRemove}
				/>
			</div>
		);
	}

	const WidgetComponent = definition.Component;

	return (
		<WidgetScopeProvider value={widgetId}>
			<div className={wrapperClassName}>
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
				<WidgetErrorBoundary
					resetKeys={[widgetId]}
					widgetTitle={widget.title}
					widgetTypeId={widget.widget_id}
				>
					<WidgetComponent {...widget.settings} />
				</WidgetErrorBoundary>
			</div>
		</WidgetScopeProvider>
	);
};

/** Memoised widget host — skips re-render unless widgetId or getDefinition reference changes. */
export const WidgetHost = React.memo(WidgetHostComponent);
WidgetHost.displayName = "WidgetHost";
