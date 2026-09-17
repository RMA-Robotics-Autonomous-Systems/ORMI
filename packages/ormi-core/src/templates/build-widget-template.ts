import type { Widget, WidgetDefinition } from "../widgets/widget-interface";
import type { WidgetTemplate } from "./templates-types";

/**
 * Build a widget template payload from a registry definition and the settings
 * of one configured widget instance.
 *
 * The definition is shared by every widget of its type, so it is only read
 * here: writing the instance settings back onto it would hand the template
 * author's configuration to every widget of that type added afterwards. The
 * settings are copied for the same reason — the template must not alias the
 * live widget's settings object.
 *
 * @param definition - Registry widget definition the template is based on.
 * @param settings - Settings of the configured instance; the definition's own defaults are used when absent.
 * @returns Template ready to pass to `addTemplate`.
 */
export function buildWidgetTemplate(
	definition: WidgetDefinition,
	settings?: Record<string, unknown>,
): WidgetTemplate {
	const widget: Widget = {
		widget_id: definition.id,
		box_id: "",
		title: definition.name,
		settings: { ...(settings ?? definition.data) },
	};

	return {
		name: definition.name,
		type: "widget",
		widget,
		public: false,
		tags: [],
		yours: true,
	};
}
