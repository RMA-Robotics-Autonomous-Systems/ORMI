"use client";

import React from "react";
import {
	PluginsManager,
	usePluginsManager,
	PluginsHooks,
} from "@workspace/ormi-plugins";
import { useDashboardShell } from "./dashboard-shell";
import { LayoutEngineDefinition } from "../layout/layout-engine";

/**
 * Resolves the active layout engine from the plugin registry and renders it.
 * Must be placed inside a DashboardShell — and inside any providers the engine
 * needs (e.g. GlobalDataSourcesProvider).
 */
export const DashboardEngine: React.FC = () => {
	const { dashboardType } = useDashboardShell();
	const pluginsManager = usePluginsManager() as PluginsManager;

	const engines = pluginsManager.applyFilter<LayoutEngineDefinition[]>(
		PluginsHooks.DASHBOARD_LAYOUTS_LIST,
		[],
	);

	const engine = engines.find((e) => e.id === dashboardType);

	if (!engine) {
		return (
			<div className="w-full h-full flex items-center justify-center text-muted-foreground">
				Unknown dashboard type: {dashboardType}
			</div>
		);
	}

	const Engine = engine.Component;
	return <Engine />;
};
