"use client";

import { useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { CheckIcon, PlusIcon } from "lucide-react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";

import { datasourcesAtom } from "../../dashboard/atoms";
import { addDatasource as addDatasourceToState } from "../../dashboard/state/actions";
import {
	datasourceConfigKey,
	type KnownDatasourceConfig,
} from "../datasource-identity";
import type {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasource-interface";

/** How many workspace names a row spells out before it counts the rest. */
const WORKSPACE_NAME_LIMIT = 3;

/** Separator between the values of a multi-key summary. */
const SUMMARY_SEPARATOR = " · ";

/**
 * The values a row may show out of a stored settings blob.
 *
 * Reads **only** the keys the definition declares in
 * {@link DatasourceDefinition.summaryProps}, in that order. There is no
 * fallback and no heuristic: a settings blob carries credentials, so guessing
 * which of its fields are safe to display fails silently as a leak rather than
 * loudly as an error. A definition that declares nothing shows nothing.
 *
 * A declared key whose value is not a `string` or `number` is skipped — a
 * booleans-and-objects summary tells the operator nothing and `[object Object]`
 * is worse than a blank line. So is a key the stored settings do not carry (a
 * configuration older than the field) and a string that is empty or only
 * whitespace (an unset url must render nothing, never an empty line).
 *
 * Values come back verbatim; shortening one is the view's job, because only the
 * view knows how much room it has.
 *
 * @param settings - The stored settings of one configuration.
 * @param definition - The definition that can honour it.
 * @returns The displayable values, in declaration order; empty when there are none.
 */
export function resolveDatasourceSummary(
	settings: DatasourceProviderSettings,
	definition: DatasourceDefinition,
): string[] {
	const keys = definition.summaryProps;
	if (!keys || keys.length === 0) return [];

	const blob = settings as unknown as Record<string, unknown>;
	const values: string[] = [];

	for (const key of keys) {
		const value = blob[key];

		if (typeof value === "number") {
			if (!Number.isFinite(value)) continue;
			values.push(String(value));
			continue;
		}

		if (typeof value !== "string") continue;
		if (value.trim() === "") continue;
		values.push(value);
	}

	return values;
}

/** Props for {@link KnownDatasourceList}. */
export interface KnownDatasourceListProps {
	/** Configurations found in the operator's other workspaces. */
	configs: ReadonlyArray<KnownDatasourceConfig>;
	/** Datasource definitions this build actually carries. */
	definitions: ReadonlyArray<DatasourceDefinition>;
	/** Configuration keys already present in this dashboard's live state. */
	presentKeys: ReadonlySet<string>;
	/** Adds the configuration to this dashboard. */
	onAdd: (config: KnownDatasourceConfig) => void;
}

/** One configuration paired with the definition that can honour it. */
interface ResolvedRow {
	config: KnownDatasourceConfig;
	definition: DatasourceDefinition;
	present: boolean;
}

/** A definition and the configurations offered under it. */
interface DefinitionGroup {
	definition: DatasourceDefinition;
	rows: ResolvedRow[];
	lastUsedAt: number;
}

/**
 * Render the last-used date of a configuration.
 *
 * @param iso - ISO 8601 timestamp.
 * @returns A short human date, or an empty string when unreadable.
 */
function formatLastUsed(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * Spell out where a configuration is in use, capped.
 *
 * @param names - Workspace names, newest first.
 * @returns A comma-separated list, with a count standing in for the tail.
 */
function formatWorkspaceNames(names: ReadonlyArray<string>): string {
	if (names.length === 0) return "";
	const shown = names.slice(0, WORKSPACE_NAME_LIMIT);
	const hidden = names.length - shown.length;
	return hidden > 0 ? `${shown.join(", ")} +${hidden}` : shown.join(", ");
}

/**
 * The datasource configurations an operator already set up in their other
 * dashboards, grouped under the definition that can honour them.
 *
 * Presentational and pure — every input is a prop, so what it renders can be
 * asserted without a dashboard around it.
 *
 * Two behaviours are load-bearing.
 *
 * **A configuration whose definition this build does not carry is silently
 * omitted.** That is deliberately the opposite of the stale-stored-
 * configuration rule, which governs *restoring* committed work and names what
 * it cannot honour. This surface only *proposes*: offering a row that can only
 * resolve to an unsupported card manufactures a broken panel out of a clean
 * click. The filter has to be here rather than on the server — the datasource
 * registry is a client-side plugin registry, and dev-only plugins are gated
 * out of it at registry generation.
 *
 * **Nothing out of the settings blob is rendered unless the definition asked
 * for it by name.** Datasource settings carry credentials (a mission-control
 * bearer token, today), so a free-form summary — or any denylist or name
 * heuristic over the keys — would leak one the day a plugin names a field in a
 * way nobody anticipated. The only values that reach the DOM are those listed
 * in {@link DatasourceDefinition.summaryProps}, an allowlist declared by the
 * plugin that owns the schema; see {@link resolveDatasourceSummary}. A
 * definition that declares nothing shows nothing, which is the whole point.
 *
 * @param props - Component props.
 * @returns React element, or `null` when nothing is offerable.
 */
export function KnownDatasourceList(props: KnownDatasourceListProps) {
	const { configs, definitions, presentKeys, onAdd } = props;

	const groups = useMemo<DefinitionGroup[]>(() => {
		const byDefinition = new Map<string, DefinitionGroup>();

		for (const config of configs) {
			const definition = definitions.find(
				(candidate) => candidate.id === config.datasource_id,
			);
			if (!definition) continue;

			let group = byDefinition.get(definition.id);
			if (!group) {
				group = { definition, rows: [], lastUsedAt: 0 };
				byDefinition.set(definition.id, group);
			}

			group.rows.push({
				config,
				definition,
				present: presentKeys.has(config.key),
			});
			group.lastUsedAt = Math.max(
				group.lastUsedAt,
				new Date(config.lastUsedAt).getTime() || 0,
			);
		}

		for (const group of byDefinition.values()) {
			// Actionable rows first: a row the operator cannot click is
			// information, not an offer, so it must not sit above one.
			group.rows.sort((a, b) => {
				if (a.present !== b.present) return a.present ? 1 : -1;
				return (
					(new Date(b.config.lastUsedAt).getTime() || 0) -
					(new Date(a.config.lastUsedAt).getTime() || 0)
				);
			});
		}

		return [...byDefinition.values()].sort(
			(a, b) => b.lastUsedAt - a.lastUsedAt,
		);
	}, [configs, definitions, presentKeys]);

	if (groups.length === 0) return null;

	return (
		<section
			aria-labelledby="known-datasources-heading"
			className="flex flex-col gap-2"
		>
			<div>
				<h4
					id="known-datasources-heading"
					className="text-sm font-medium"
				>
					From your other dashboards
				</h4>
				<p className="text-muted-foreground text-xs">
					Reuse a datasource you have already configured, instead of
					setting it up again.
				</p>
			</div>

			{groups.map((group) => (
				<div key={group.definition.id} className="flex flex-col gap-1">
					<p className="text-muted-foreground text-xs font-medium">
						{group.definition.name}
					</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{group.rows.map((row) => (
							<KnownDatasourceRow
								key={row.config.key}
								row={row}
								onAdd={onAdd}
							/>
						))}
					</div>
				</div>
			))}
		</section>
	);
}

/** Props for {@link KnownDatasourceRow}. */
interface KnownDatasourceRowProps {
	row: ResolvedRow;
	onAdd: (config: KnownDatasourceConfig) => void;
}

/**
 * One offered configuration.
 *
 * A configuration this dashboard already carries is **marked, never hidden**:
 * "it is already here" and "nothing like it exists" are different answers, and
 * silently dropping the row reads as the configuration having been lost.
 *
 * @param props - Component props.
 * @returns React element.
 */
function KnownDatasourceRow(props: KnownDatasourceRowProps) {
	const { config, definition, present } = props.row;

	const lastUsed = formatLastUsed(config.lastUsedAt);
	const usage = `in ${config.workspaceCount} ${
		config.workspaceCount === 1 ? "dashboard" : "dashboards"
	}${lastUsed ? ` · last used ${lastUsed}` : ""}`;
	const where = formatWorkspaceNames(config.workspaceNames);
	// Which remote this is. It identifies the configuration, so it sits
	// directly under the title rather than among the usage lines.
	const summary = resolveDatasourceSummary(config.settings, definition).join(
		SUMMARY_SEPARATOR,
	);
	// An `aria-label` replaces the button's contents, so the remote has to be
	// repeated here or the one thing that tells two rows apart is exactly what
	// a screen reader never reads.
	const label = `${config.title} (${definition.name}${
		summary ? `, ${summary}` : ""
	})`;

	return (
		<Button
			variant="outline"
			disabled={present}
			aria-label={
				present
					? `${label} is already in this dashboard`
					: `Add ${label} from your other dashboards`
			}
			className="h-auto w-full justify-start gap-3 py-3 text-left whitespace-normal"
			onClick={() => props.onAdd(config)}
		>
			{present ? (
				<CheckIcon className="size-4 shrink-0" aria-hidden />
			) : (
				<PlusIcon className="size-4 shrink-0" aria-hidden />
			)}
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{config.title}</span>
					{present ? (
						<Badge variant="secondary">
							Already in this dashboard
						</Badge>
					) : null}
				</span>
				{summary ? (
					<span
						className="text-muted-foreground truncate text-xs font-normal"
						title={summary}
					>
						{summary}
					</span>
				) : null}
				{config.alternateTitles.length > 0 ? (
					<span className="text-muted-foreground text-xs font-normal">
						also: {config.alternateTitles.join(", ")}
					</span>
				) : null}
				<span className="text-muted-foreground text-xs font-normal">
					{usage}
				</span>
				{where ? (
					<span className="text-muted-foreground text-xs font-normal">
						{where}
					</span>
				) : null}
			</span>
		</Button>
	);
}

/** Props for {@link KnownDatasourceSection}. */
export interface KnownDatasourceSectionProps {
	configs: ReadonlyArray<KnownDatasourceConfig>;
	definitions: ReadonlyArray<DatasourceDefinition>;
}

/**
 * Add a configuration to the dashboard, through the same reducer
 * `useDashboardActions().addDatasource` calls.
 *
 * The reducer is reached directly rather than through that hook on purpose:
 * the hook resolves its definitions from `useDashboardRegistry`, which lives
 * in `dashboard-shell`, and the shell already reaches this picker — importing
 * it back would close a module cycle. The definitions the reducer validates
 * against are the ones the picker already applied `DATASOURCES_LIST` for, so
 * nothing is lost by passing them in.
 *
 * @param datasources - Current instances.
 * @param config - The configuration to seed from.
 * @param definitions - Definitions this build carries.
 * @returns The next instance map.
 */
function seedFromConfig(
	datasources: Map<string, Datasource>,
	config: KnownDatasourceConfig,
	definitions: ReadonlyArray<DatasourceDefinition>,
): Map<string, Datasource> {
	return addDatasourceToState(
		datasources,
		config.datasource_id,
		definitions as DatasourceDefinition[],
		// Copied, so the new instance's settings never alias the offered row —
		// which is still on screen and still offers the same configuration to
		// another click.
		JSON.parse(JSON.stringify(config.settings)) as typeof config.settings,
	);
}

/**
 * {@link KnownDatasourceList} wired to the live dashboard.
 *
 * Kept as its own component, rendered only once there is something to offer,
 * so the adder itself takes on no dashboard-state dependency on a surface that
 * mounts no `KnownDatasourcesProvider`.
 *
 * "Already in this dashboard" is decided against **live** state, not against
 * the saved copy: an operator who just added a datasource has not saved yet,
 * and offering it to them again is how they end up with two.
 *
 * @param props - Component props.
 * @returns React element.
 */
export function KnownDatasourceSection(props: KnownDatasourceSectionProps) {
	const datasources = useAtomValue(datasourcesAtom);
	const setDatasources = useSetAtom(datasourcesAtom);

	const presentKeys = useMemo(() => {
		const keys = new Set<string>();
		for (const datasource of datasources.values()) {
			keys.add(datasourceConfigKey(datasource));
		}
		return keys;
	}, [datasources]);

	return (
		<KnownDatasourceList
			configs={props.configs}
			definitions={props.definitions}
			presentKeys={presentKeys}
			onAdd={(config) =>
				setDatasources((prev) =>
					seedFromConfig(prev, config, props.definitions),
				)
			}
		/>
	);
}
