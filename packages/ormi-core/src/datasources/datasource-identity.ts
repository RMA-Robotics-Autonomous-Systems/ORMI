import type {
	Datasource,
	DatasourceProviderSettings,
} from "./datasource-interface";

/**
 * Identity and grouping for datasource configurations an operator has already
 * set up somewhere else.
 *
 * Deliberately React-free, icon-free and barrel-free: this module is imported
 * by a **server route** (`GET /api/datasources/known`) through its own
 * `@workspace/ormi-core/datasources/identity` subpath. Importing the
 * datasources barrel here would drag the dashboard barrel — and
 * `react-grid-layout/css/styles.css` with it — into a server bundle, which is
 * the same hazard class as the worker-entrypoint rule.
 *
 * Not to be confused with `datasource-configured.ts`, which answers a
 * different question ("has anybody touched this instance yet?") and therefore
 * carries its own comparison and its own ignored-key set. The two are kept
 * apart on purpose: one compares an instance against its definition's
 * defaults, this one compares two instances against each other.
 */

/**
 * The fields {@link DatasourceProviderSettings} contributes to every
 * datasource, whatever plugin declared it.
 *
 * Written as an exhaustive mapped type rather than a literal list so a future
 * base field cannot be forgotten here: adding one to the interface breaks this
 * object until it is named, and it is then excluded from configuration
 * identity automatically.
 */
const BASE_SETTINGS_FIELDS: {
	[K in keyof DatasourceProviderSettings]-?: true;
} = {
	id: true,
	title: true,
	enable: true,
};

/**
 * Settings keys excluded from a configuration's identity.
 *
 * Identity is **what the plugin declared**, never what core provides: `id` is
 * a per-instance uuid, `title` is the operator's own label (two workspaces
 * naming the same robot differently are still the same robot), and `enable` is
 * a per-dashboard switch. Everything else — the endpoint, the credentials, the
 * per-plugin options — is the configuration.
 */
export const DATASOURCE_IDENTITY_IGNORED_KEYS: ReadonlySet<string> = new Set(
	Object.keys(BASE_SETTINGS_FIELDS),
);

/**
 * A datasource configuration found in the operator's other workspaces,
 * collapsed across every instance of it.
 */
export interface KnownDatasourceConfig {
	/** Stable identity of this configuration. See {@link datasourceConfigKey}. */
	key: string;
	/** Points to the datasource definition id. */
	datasource_id: string;
	/**
	 * Seed-ready settings: `id` reset to `""` (the add path mints the real
	 * one), `enable` forced true, `title` set to {@link KnownDatasourceConfig.title}.
	 */
	settings: DatasourceProviderSettings;
	/** Title from the most recently updated workspace that carries this config. */
	title: string;
	/** Every other title this configuration goes by, newest first, deduped. */
	alternateTitles: string[];
	/** How many distinct workspaces carry this configuration. */
	workspaceCount: number;
	/** Those workspaces' names, newest first. */
	workspaceNames: string[];
	/** Max `updatedAT` across those workspaces, ISO 8601. */
	lastUsedAt: string;
}

/** A workspace row, narrowed to what grouping reads. */
export interface KnownDatasourceWorkspaceRow {
	id: number;
	name: string;
	updatedAT: Date | string;
	content: unknown;
}

/**
 * Recursively canonicalise a JSON value: object keys sorted, arrays left
 * alone, `undefined` treated as an absent key.
 *
 * Arrays are **never** sorted — order is significant in a settings blob (a
 * list of topics, a list of layers), so reordering one produces a different
 * configuration. Over-splitting is visible to the operator and harmless;
 * over-merging would offer them the wrong configuration.
 *
 * @param value - Any JSON-shaped value.
 * @returns A structurally equivalent value with deterministic key order.
 */
function canonicalise(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalise(entry));
	}

	if (value !== null && typeof value === "object") {
		const source = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(source).sort()) {
			const entry = source[key];
			if (entry === undefined) continue;
			out[key] = canonicalise(entry);
		}
		return out;
	}

	return value;
}

/**
 * Canonical JSON for a settings blob, with the
 * {@link DATASOURCE_IDENTITY_IGNORED_KEYS} removed.
 *
 * Total over garbage: a non-object is treated as empty settings.
 *
 * @param settings - The instance's persisted settings.
 * @returns Deterministic JSON string for identity comparison.
 */
export function canonicalSettingsJson(
	settings: DatasourceProviderSettings | undefined | null,
): string {
	if (settings === null || typeof settings !== "object") return "{}";

	const source = settings as unknown as Record<string, unknown>;
	const out: Record<string, unknown> = {};

	for (const key of Object.keys(source).sort()) {
		if (DATASOURCE_IDENTITY_IGNORED_KEYS.has(key)) continue;
		const entry = source[key];
		if (entry === undefined) continue;
		out[key] = canonicalise(entry);
	}

	return JSON.stringify(out);
}

/**
 * Identity of a datasource **configuration**: its definition id plus the
 * canonical form of everything the plugin declared.
 *
 * Two instances share a key when they connect to the same thing the same way,
 * however they are named and whichever workspace they live in.
 *
 * @param datasource - A datasource instance, from a workspace or from live state.
 * @returns A stable identity string.
 */
export function datasourceConfigKey(datasource: Datasource): string {
	const datasourceId =
		typeof datasource?.datasource_id === "string"
			? datasource.datasource_id
			: "";
	// NUL separates the two halves so no definition id can be confused with
	// the start of the settings JSON.
	return `${datasourceId}\u0000${canonicalSettingsJson(datasource?.settings)}`;
}

