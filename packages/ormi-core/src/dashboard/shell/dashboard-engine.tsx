"use client";

import React from "react";
import { useDashboardShell, useDashboardRegistry } from "./dashboard-shell";
import { LayoutEngineDefinition } from "../layout/layout-engine";

/**
 * Resolves the active layout engine from the plugin registry and renders it.
 * Must be placed inside a DashboardShell — and inside any providers the engine
 * needs (e.g. GlobalDataSourcesProvider).
 * Engine definitions are consumed from the DashboardRegistry context, which is
 * populated by the shell — no second applyFilter call is needed here.
 */
export const DashboardEngine: React.FC = () => {
	const { dashboardType } = useDashboardShell();
	const { engineDefinitions } = useDashboardRegistry();

	const engine: LayoutEngineDefinition | undefined = engineDefinitions.find(
		(e) => e.id === dashboardType,
	);

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
