import type {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "./datasource-interface";

/**
 * Title a datasource instance carries from the moment it is added until the
 * operator gives it one of their own.
 *
 * Exported so the add path and the "has this been configured yet?" predicate
 * read the same constant instead of two literals that can drift apart.
 */
export const NEW_DATASOURCE_TITLE = "New Datasource";

/**
 * Settings key excluded from the pristine comparison.
 *
 * `id` is a per-instance uuid minted by the add path, so it differs from the
 * definition's default for every instance that has ever existed. Comparing it
 * would make every datasource look configured the instant it is added.
 */
const IGNORED_SETTINGS_KEYS = new Set(["id"]);

/**
 * Structural equality for JSON-shaped setting values.
 *
 * Datasource settings are plain JSON (JSON Forms writes them), so this covers
 * primitives, arrays and plain objects and nothing else.
 *
 * @param a - Left value.
 * @param b - Right value.
 * @returns True when both values are structurally equal.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;

	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	) {
		return false;
	}

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		return a.every((value, index) => deepEqual(value, b[index]));
	}

	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const leftKeys = Object.keys(left);

	if (leftKeys.length !== Object.keys(right).length) return false;

	return leftKeys.every(
		(key) =>
			Object.prototype.hasOwnProperty.call(right, key) &&
			deepEqual(left[key], right[key]),
	);
}

/**
 * Settings a datasource instance carries before anyone has touched it: the
 * definition's `data` defaults, with the placeholder title the add path seeds.
 *
 * The definition object is registry-shared and is only ever read here — the
 * returned object is a fresh shallow copy.
 *
 * @param definition - Datasource definition to read defaults from.
 * @returns A fresh pristine settings object.
 */
function pristineSettings<T extends DatasourceProviderSettings>(
	definition: DatasourceDefinition<T>,
): Record<string, unknown> {
	return {
		...definition.data,
		title: NEW_DATASOURCE_TITLE,
	} as unknown as Record<string, unknown>;
}

/**
 * Report whether a datasource instance has been configured by the operator.
 *
 * "Configured" means structurally: the instance's settings no longer equal the
 * definition's `data` defaults. That is what the pulse on the datasource card
 * actually wants to know, and it subsumes the rename case — a renamed
 * datasource differs from the defaults, so it reads as configured.
 *
 * Comparison rules:
 * - `id` is excluded (see {@link IGNORED_SETTINGS_KEYS}).
 * - `title` is compared against {@link NEW_DATASOURCE_TITLE}, not against
 *   `definition.data.title`. Definitions ship an empty placeholder title and
 *   the add path overwrites it with the placeholder above, so comparing
 *   against the definition would never match and the card would never pulse.
 * - Keys present on one side only count as a difference, so a settings blob
 *   that predates a definition gaining a field reads as configured rather than
 *   nagging an operator who already set it up.
 *
 * Pure function — safe to call during render, and unit-testable in isolation.
 *
 * @param settings - The instance's persisted settings, if any.
 * @param definition - The definition the instance was created from.
 * @returns True when the settings differ from the pristine defaults.
 */
export function isDatasourceConfigured<T extends DatasourceProviderSettings>(
	settings: T | undefined,
	definition: DatasourceDefinition<T>,
): boolean {
	if (!settings) return false;

	const pristine = pristineSettings(definition);
	const current = settings as unknown as Record<string, unknown>;

	const keys = new Set([...Object.keys(pristine), ...Object.keys(current)]);

	for (const key of keys) {
		if (IGNORED_SETTINGS_KEYS.has(key)) continue;
		if (!deepEqual(current[key], pristine[key])) return true;
	}

	return false;
}