/**
 * Deep copy of a JSON-shaped value, so a payload never aliases stored state.
 *
 * @param value - Value to copy.
 * @returns A structurally equal, independent value.
 */
function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Read the datasource instances out of a workspace's persisted `content`.
 *
 * Total over garbage — `content` outlives the build that wrote it, and one
 * malformed legacy row must never break the whole endpoint for that operator.
 *
 * @param content - A workspace's persisted `content` column, whatever it holds.
 * @returns Every entry that is recognisably a datasource instance.
 */
function readDatasources(content: unknown): Datasource[] {
	if (content === null || typeof content !== "object") return [];
	if (Array.isArray(content)) return [];

	const datasources = (content as Record<string, unknown>).datasources;
	if (datasources === null || typeof datasources !== "object") return [];
	if (Array.isArray(datasources)) return [];

	const out: Datasource[] = [];
	for (const entry of Object.values(datasources as Record<string, unknown>)) {
		if (entry === null || typeof entry !== "object") continue;
		if (Array.isArray(entry)) continue;

		const candidate = entry as Record<string, unknown>;
		if (typeof candidate.datasource_id !== "string") continue;
		if (candidate.datasource_id.length === 0) continue;

		const settings = candidate.settings;
		if (
			settings === null ||
			typeof settings !== "object" ||
			Array.isArray(settings)
		) {
			continue;
		}

		out.push(candidate as unknown as Datasource);
	}

	return out;
}

/**
 * Timestamp of a workspace row, as a number.
 *
 * @param updatedAT - The row's `updatedAT`, a `Date` from Prisma or a string
 * once it has been through JSON.
 * @returns Milliseconds since the epoch, `0` when unreadable.
 */
function timestampOf(updatedAT: Date | string): number {
	const value =
		updatedAT instanceof Date
			? updatedAT.getTime()
			: new Date(updatedAT).getTime();
	return Number.isFinite(value) ? value : 0;
}

/**
 * The title an instance goes by.
 *
 * `settings.title` is authoritative — `updateDatasource` writes the operator's
 * rename there and mirrors it onto the instance — with the mirrored copy as a
 * fallback and the definition id as the last resort, because a row with no
 * label at all cannot be told apart from another.
 *
 * @param datasource - A datasource instance.
 * @returns A non-empty display title.
 */
function titleOf(datasource: Datasource): string {
	const fromSettings = datasource.settings?.title;
	if (typeof fromSettings === "string" && fromSettings.trim().length > 0) {
		return fromSettings;
	}

	if (
		typeof datasource.title === "string" &&
		datasource.title.trim().length > 0
	) {
		return datasource.title;
	}

	return datasource.datasource_id;
}

/** Accumulator for one configuration while rows are walked. */
interface Grouping {
	key: string;
	datasource_id: string;
	settings: DatasourceProviderSettings;
	titles: string[];
	workspaceIds: Set<number>;
	workspaceNames: string[];
	lastUsedAt: number;
}

/**
 * Collapse every datasource instance across a user's workspaces into one row
 * per **configuration**.
 *
 * Grouping is by configuration only: the same endpoint titled differently in
 * two workspaces is one row, whose primary title comes from the most recently
 * updated workspace and whose other titles are reported as alternates. Two
 * different configurations that happen to share a title stay two rows —
 * grouping by name would merge things that connect to different robots.
 *
 * Total over garbage by construction: a row whose `content` is null, an array,
 * missing `datasources`, or holds entries with no `settings` simply
 * contributes nothing. Nothing in here throws.
 *
 * @param rows - Workspace rows, in any order.
 * @returns Configurations, most recently used first.
 */
export function groupKnownDatasources(
	rows: ReadonlyArray<KnownDatasourceWorkspaceRow>,
): KnownDatasourceConfig[] {
	const groups = new Map<string, Grouping>();

	// Newest first, so the first instance seen for a key is the one whose
	// title, settings and timestamp win; everything after it is an alternate.
	const ordered = rows
		.map((row, index) => ({ row, index, at: timestampOf(row.updatedAT) }))
		.sort((a, b) => b.at - a.at || a.index - b.index);

	for (const { row, at } of ordered) {
		for (const datasource of readDatasources(row.content)) {
			const key = datasourceConfigKey(datasource);
			const title = titleOf(datasource);

			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					datasource_id: datasource.datasource_id,
					settings: cloneJson(datasource.settings),
					titles: [],
					workspaceIds: new Set<number>(),
					workspaceNames: [],
					lastUsedAt: at,
				};
				groups.set(key, group);
			}

			if (!group.titles.includes(title)) group.titles.push(title);

			if (!group.workspaceIds.has(row.id)) {
				group.workspaceIds.add(row.id);
				group.workspaceNames.push(row.name);
			}
		}
	}

	return [...groups.values()]
		.map((group) => {
			const [primary = group.datasource_id, ...alternates] = group.titles;

			return {
				key: group.key,
				datasource_id: group.datasource_id,
				settings: {
					...group.settings,
					// The add path mints the real instance id; an inherited one
					// would collide with the instance it was copied from.
					id: "",
					enable: true,
					title: primary,
				},
				title: primary,
				alternateTitles: alternates,
				workspaceCount: group.workspaceIds.size,
				workspaceNames: group.workspaceNames,
				lastUsedAt: new Date(group.lastUsedAt).toISOString(),
			} satisfies KnownDatasourceConfig;
		})
		.sort(
			(a, b) =>
				new Date(b.lastUsedAt).getTime() -
				new Date(a.lastUsedAt).getTime(),
		);
}
