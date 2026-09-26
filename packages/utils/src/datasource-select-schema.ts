/**
 * Datasource pick-list: schema marker and option building.
 *
 * Widgets that pin themselves to one configured datasource store an opaque
 * instance id (`datasource_<uuid>`) in their settings. The property is
 * declared as a plain string carrying a {@link DATASOURCE_SELECT_KEYWORD}
 * marker, and core's datasource-select JSON Forms renderer turns every marked
 * control into a pick-list of the datasources configured on the dashboard,
 * read **when the dialog renders**. The persisted value is the instance id
 * either way.
 *
 * The list is deliberately never baked into the schema (a `oneOf` built at
 * registry time): the registry is resolved by `DashboardShell`, which is the
 * parent of the provider that knows the configured datasources, so any list
 * captured there is a snapshot taken before that provider existed. Keeping
 * the schema a plain string also means validation never depends on which
 * datasources happen to be configured: a stored id for a datasource that has
 * since been removed stays valid, and the renderer names it instead.
 *
 * Design constraints:
 * - Plain TypeScript. No React, no import of `@workspace/ormi-core` or
 *   `@workspace/ormi-plugins`; datasource instances are taken as a structural
 *   interface so the mapping stays unit-testable and dependency-free.
 * - The marker is a custom keyword rather than `format`: JSON Forms' AJV runs
 *   with `strict: false`, which ignores an unknown keyword silently but warns
 *   on every compile for an unknown format.
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

/** JSON Schema keyword marking a string property as a datasource pick-list. */
export const DATASOURCE_SELECT_KEYWORD = "datasourceSelect";

/**
 * Value stored when the operator picks the "automatic" option. The empty
 * string is what the widgets already treat as unset (`id?.trim() ? … : …`),
 * so the persisted shape is unchanged.
 */
export const DATASOURCE_SELECT_AUTO_VALUE = "";

/** Content of the {@link DATASOURCE_SELECT_KEYWORD} marker. */
export interface DatasourceSelectMarker {
	/**
	 * Datasource *definition* ids whose instances may be offered. Absent or
	 * empty accepts every configured datasource.
	 */
	definitionIds?: readonly string[];
	/**
	 * Label of a leading "leave it to the widget" option, stored as
	 * {@link DATASOURCE_SELECT_AUTO_VALUE}. Omit for widgets that need a
	 * concrete datasource.
	 */
	autoLabel?: string;
}

/** Options for {@link datasourceSelectProperty}. */
export interface DatasourceSelectPropertyOptions {
	/** Property title shown above the pick-list. */
	title: string;
	/** Optional property description. */
	description?: string;
	/** Definition id(s) whose instances may be offered. Omit to accept all. */
	definitionIds?: string | readonly string[];
	/** Label of the optional "automatic" option. */
	autoLabel?: string;
}

/** The schema {@link datasourceSelectProperty} returns. */
export interface DatasourceSelectPropertySchema {
	type: "string";
	title: string;
	description?: string;
	[DATASOURCE_SELECT_KEYWORD]: DatasourceSelectMarker;
}

/**
 * Build the schema of a settings property holding a datasource instance id,
 * rendered as a pick-list of the configured datasources.
 *
 * @param options - Title, optional definition id filter and "automatic" label.
 * @returns A string property schema carrying the pick-list marker.
 * @example
 * properties: {
 *   datasource_id: datasourceSelectProperty({
 *     title: "C2 datasource",
 *     definitionIds: "c2-control-source",
 *     autoLabel: "Automatic (any C2 datasource)",
 *   }),
 * }
 */
export function datasourceSelectProperty(
	options: DatasourceSelectPropertyOptions,
): DatasourceSelectPropertySchema {
	const definitionIds =
		options.definitionIds === undefined
			? undefined
			: typeof options.definitionIds === "string"
				? [options.definitionIds]
				: [...options.definitionIds];

	const marker: DatasourceSelectMarker = {
		...(definitionIds && definitionIds.length > 0 ? { definitionIds } : {}),
		...(options.autoLabel ? { autoLabel: options.autoLabel } : {}),
	};

	return {
		type: "string",
		title: options.title,
		...(options.description ? { description: options.description } : {}),
		[DATASOURCE_SELECT_KEYWORD]: marker,
	};
}

