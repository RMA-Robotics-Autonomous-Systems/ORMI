import { createDatasourceSelectHook } from "@workspace/utils";

/** The C2 datasource definition id — gated command widgets key on it. */
export const C2_DATASOURCE_ID = "c2-control-source";

/**
 * Widget extensibility hook turning the optional `datasource_id` setting into
 * a pick-list of the configured C2 datasources.
 *
 * Leaving the field on "Automatic" keeps the widget's existing behaviour: it
 * resolves the `c2.*` remote calls across every datasource instead of pinning
 * to one. The stored value is unchanged — a datasource instance id, or the
 * empty string for automatic.
 */
export const c2DatasourceSelectHook = createDatasourceSelectHook({
	field: "datasource_id",
	definitionId: C2_DATASOURCE_ID,
	autoLabel: "Automatic (any C2 datasource)",
});
