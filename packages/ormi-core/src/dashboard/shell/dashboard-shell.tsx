"use client";

import React, { ReactNode, useMemo, useEffect } from "react";
import {
	PluginsManager,
	usePluginsManager,
	PluginsHooks,
} from "@workspace/ormi-plugins";
import {
	useDashboardPersistence,
	PersistenceOptions,
} from "../persistence/use-dashboard-persistence";
import { DashboardSkeleton } from "@workspace/ui/components/dashboard-skeleton";
import { ButtonHolderProvider } from "@workspace/ui/combined/ButtonHolder";
import { createSafeContext } from "@workspace/utils";
import {
	DatasourceDefinition,
	DatasourceProviderSettings,
	DatasourceTopic,
	DatasourceTopicFilter,
} from "../../datasources/datasource-interface";
import { WidgetDefinition } from "../../widgets/widget-interface";
import { LayoutEngineDefinition } from "../layout/layout-engine";
import { gridEngineDefinition } from "../components/react-grid-layout/dashboard";
import { flexLayoutEngineDefinition } from "../components/flex-layout/flex-layout-dashboard";

// ---------------------------------------------------------------------------
// Context 1 — Shell state (changes on every save / lock toggle)
// Consumers: save button, lock indicator, anything that reacts to hasChanged.
// ---------------------------------------------------------------------------

export interface DashboardShellContextValue {
	/** Active layout engine identifier (e.g. "GRID", "FLEX"). */
	dashboardType: string;
	/** True when the current state differs from the last loaded/saved snapshot. */
	hasChanged: boolean;
	/** Persist the current state. No-ops with a toast if there are no changes. */
	save: () => Promise<void>;
}

export const [DashboardShellContextProvider, useDashboardShell] =
	createSafeContext<DashboardShellContextValue>("DashboardShell");

// ---------------------------------------------------------------------------
// Context 2 — Plugin registry (stable per mount)
// Consumers: useDashboardActions, DashboardEngine, WidgetHost resolver.
// Split from shell state so definition consumers don't re-render on every
// hasChanged / save reference change.
// ---------------------------------------------------------------------------

export interface DashboardRegistryContextValue {
	/** All widget definitions resolved from the plugin registry. */
	widgetDefinitions: WidgetDefinition[];
	/** All datasource definitions resolved from the plugin registry. */
	datasourceDefinitions: DatasourceDefinition<DatasourceProviderSettings>[];
	/**
	 * All layout engine definitions resolved from the plugin registry.
	 * Includes built-in engines plus any registered by external plugins.
	 */
	engineDefinitions: LayoutEngineDefinition[];
}

