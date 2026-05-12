"use client";

import { useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
import {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	datasourcesAtom,
} from "../atoms";
import { WidgetDefinition } from "../../widgets/widget-interface";
import { DatasourceProviderSettings } from "../../datasources/datasource-interface";
import { widgetNotFound } from "../../widgets/components/widget-not-found";
import { useDashboardRegistry } from "../shell/dashboard-shell";
import * as actions from "./actions";

/** Public contract for all dashboard mutation operations. */
export interface DashboardActions {
	/** Resolve a widget definition by its type ID. */
	getDefinition: (widgetId: string) => WidgetDefinition;
	addWidget: <TSettings extends Record<string, unknown>>(
		widget: WidgetDefinition<TSettings>,
		settings: TSettings,
	) => void;
	removeWidget: (boxId: string) => void;
	updateWidget: <TSettings extends Record<string, unknown>>(
		boxId: string,
		settings: TSettings,
	) => void;
	updateLayouts: (
		updater: (prev: Record<string, unknown>) => Record<string, unknown>,
	) => void;
	addDatasource: (
		datasourceId: string,
		settings?: DatasourceProviderSettings,
	) => void;
	removeDatasource: (datasourceId: string) => void;
	/** The instance id is read from `settings.id`. */
	updateDatasource: (settings: DatasourceProviderSettings) => void;
	toggleLock: () => void;
}

/**
 * Hook providing all dashboard mutation actions.
 * Reads atoms and plugin registries internally; callers receive
 * a stable set of typed functions with no knowledge of atoms or reducers.
 * @returns DashboardActions
 */
export function useDashboardActions(): DashboardActions {
	const setWidgets = useSetAtom(widgetsAtom);
	const setLayouts = useSetAtom(layoutsAtom);
	const setLocked = useSetAtom(lockedAtom);
	const setDatasources = useSetAtom(datasourcesAtom);

	const { widgetDefinitions, datasourceDefinitions } = useDashboardRegistry();

	// widgetDefinitions is a new array on every DashboardShell render because
	// pluginsManager.applyFilter() is called in the render body (intentional —
	// hooks call order constraint). Closing over the array would make
	// getDefinition a new reference on every render, propagating through
	// updateWidget → handleSaveWidget → widgets_elements useMemo → all tiles.
	// Instead, write to a ref during render (parent always renders before
	// children so GridWidgetTile reads the latest value).
	const widgetDefinitionsRef = useRef(widgetDefinitions);
	widgetDefinitionsRef.current = widgetDefinitions;

	const getDefinition = useCallback(
		(widgetId: string): WidgetDefinition => {
			const found = widgetDefinitionsRef.current.find(
				(w) => w.id === widgetId,
			);
			return found ?? widgetNotFound;
		},
		[], // stable: always reads latest definitions via ref
	);

	const addWidget = useCallback(
		<TSettings extends Record<string, unknown>>(
			widget: WidgetDefinition<TSettings>,
			settings: TSettings,
		) => {
			setWidgets((prev) => actions.addWidget(prev, widget, settings));
		},
		[setWidgets],
	);

	const removeWidget = useCallback(
		(boxId: string) => {
			setWidgets((prev) => actions.removeWidget(prev, boxId));
		},
		[setWidgets],
	);

	const updateWidget = useCallback(
		<TSettings extends Record<string, unknown>>(
			boxId: string,
			settings: TSettings,
		) => {
			setWidgets((prev) =>
				actions.updateWidget(prev, boxId, settings, getDefinition),
			);
		},
		[setWidgets, getDefinition],
	);

	const updateLayouts = useCallback(
		(
			updater: (prev: Record<string, unknown>) => Record<string, unknown>,
		) => {
			setLayouts((prev) => actions.updateLayouts(prev, updater(prev)));
		},
		[setLayouts],
	);

	const addDatasource = useCallback(
		(datasourceId: string, settings?: DatasourceProviderSettings) => {
			setDatasources((prev) =>
				actions.addDatasource(
					prev,
					datasourceId,
					datasourceDefinitions,
					settings,
				),
			);
		},
		[setDatasources, datasourceDefinitions],
	);

	const removeDatasource = useCallback(
		(datasourceId: string) => {
			setDatasources((prev) =>
				actions.removeDatasource(prev, datasourceId),
			);
		},
		[setDatasources],
	);

	const updateDatasource = useCallback(
		(settings: DatasourceProviderSettings) => {
			setDatasources((prev) => actions.updateDatasource(prev, settings));
		},
		[setDatasources],
	);

	const toggleLock = useCallback(() => {
		setLocked((prev) => actions.toggleLock(prev));
	}, [setLocked]);

	return {
		getDefinition,
		addWidget,
		removeWidget,
		updateWidget,
		updateLayouts,
		addDatasource,
		removeDatasource,
		updateDatasource,
		toggleLock,
	};
}
