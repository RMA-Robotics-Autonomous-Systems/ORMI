import { datasourceSelectProperty } from "@workspace/utils";

/** The RestBag datasource definition id. */
export const REST_BAG_DATASOURCE_ID = "rest-bag-source";

/**
 * Schema of a bag widget's datasource id setting: a pick-list of the RestBag
 * datasources configured on the dashboard, rendered by core's
 * datasource-select control from the live list when the dialog opens.
 *
 * Bag widgets resolve their REST client from a per-instance hook name, so a
 * concrete datasource is required — no "automatic" option is offered. The
 * stored value is the datasource instance id.
 *
 * @param title - Property title.
 * @returns A fresh property schema.
 */
export function restBagDatasourceProperty(title = "Datasource") {
	return datasourceSelectProperty({
		title,
		definitionIds: REST_BAG_DATASOURCE_ID,
	});
}
