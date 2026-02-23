"use client";

import React, { ReactNode, useEffect } from "react";
import {
	PluginsManager,
	usePluginsManager,
	PluginsHooks,
} from "@workspace/ormi-plugins";
import {
	useDashboardPersistence,
	PersistenceOptions,
} from "../persistence/use-dashboard-persistence";
import { DashboardInterface } from "../dashboard-interface";
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
// Shell context — minimal surface shared with DashboardEngine
// ---------------------------------------------------------------------------

export interface DashboardShellContextValue {
	dashboardType: string;
	hasChanged: boolean;
	save: () => Promise<void>;
	/** All widget definitions resolved from the plugin registry (stable per mount). */
	widgetDefinitions: WidgetDefinition[];
	/** All datasource definitions resolved from the plugin registry (stable per mount). */
	datasourceDefinitions: DatasourceDefinition<DatasourceProviderSettings>[];
}

export const [DashboardShellContextProvider, useDashboardShell] =
	createSafeContext<DashboardShellContextValue>("DashboardShell");

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DashboardShellProps {
	/** Active layout engine identifier (e.g. "GRID", "FLEX"). */
	dashboardType: string;
	/** Empty initial state — persistence hook populates it from onLoad. */
	dashboardDefinition: DashboardInterface;
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
 * Owns persistence lifecycle (load, save, change detection).
 * Renders a spinner until the initial load resolves, then renders children.
 * Does not render the layout engine — place <DashboardEngine /> inside children.
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

	// Register built-in layout engines
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

	// Register the AVAILABLE_TOPICS filter for the lifetime of the dashboard
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

	const shellValue: DashboardShellContextValue = {
		dashboardType,
		hasChanged,
		save,
		widgetDefinitions,
		datasourceDefinitions,
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
			{children}
		</DashboardShellContextProvider>
	);
};