export const [DashboardRegistryContextProvider, useDashboardRegistry] =
	createSafeContext<DashboardRegistryContextValue>("DashboardRegistry");

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DashboardShellProps {
	/** Active layout engine identifier (e.g. "GRID", "FLEX"). */
	dashboardType: string;
	/** Load callback from the page. Receives a setter and calls it with persisted state. */
	onLoad: PersistenceOptions["onLoad"];
	/** Save callback from the page. Receives the current state and returns success. */
	onSave: PersistenceOptions["onSave"];
	/**
	 * Set by the page while its own initial fetch (e.g. workspace metadata that
	 * resolves `dashboardType`) is still pending. The shell keeps showing the
	 * loading skeleton until this is false AND persistence has initialized, so
	 * the two fetches resolve in parallel behind a single, continuous skeleton.
	 * Defaults to false (no external pending work).
	 */
	loading?: boolean;
	/** Page-level providers (TemplatesProvider, GlobalDataSourcesProvider, WidgetsDialog, etc.). Can be ReactNode or render function. */
	children:
		| ReactNode
		| ((registry: DashboardRegistryContextValue) => ReactNode);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Dashboard shell.
 * Owns persistence lifecycle (load, save, change detection) and provides two
 * separate contexts: shell state (changes often) and plugin registry (stable
 * per mount). Place <DashboardEngine /> inside children to render the active layout.
 */
export const DashboardShell: React.FC<DashboardShellProps> = ({
	dashboardType,
	onLoad,
	onSave,
	loading = false,
	children,
}) => {
	const pluginsManager = usePluginsManager() as PluginsManager;

	// Resolve plugin registries as plain statements so any hooks called inside
	// definition factories (e.g. KeyboardControlDefinition → usePluginsManager)
	// run on every render at a consistent position in the hook chain.
	// Do NOT wrap in useMemo — the memo bail-out would skip those inner hook
	// calls and cause a "change in order of Hooks" violation.
	let widgetDefinitions = pluginsManager.applyFilter<WidgetDefinition[]>(
		PluginsHooks.WIDGETS_LIST,
		[],
	);

	// Apply extensibility hooks to allow plugins to modify definitions at registry time.
	// This decouples definition factories from hook calls while preserving plugin extensibility.
	widgetDefinitions = widgetDefinitions.map((def) => {
		if (def.extensibilityHook) {
			return def.extensibilityHook(def, pluginsManager);
		}
		return def;
	});
	const datasourceDefinitions = pluginsManager.applyFilter<
		DatasourceDefinition<DatasourceProviderSettings>[]
	>(PluginsHooks.DATASOURCES_LIST, []);
	const engineDefinitions = pluginsManager.applyFilter<
		LayoutEngineDefinition[]
	>(PluginsHooks.DASHBOARD_LAYOUTS_LIST, []);

	// Register built-in layout engines for the lifetime of the shell.
	// External plugins can register their own engines at any priority.
	useEffect(() => {
		pluginsManager.addFilter(PluginsHooks.DASHBOARD_LAYOUTS_LIST, {
			id: "ormi-core-built-in-engines",
			priority: 0,
			filter: (engines: LayoutEngineDefinition[]) => {
				engines.push(gridEngineDefinition, flexLayoutEngineDefinition);
				return engines;
			},
		});
		return () => {
			pluginsManager.removeFilter("ormi-core-built-in-engines");
		};
	}, [pluginsManager]);

	// Register the AVAILABLE_TOPICS filter for the lifetime of the dashboard.
	useEffect(() => {
		pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: "dashboard-available-topics",
			priority: Infinity,
			filter: async (
				topics: DatasourceTopic[],
				filter?: DatasourceTopicFilter,
			) => {
				if (!filter) return topics;
				const filteredTopics = topics.filter((topic) =>
					filter.filter(topic),
				);
				return filteredTopics;
			},
		});
		return () => {
			pluginsManager.removeFilter("dashboard-available-topics");
		};
	}, [pluginsManager]);

	const { initialized, hasChanged, save } = useDashboardPersistence({
		onLoad,
		onSave,
	});

	// Shell state changes on every save/lock toggle — kept in its own context
	// so registry consumers are not forced to re-render.
	const shellValue = useMemo<DashboardShellContextValue>(
		() => ({ dashboardType, hasChanged, save }),
		[dashboardType, hasChanged, save],
	);

	// Registry value: new arrays every render (applyFilter cannot be memoized —
	// see comment above). A separate context still prevents shell-state changes
	// from reaching registry-only consumers and vice-versa.
	const registryValue: DashboardRegistryContextValue = {
		widgetDefinitions,
		datasourceDefinitions,
		engineDefinitions,
	};

	// One continuous skeleton until everything needed to render the dashboard is
	// ready: the page's initial fetch has settled AND persistence has loaded.
	// Persistence loading runs while `loading` is still true, so the two waits
	// overlap instead of stacking.
	if (loading || !initialized) {
		return <DashboardSkeleton />;
	}

	return (
		<DashboardShellContextProvider value={shellValue}>
			<DashboardRegistryContextProvider value={registryValue}>
				{/* Single ButtonHolder registry above both layout engines and
				    all widget hosts — the source of truth for contributed
				    toolbar buttons, keyed by widget id. */}
				<ButtonHolderProvider>
					{typeof children === "function"
						? children(registryValue)
						: children}
				</ButtonHolderProvider>
			</DashboardRegistryContextProvider>
		</DashboardShellContextProvider>
	);
};
