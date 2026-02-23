import { Widget, WidgetDefinition } from "../../widgets/widget-interface";
import {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../../datasources/datasource-interface";

/**
 * Add a widget to the widgets map.
 * Pure function — no React, no atoms.
 * @param widgets - Current widgets map.
 * @param widget - Widget definition to add.
 * @param settings - Initial settings for the widget.
 * @returns New widgets map with the widget added.
 */
export function addWidget(
	widgets: Map<string, Widget>,
	widget: WidgetDefinition,
	settings: any,
): Map<string, Widget> {
	const box_id = `component_${crypto.randomUUID()}`;
	let widget_title = widget.name;
	if (widget.titleProp) {
		widget_title = settings[widget.titleProp];
	}
	const newWidget: Widget = {
		box_id,
		widget_id: widget.id,
		title: widget_title,
		settings: settings ? { ...settings } : settings,
	};
	const next = new Map(widgets);
	next.set(box_id, newWidget);
	return next;
}

/**
 * Remove a widget from the widgets map.
 * @param widgets - Current widgets map.
 * @param boxId - ID of the widget to remove.
 * @returns New widgets map with the widget removed.
 */
export function removeWidget(
	widgets: Map<string, Widget>,
	boxId: string,
): Map<string, Widget> {
	const next = new Map(widgets);
	next.delete(boxId);
	return next;
}

/**
 * Update a widget's settings in the widgets map.
 * @param widgets - Current widgets map.
 * @param boxId - ID of the widget to update.
 * @param settings - New settings.
 * @param getDefinition - Resolver for widget definitions (needed for titleProp).
 * @returns New widgets map with the widget updated.
 */
export function updateWidget(
	widgets: Map<string, Widget>,
	boxId: string,
	settings: any,
	getDefinition: (widgetId: string) => WidgetDefinition,
): Map<string, Widget> {
	const next = new Map(widgets);
	const widget = next.get(boxId);
	if (!widget) return next;
	const widgetDef = getDefinition(widget.widget_id);
	const nextSettings = settings ? { ...settings } : settings;
	const nextTitle = widgetDef.titleProp
		? nextSettings?.[widgetDef.titleProp]
		: widget.title;
	next.set(boxId, {
		...widget,
		settings: nextSettings,
		title: nextTitle ?? widget.title,
	});
	return next;
}

/**
 * Add a datasource to the datasources map.
 * @param datasources - Current datasources map.
 * @param datasourceId - Type ID of the datasource to add.
 * @param available - All available datasource definitions (from plugin registry).
 * @param settings - Optional initial settings; defaults from definition if omitted.
 * @returns New datasources map with the datasource added.
 * @throws If the datasource definition is not found.
 */
export function addDatasource(
	datasources: Map<string, Datasource>,
	datasourceId: string,
	available: DatasourceDefinition[],
	settings?: DatasourceProviderSettings,
): Map<string, Datasource> {
	const datasourceDef = available.find((d) => d.id === datasourceId);
	if (!datasourceDef) {
		throw new Error(`Datasource ${datasourceId} not found`);
	}
	const id = `datasource_${crypto.randomUUID()}`;
	const datasource: Datasource = {
		datasource_id: datasourceId,
		title: settings?.title || "New Datasource",
		settings: settings
			? { ...settings, id }
			: { ...datasourceDef.data, id, title: "New Datasource" },
	} as Datasource;
	const next = new Map(datasources);
	next.set(id, datasource);
	return next;
}

/**
 * Remove a datasource from the datasources map.
 * @param datasources - Current datasources map.
 * @param sourceId - Instance ID of the datasource to remove.
 * @returns New datasources map with the datasource removed.
 */
export function removeDatasource(
	datasources: Map<string, Datasource>,
	sourceId: string,
): Map<string, Datasource> {
	const next = new Map(datasources);
	next.delete(sourceId);
	return next;
}

/**
 * Update a datasource's settings in the datasources map.
 * The instance ID is taken from `settings.id`.
 * @param datasources - Current datasources map.
 * @param settings - New settings object (must contain `id` and `title`).
 * @returns New datasources map with the datasource updated.
 */
export function updateDatasource(
	datasources: Map<string, Datasource>,
	settings: DatasourceProviderSettings,
): Map<string, Datasource> {
	const next = new Map(datasources);
	const datasource = next.get(settings.id);
	if (!datasource) return next;
	next.set(settings.id, {
		...datasource,
		settings,
		title: settings.title,
	});
	return next;
}

/**
 * Replace the layouts object.
 * @param _current - Unused; exists for API symmetry with other action functions.
 * @param next - New layouts object.
 * @returns The new layouts object.
 */
export function updateLayouts(
	_current: Record<string, any>,
	next: Record<string, any>,
): Record<string, any> {
	return next;
}

/**
 * Toggle the locked state.
 * @param locked - Current locked value.
 * @returns Opposite locked value.
 */
export function toggleLock(locked: boolean): boolean {
	return !locked;
}
