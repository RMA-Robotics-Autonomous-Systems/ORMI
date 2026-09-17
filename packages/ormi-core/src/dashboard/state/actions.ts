import { Widget, WidgetDefinition } from "../../widgets/widget-interface";
import {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../../datasources/datasource-interface";
import { NEW_DATASOURCE_TITLE } from "../../datasources/datasource-configured";
import { v4 as uuidv4 } from "uuid";

/**
 * Mint a box id for a new widget instance.
 *
 * Exposed so a caller can know the id *before* the widget exists and place it
 * in the layout in the same update — {@link addWidget} alone leaves the new
 * tile wherever the engine happens to put it.
 * @returns A fresh widget instance id.
 */
export function createWidgetBoxId(): string {
	return `component_${uuidv4()}`;
}

/**
 * Resolve the label a widget instance carries in its tile header or tab.
 *
 * `titleProp` names a settings property, and a widget may perfectly well be
 * created without it — a routed widget skips the configuration dialog, and a
 * definition whose title has no schema default arrives empty. Stringifying that
 * missing value put the literal `"undefined"` on the tile, which reads as a
 * broken dashboard rather than as an unnamed panel, so the definition's own
 * name stands in.
 *
 * @param definition - Widget definition being instantiated or updated.
 * @param settings - The instance's settings.
 * @param fallback - Label to keep when the definition names no title property.
 * @returns The label to store on the instance.
 */
function resolveWidgetTitle(
	definition: Pick<WidgetDefinition, "name" | "titleProp">,
	settings: Record<string, unknown> | undefined,
	fallback: string,
): string {
	if (!definition.titleProp) return fallback;

	const value = settings?.[definition.titleProp];
	if (typeof value === "string" && value.trim() !== "") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return definition.name || fallback;
}

/**
 * Add a widget to the widgets map.
 * Pure function — no React, no atoms.
 * @param widgets - Current widgets map.
 * @param widget - Widget definition to add.
 * @param settings - Initial settings for the widget.
 * @param boxId - Instance id to use; minted when omitted.
 * @returns New widgets map with the widget added.
 */
export function addWidget<TSettings extends Record<string, unknown>>(
	widgets: Map<string, Widget>,
	widget: WidgetDefinition<TSettings>,
	settings: TSettings,
	boxId: string = createWidgetBoxId(),
): Map<string, Widget> {
	const box_id = boxId;
	const widget_title = resolveWidgetTitle(widget, settings, widget.name);
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
 * Grid width, in columns, given to a newly placed tile at each breakpoint.
 *
 * Roughly a third of the row on wide screens, narrowing with the viewport so a
 * new tile is never wider than the grid it lands in.
 */
const NEW_WIDGET_GRID_WIDTH: Record<string, number> = {
	lg: 4,
	md: 4,
	sm: 3,
	xs: 2,
	xxs: 2,
};

/** Grid height, in rows, given to a newly placed tile (rowHeight is 30px). */
const NEW_WIDGET_GRID_HEIGHT = 10;

/** Fallback width for a breakpoint key the grid engine does not name. */
const DEFAULT_NEW_WIDGET_GRID_WIDTH = 4;

/** One react-grid-layout item, as persisted under the "grid" layout key. */
interface GridLayoutItem extends Record<string, unknown> {
	i: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Give a newly added widget a place at the top of the grid layout.
 *
 * Without this the grid engine receives a child it has no layout item for and
 * auto-places it below every existing tile. On a populated dashboard that is
 * below the fold, so "click a topic, a viewer appears" reads as "nothing
 * happened". The new tile is inserted at the top-left and everything else moves
 * down by its height, which is collision-free under the free-positioning
 * compactor the grid engine uses (it prevents collisions and never compacts).
 *
 * Only breakpoints the persisted layout already describes are touched: a
 * dashboard that has never been laid out is left to the engine, which places
 * from the top anyway, and inventing entries for absent breakpoints would
 * strand the widgets the engine would otherwise have positioned itself.
 *
 * @param layouts - Current layouts object, keyed by engine.
 * @param boxId - Instance id of the widget being placed.
 * @returns New layouts object, or `layouts` unchanged when nothing applied.
 */
export function placeWidgetInGridLayouts(
	layouts: Record<string, unknown>,
	boxId: string,
): Record<string, unknown> {
	const grid = layouts["grid"];
	if (!grid || typeof grid !== "object" || Array.isArray(grid)) {
		return layouts;
	}

	const height = NEW_WIDGET_GRID_HEIGHT;
	const next: Record<string, GridLayoutItem[]> = {};
	let changed = false;

	for (const [breakpoint, value] of Object.entries(
		grid as Record<string, unknown>,
	)) {
		if (!Array.isArray(value)) continue;
		const items = value as GridLayoutItem[];
		if (items.some((item) => item?.i === boxId)) {
			next[breakpoint] = items;
			continue;
		}

		const width =
			NEW_WIDGET_GRID_WIDTH[breakpoint] ?? DEFAULT_NEW_WIDGET_GRID_WIDTH;

		next[breakpoint] = [
			{ i: boxId, x: 0, y: 0, w: width, h: height },
			...items.map((item) => ({
				...item,
				y: (typeof item?.y === "number" ? item.y : 0) + height,
			})),
		];
		changed = true;
	}

	if (!changed) return layouts;
	return { ...layouts, grid: { ...(grid as object), ...next } };
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
export function updateWidget<TSettings extends Record<string, unknown>>(
	widgets: Map<string, Widget>,
	boxId: string,
	settings: TSettings,
	getDefinition: (widgetId: string) => WidgetDefinition,
): Map<string, Widget> {
	const next = new Map(widgets);
	const widget = next.get(boxId);
	if (!widget) return next;
	const widgetDef = getDefinition(widget.widget_id);
	const nextSettings = settings ? { ...settings } : settings;
	next.set(boxId, {
		...widget,
		settings: nextSettings,
		title: resolveWidgetTitle(widgetDef, nextSettings, widget.title),
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
	const id = `datasource_${uuidv4()}`;
	const datasource: Datasource = {
		datasource_id: datasourceId,
		title: settings?.title || NEW_DATASOURCE_TITLE,
		settings: settings
			? { ...settings, id }
			: { ...datasourceDef.data, id, title: NEW_DATASOURCE_TITLE },
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
 * Returns `current` unchanged when the serialized content is identical,
 * preventing downstream atom subscribers from seeing a spurious reference change.
 * @param current - Current layouts object.
 * @param next - New layouts object.
 * @returns The new layouts object, or `current` if nothing changed.
 */
export function updateLayouts(
	current: Record<string, unknown>,
	next: Record<string, unknown>,
): Record<string, unknown> {
	if (JSON.stringify(current) === JSON.stringify(next)) return current;
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
