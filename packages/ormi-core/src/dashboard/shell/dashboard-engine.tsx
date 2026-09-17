"use client";

import React from "react";
import { useDashboardShell, useDashboardRegistry } from "./dashboard-shell";
import { LayoutEngineDefinition } from "../layout/layout-engine";
import { DashboardLauncher } from "../components/launcher/dashboard-launcher";

/**
 * Resolves the active layout engine from the plugin registry and renders it,
 * with the dashboard launcher floating over it.
 *
 * Must be placed inside a DashboardShell — and inside any providers the engine
 * needs (e.g. GlobalDataSourcesProvider, TemplatesProvider).
 * Engine definitions are consumed from the DashboardRegistry context, which is
 * populated by the shell — no second applyFilter call is needed here.
 *
 * The launcher is mounted here rather than inside each engine so every engine
 * gets it, including one registered by a plugin: it is a property of the
 * dashboard surface, not of any one layout algorithm. This wrapper is the
 * positioned ancestor the launcher anchors to, which is why it is `relative`;
 * the engine keeps the whole of the width and owns its own height, exactly as
 * it did before.
 */
export const DashboardEngine: React.FC = () => {
	const { dashboardType } = useDashboardShell();
	const { engineDefinitions } = useDashboardRegistry();

	const engine: LayoutEngineDefinition | undefined = engineDefinitions.find(
		(e) => e.id === dashboardType,
	);
	const Engine = engine?.Component;

	return (
		<div className="relative h-full min-h-0 w-full">
			{Engine ? (
				<Engine />
			) : (
				<div className="text-muted-foreground flex h-full w-full items-center justify-center">
					Unknown dashboard type: {dashboardType}
				</div>
			)}
			<DashboardLauncher />
		</div>
	);
};