/**
 * Read the pick-list marker off a property schema.
 *
 * @param schema - Any value; typically a resolved JSON Forms control schema.
 * @returns The marker, or `undefined` when the schema carries none.
 */
export function readDatasourceSelectMarker(
	schema: unknown,
): DatasourceSelectMarker | undefined {
	if (!schema || typeof schema !== "object") return undefined;
	const raw = (schema as Record<string, unknown>)[DATASOURCE_SELECT_KEYWORD];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return undefined;
	}

	const { definitionIds, autoLabel } = raw as Record<string, unknown>;
	const ids = Array.isArray(definitionIds)
		? definitionIds.filter(
				(id): id is string => typeof id === "string" && id !== "",
			)
		: [];

	return {
		...(ids.length > 0 ? { definitionIds: ids } : {}),
		...(typeof autoLabel === "string" && autoLabel.trim()
			? { autoLabel }
			: {}),
	};
}

/**
 * What one pick-list option stands for.
 * - `auto`: the "leave it to the widget" option (stores `""`).
 * - `configured`: a datasource configured on this dashboard.
 * - `missing`: the stored id matches no configured datasource.
 * - `incompatible`: the stored id names a configured datasource of a type
 *   this field does not accept.
 */
export type DatasourceSelectOptionKind =
	"auto" | "configured" | "missing" | "incompatible";

/** One option of the datasource pick-list. */
export interface DatasourceSelectOption {
	/** Persisted value: the instance id, or `""` for the automatic option. */
	value: string;
	/** Primary label. */
	label: string;
	/** Datasource type name, when known. */
	typeName?: string;
	/** What the option stands for. */
	kind: DatasourceSelectOptionKind;
}

/** Result of {@link buildDatasourceSelectOptions}. */
export interface DatasourceSelectChoices {
	/** Options in display order. */
	options: DatasourceSelectOption[];
	/** Number of `configured` options, i.e. datasources actually offered. */
	configuredCount: number;
}

/**
 * Build the pick-list options for a marked property.
 *
 * Configured datasources of an accepted type come first, in configuration
 * order, deduped by instance id. A stored value that matches none of them is
 * **kept as an option** and named, so it stays selected and is never
 * silently cleared: a stale id is an operator decision, not something the
 * dialog resolves for them.
 *
 * @param datasources - Datasources configured on the dashboard.
 * @param marker - The property's pick-list marker.
 * @param currentValue - The stored value, if any.
 * @param typeName - Resolves a definition id to a display name.
 * @returns The options and how many configured datasources they offer.
 */
export function buildDatasourceSelectOptions(
	datasources: Iterable<DatasourceInstanceLike> | undefined,
	marker: DatasourceSelectMarker,
	currentValue: unknown,
	typeName: (definitionId: string) => string | undefined = () => undefined,
): DatasourceSelectChoices {
	const accepted =
		marker.definitionIds && marker.definitionIds.length > 0
			? new Set(marker.definitionIds)
			: undefined;

	const seen = new Set<string>();
	const configured: DatasourceSelectOption[] = [];
	const byId = new Map<string, DatasourceInstanceLike>();

	for (const datasource of datasources ?? []) {
		const id = datasource?.settings?.id;
		if (!id || seen.has(id)) continue;
		seen.add(id);
		byId.set(id, datasource);
		if (accepted && !accepted.has(datasource.datasource_id)) continue;

		const name = typeName(datasource.datasource_id);
		configured.push({
			value: id,
			label: datasource.settings.title || datasource.title || id,
			...(name ? { typeName: name } : {}),
			kind: "configured",
		});
	}

	const options: DatasourceSelectOption[] = [];
	if (marker.autoLabel) {
		options.push({
			value: DATASOURCE_SELECT_AUTO_VALUE,
			label: marker.autoLabel,
			kind: "auto",
		});
	}
	options.push(...configured);

	const stored = typeof currentValue === "string" ? currentValue : "";
	if (stored !== "" && !configured.some((o) => o.value === stored)) {
		const other = byId.get(stored);
		if (other) {
			const name = typeName(other.datasource_id);
			options.push({
				value: stored,
				label: `Incompatible datasource (${other.settings.title || other.title || stored})`,
				...(name ? { typeName: name } : {}),
				kind: "incompatible",
			});
		} else {
			options.push({
				value: stored,
				label: `Missing datasource (${stored})`,
				kind: "missing",
			});
		}
	}

	return { options, configuredCount: configured.length };
}
