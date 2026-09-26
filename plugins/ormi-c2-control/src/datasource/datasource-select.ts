import { datasourceSelectProperty } from "@workspace/utils";

/** The C2 datasource definition id — gated command widgets key on it. */
export const C2_DATASOURCE_ID = "c2-control-source";

/**
 * Schema of the optional `datasource_id` setting shared by the C2 widgets: a
 * pick-list of the C2 datasources configured on the dashboard, rendered by
 * core's datasource-select control from the live list when the dialog opens.
 *
 * Leaving the field on "Automatic" keeps the widget's existing behaviour: it
 * resolves the `c2.*` remote calls across every datasource instead of pinning
 * to one. The stored value is unchanged — a datasource instance id, or the
 * empty string for automatic.
 *
 * @returns A fresh property schema (definitions are built per call).
 */
export function c2DatasourceProperty() {
	return datasourceSelectProperty({
		title: "C2 datasource",
		definitionIds: C2_DATASOURCE_ID,
		autoLabel: "Automatic (any C2 datasource)",
	});
}
