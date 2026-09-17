/**
 * Datasource pick-list schema helper.
 *
 * Widgets that pin themselves to one configured datasource store an opaque
 * instance id (`datasource_<uuid>`) in their settings. Rendered as a plain
 * string property that is a free-text box the operator has to fill from
 * memory. This module turns that property into a `oneOf` of
 * `{ const, title }` members built from the datasources actually configured
 * on the dashboard, so JSON Forms renders a pick-list of datasource *titles*
 * while the persisted value stays the same instance id.
 *
 * It is wired through `WidgetDefinition.extensibilityHook`, which the
 * dashboard shell invokes at registry time with the live `PluginsManager` —
 * so the list is rebuilt on every shell render and always reflects the
 * datasources currently configured.
 *
 * Design constraints (same as `datasource-subscription-registry.ts`):
 * - Plain TypeScript. No React, no import of `@workspace/ormi-core` or
 *   `@workspace/ormi-plugins`. The manager and the datasource instances are
 *   taken as structural interfaces (satisfied by the real `PluginsManager`
 *   and `Datasource`) to avoid a dependency edge from `utils` into the
 *   plugin/core packages and to keep the mapping unit-testable.
 * - The hook name defaults to the `PluginsHooks.AVAILABLE_DATASOURCES` enum
 *   *string value* and can be overridden via options.
 */

/**
 * A configured datasource instance as consumed here. Structurally compatible
 * with `Datasource` from `@workspace/ormi-core`, kept decoupled.
 *
 * `datasource_id` is the *definition* id (e.g. `"c2-control-source"`);
 * `settings.id` is the *instance* id stored in widget settings.
 */
export interface DatasourceInstanceLike {
	/** Definition id of the datasource this instance was created from. */
	datasource_id: string;
	/** Instance title, mirrored from `settings.title`. */
	title?: string;
	/** Instance settings, carrying the instance id and title. */
	settings: { id: string; title?: string };
}

/** Manager surface used to resolve the configured datasources. */
export interface DatasourceListManagerLike {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	applyFilter<T>(name: string, ...args: any[]): T;
}

/** One member of the generated `oneOf` pick-list. */
export interface DatasourceOneOfMember {
	/** Persisted value — the datasource instance id, or `""` for "automatic". */
	const: string;
	/** Label shown in the pick-list. */
	title: string;
}

/** Minimal schema shape mutated by the hook (a `JsonSchema` satisfies it). */
export interface DatasourceSelectSchemaLike {
	properties?: Record<string, unknown>;
}

/**
 * Default hook name — the `PluginsHooks.AVAILABLE_DATASOURCES` string value.
 * Kept literal so `utils` needs no dependency on `@workspace/ormi-plugins`.
 */
const DEFAULT_AVAILABLE_DATASOURCES_HOOK = "plugins-datasources-availables";

/**
 * Value stored when the operator picks the "automatic" member. The empty
 * string is what the widgets already treat as unset (`id?.trim() ? … : …`),
 * so the persisted shape is unchanged.
 */
export const DATASOURCE_SELECT_AUTO_VALUE = "";

/** Options describing which field to rewrite and which datasources to offer. */
export interface DatasourceSelectOptions {
	/** Name of the settings property holding the datasource instance id. */
	field: string;
	/** Datasource *definition* id(s) whose instances may be offered. */
	definitionId: string | readonly string[];
	/**
	 * Label of the leading "leave it to the widget" member. Omit for widgets
	 * that require a concrete datasource — no empty member is then emitted.
	 */
	autoLabel?: string;
	/** Optional replacement title for the rewritten property. */
	title?: string;
	/** Hook name override. Defaults to `AVAILABLE_DATASOURCES`. */
	hook?: string;
}

/**
 * Map configured datasource instances to `oneOf` members.
 *
 * Returns an empty array when no instance matches — the caller then leaves
 * the property as a free-text field, so an operator can still pin a
 * datasource that is not configured (or not yet loaded) by typing its id.
 *
 * @param datasources - Configured datasource instances.
 * @param options - Definition id filter and optional "automatic" label.
 * @returns The `oneOf` members, most-relevant order, deduped by instance id.
 */
export function buildDatasourceOneOf(
	datasources: readonly DatasourceInstanceLike[] | undefined,
	options: Pick<DatasourceSelectOptions, "definitionId" | "autoLabel">,
): DatasourceOneOfMember[] {
	const accepted = new Set(
		typeof options.definitionId === "string"
			? [options.definitionId]
			: options.definitionId,
	);

	const seen = new Set<string>();
	const members: DatasourceOneOfMember[] = [];

	for (const datasource of datasources ?? []) {
		const id = datasource?.settings?.id;
		if (!id || seen.has(id)) continue;
		if (!accepted.has(datasource.datasource_id)) continue;

		seen.add(id);
		members.push({
			const: id,
			title: datasource.settings.title || datasource.title || id,
		});
	}

	if (members.length === 0) return [];

	if (options.autoLabel) {
		members.unshift({
			const: DATASOURCE_SELECT_AUTO_VALUE,
			title: options.autoLabel,
		});
	}

	return members;
}

/**
 * Build a `WidgetDefinition.extensibilityHook` that rewrites one string
 * settings property into a datasource pick-list.
 *
 * The hook is a no-op — leaving the free-text field untouched — when the
 * property is missing or when no configured datasource matches, so a widget
 * never loses the ability to be configured.
 *
 * @param options - Field name, definition id filter, and labels.
 * @returns An extensibility hook that mutates and returns the definition.
 */
export function createDatasourceSelectHook(options: DatasourceSelectOptions) {
	return <TDefinition extends { schema: DatasourceSelectSchemaLike }>(
		definition: TDefinition,
		manager: DatasourceListManagerLike,
	): TDefinition => {
		const properties = definition?.schema?.properties;
		const current = properties?.[options.field];
		if (!properties || !current || typeof current !== "object") {
			return definition;
		}

		const datasources = manager.applyFilter<DatasourceInstanceLike[]>(
			options.hook ?? DEFAULT_AVAILABLE_DATASOURCES_HOOK,
			[],
		);

		const oneOf = buildDatasourceOneOf(datasources, options);
		if (oneOf.length === 0) return definition;

		// Rebuild the property from its own title so re-running the hook on an
		// already-rewritten definition is idempotent.
		const { title, description } = current as {
			title?: string;
			description?: string;
		};

		properties[options.field] = {
			type: "string",
			...((options.title ?? title)
				? { title: options.title ?? title }
				: {}),
			...(description ? { description } : {}),
			oneOf,
		};

		return definition;
	};
}
