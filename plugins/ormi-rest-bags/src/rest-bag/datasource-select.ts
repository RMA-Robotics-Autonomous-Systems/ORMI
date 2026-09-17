import { createDatasourceSelectHook } from "@workspace/utils";

/** The RestBag datasource definition id. */
export const REST_BAG_DATASOURCE_ID = "rest-bag-source";

/**
 * Build a widget extensibility hook turning a bag widget's datasource id
 * setting into a pick-list of the configured RestBag datasources.
 *
 * Bag widgets resolve their REST client from a per-instance hook name, so a
 * concrete datasource is required — no "automatic" member is offered.
 *
 * @param field - Settings property holding the datasource instance id.
 * @returns A widget extensibility hook.
 */
export function createRestBagDatasourceSelectHook(field: string) {
	return createDatasourceSelectHook({
		field,
		definitionId: REST_BAG_DATASOURCE_ID,
	});
}
