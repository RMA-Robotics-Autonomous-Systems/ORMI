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
import { Spinner } from "@workspace/ui/components/spinner";
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
import { panelEngineDefinition } from "../components/rc-dock/panel-dashboard";

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
	/** Page-level providers (TemplatesProvider, GlobalDataSourcesProvider, WidgetsDialog, etc.). */
	children: ReactNode;
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
	children,
}) => {
	const pluginsManager = usePluginsManager() as PluginsManager;

	// Resolve plugin registries as plain statements so any hooks called inside
	// definition factories (e.g. KeyboardControlDefinition → usePluginsManager)
	// run on every render at a consistent position in the hook chain.
	// Do NOT wrap in useMemo — the memo bail-out would skip those inner hook
	// calls and cause a "change in order of Hooks" violation.
	const widgetDefinitions = pluginsManager.applyFilter<WidgetDefinition[]>(
		PluginsHooks.WIDGETS_LIST,
		[],
	);
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
				engines.push(
					gridEngineDefinition,
					flexLayoutEngineDefinition,
					panelEngineDefinition,
				);
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
				if (filteredTopics.length === 0) {
					console.warn("No topics found for the filter", {
						topics,
						filter,
					});
				}
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

	if (!initialized) {
		return (
			<div className="w-full h-full flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	return (
		<DashboardShellContextProvider value={shellValue}>
			<DashboardRegistryContextProvider value={registryValue}>
				{children}
			</DashboardRegistryContextProvider>
		</DashboardShellContextProvider>
	);
};
