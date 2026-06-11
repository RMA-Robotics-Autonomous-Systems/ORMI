"use client";

/**
 * Load available datasources and render their providers.
 */

import React, { useState, useEffect } from "react";
import {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
	DatasourceStatus,
} from "../datasource-interface";
import { useDashboardActions } from "../../dashboard";
import { useAtomValue } from "jotai";
import { datasourcesAtom } from "../../dashboard";
import { reconcileTransformSources } from "../../transforms";

import {
	PluginsHooks,
	PluginsManager,
	usePluginsManager,
} from "@workspace/ormi-plugins";
import { NavbarItem } from "@workspace/ui/combined/navbar";

import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogClose,
} from "@workspace/ui/components/dialog";

import { WidgetDefinition } from "../../widgets/widget-interface";
import DatasourceAdder from "./datasource-adder";
import DatasourceCard from "./datasource-card";
import { DatasourceStatusBadges } from "./datasource-status-badges";
import { CheckIcon, CloudCogIcon, XCircle } from "lucide-react";
import { Template, useTemplates } from "../../templates";
import { createSafeContext } from "@workspace/utils";

/** Global datasource context value — exposed for external consumers. */
interface GlobalDataSources {
	/** Per-datasource connection status: connecting, ready, error, disposed. */
	datasourceStatuses: Map<string, DatasourceStatus>;
	/** Set of datasource instance IDs that are currently ready. */
	readyDatasources: Set<string>;
	/** True when all configured datasources are ready (or no datasources configured). */
	allDatasourcesReady: boolean;
}

const [GlobalDataSourcesContextProvider, useGlobalDataSourcesContext] =
	createSafeContext<GlobalDataSources>("GlobalDataSources");

/**
 * Global datasource provider wiring datasource providers and navbar UI.
 * @param props - Component props.
 * @returns React element.
 */
const GlobalDataSourcesProvider = (props: { children: React.ReactNode }) => {
	const { children } = props;

	const datasources = useAtomValue(datasourcesAtom);
	const { updateDatasource, addDatasource, removeDatasource } =
		useDashboardActions();

	const [dataSourcesTypes, setDataSourcesTypes] = useState<
		Map<string, DatasourceDefinition<DatasourceProviderSettings>>
	>(new Map());

	const pluginsManager = usePluginsManager() as PluginsManager;

	const [dataLoaded, setDataLoaded] = useState(false);
	const [initialized, setInitialized] = useState(false);
	const [readyDatasources, setReadyDatasources] = useState<Set<string>>(
		new Set(),
	);
	const [datasourceStatuses, setDatasourceStatuses] = useState<
		Map<string, DatasourceStatus>
	>(new Map());

	const { addTemplate } = useTemplates();

	function getDatasourceDef(
		datasource_id: string,
	): DatasourceDefinition<DatasourceProviderSettings> {
		if (!dataSourcesTypes.has(datasource_id)) {
			console.error(`Datasource ${datasource_id} not found`);
			throw new Error(`Datasource ${datasource_id} not found`);
		}
		return dataSourcesTypes.get(datasource_id)!;
	}

	function handleAdd(datasource_id: string) {
		addDatasource(datasource_id);
	}

	function handleRemove(source_id: string) {
		removeDatasource(source_id);
	}

	useEffect(() => {
		const dataSourcesTypes_array = pluginsManager.applyFilter<
			DatasourceDefinition<DatasourceProviderSettings>[]
		>(PluginsHooks.DATASOURCES_LIST, []);
		const dataSourcesTypes_map = new Map<
			string,
			DatasourceDefinition<DatasourceProviderSettings>
		>();
		for (const dataSource of dataSourcesTypes_array) {
			dataSourcesTypes_map.set(dataSource.id, dataSource);
		}
		setDataSourcesTypes(dataSourcesTypes_map);
		setDataLoaded(true);
	}, [pluginsManager]);

	useEffect(() => {
		setInitialized(dataLoaded === true);
	}, [dataLoaded]);

	// Initialize datasources as connecting when they're added
	useEffect(() => {
		setDatasourceStatuses((prev) => {
			let changed = false;
			const next = new Map(prev);
			datasources.forEach((ds) => {
				if (!next.has(ds.settings.id)) {
					next.set(ds.settings.id, "connecting");
					changed = true;
				}
			});
			// Remove statuses for deleted datasources
			next.forEach((_, id) => {
				if (
					!Array.from(datasources.values()).some(
						(ds) => ds.settings.id === id,
					)
				) {
					next.delete(id);
					changed = true;
				}
			});
			return changed ? next : prev;
		});
	}, [datasources]);

	// Automatic TF disposal: drop transforms for any datasource that is no longer configured
	// (dashboard switch, datasource removed) — including its static frames, so they don't leak
	// or collide with a later datasource reusing the same frame names. Datasource plugins do not
	// clear their own transforms; this is the single, core-owned cleanup path. A transiently
	// disconnected but still-configured datasource keeps its frames (its id stays live).
	useEffect(() => {
		const liveSourceIds = new Set<string>();
		datasources.forEach((ds) => liveSourceIds.add(ds.settings.id));
		reconcileTransformSources(liveSourceIds);
	}, [datasources]);

	// Track datasource readiness via lifecycle actions
	// Register listeners immediately to avoid race conditions
	useEffect(() => {
		const handleDatasourceReady = (datasourceId: string) => {
			setReadyDatasources((prev) => {
				const next = new Set(prev);
				next.add(datasourceId);
				return next;
			});
			setDatasourceStatuses((prev) => {
				const next = new Map(prev);
				next.set(datasourceId, "ready");
				return next;
			});
		};

		const handleDatasourceDisposed = (datasourceId: string) => {
			setReadyDatasources((prev) => {
				const next = new Set(prev);
				next.delete(datasourceId);
				return next;
			});
			setDatasourceStatuses((prev) => {
				const next = new Map(prev);
				next.set(datasourceId, "disposed");
				return next;
			});
		};

		pluginsManager.addAction(PluginsHooks.DATASOURCE_READY, {
			id: "global-datasources-ready-tracker",
			priority: 10,
			action: handleDatasourceReady,
		});

		pluginsManager.addAction(PluginsHooks.DATASOURCE_DISPOSED, {
			id: "global-datasources-disposed-tracker",
			priority: 10,
			action: handleDatasourceDisposed,
		});

		return () => {
			pluginsManager.removeAction("global-datasources-ready-tracker");
			pluginsManager.removeAction("global-datasources-disposed-tracker");
		};
	}, [pluginsManager]);

	// Clear readiness tracking when not initialized
	useEffect(() => {
		if (!initialized) {
			setReadyDatasources((prev) => (prev.size === 0 ? prev : new Set()));
		}
	}, [initialized]);

	useEffect(() => {
		if (!initialized) return;

		pluginsManager.addFilter(PluginsHooks.AVAILABLE_DATASOURCES, {
			id: "available_datasources",
			priority: 10,
			filter: () => {
				return Array.from(datasources.values());
			},
		});

		return () => {
			pluginsManager.removeFilter("available_datasources");
		};
	}, [initialized, datasources, pluginsManager]);

	useEffect(() => {
		if (!initialized) return;

		/**
		 * Filter the widgets list based on the available datasources.
		 * This filter will be applied to the widgets list when the datasources are available.
		 * It will return only the widgets that are compatible with the available datasources.
		 *
		 * This filter is the last one to be applied.
		 */
		pluginsManager.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: "filter_widgets_list_based_on_datasources",
			priority: Number.MAX_SAFE_INTEGER,
			filter: (widgets: WidgetDefinition[]) => {
				const datasourceArray = pluginsManager.applyFilter<
					Datasource[]
				>(PluginsHooks.AVAILABLE_DATASOURCES, []);

				// if no datasources are available, return no widgets
				if (datasourceArray.length === 0) {
					return [];
				}
				return pluginsManager.applyFilter<WidgetDefinition[]>(
					PluginsHooks.WIDGET_LIST_WITH_DATASOURCE,
					widgets,
					datasourceArray,
				);
			},
		});

		return () => {
			pluginsManager.removeFilter(
				"filter_widgets_list_based_on_datasources",
			);
		};
	}, [datasources, initialized, pluginsManager]);

	// Determine if all datasources are ready.
	// NOTE: this value is intentionally still computed and exposed on the
	// context (see `allDatasourcesReady` below). It no longer GATES
	// rendering of `children` —
	// the dashboard and widgets mount immediately and degrade per-datasource —
	// but consumers may still read it for global health affordances.
	const allDatasourcesReady =
		datasources.size === 0 || readyDatasources.size === datasources.size;

	// Render datasources as parallel siblings
	const datasourceComponents = initialized
		? Array.from(datasources.values()).map((datasource) => {
				const dataSourceType = dataSourcesTypes.get(
					datasource.datasource_id,
				);
				if (!dataSourceType) {
					console.error(
						`Datasource ${datasource.datasource_id} not found`,
					);
					return null;
				}

				const Provider = dataSourceType.Provider;
				return (
					<Provider
						key={datasource.settings.id}
						{...datasource.settings}
					/>
				);
			})
		: null;

	return (
		<GlobalDataSourcesContextProvider
			value={{
				datasourceStatuses,
				readyDatasources,
				allDatasourcesReady,
			}}
		>
			{initialized && (
				<NavbarItem id="datasources_status" zone="center" priority={0}>
					<DatasourceStatusBadges
						datasources={Array.from(datasources.values())}
						datasourceStatuses={datasourceStatuses}
					/>
				</NavbarItem>
			)}
			{initialized && (
				<NavbarItem id="datasources_combo" zone="center" priority={0}>
					<Dialog>
						<DialogTrigger asChild>
							<Button
								variant={"ghost"}
								className={
									datasources.size === 0
										? "animate-pulse"
										: ""
								}
								style={
									datasources.size === 0
										? {
												animation:
													"pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
												boxShadow:
													"0 0 0 0 hsl(var(--primary))",
											}
										: {}
								}
							>
								Datasources <CloudCogIcon />
							</Button>
						</DialogTrigger>
						<DialogContent size="large">
							<DialogHeader>
								<DialogTitle>Datasources</DialogTitle>
								<DialogDescription>
									Setup the different datasources used in this
									workspace.
								</DialogDescription>
								<div>
									<div>
										{Array.from(datasources.values()).map(
											(datasource) => {
												return (
													<DatasourceCard
														addTemplate={
															addTemplate
														}
														onRemove={handleRemove}
														data={
															datasource.settings
														}
														key={
															datasource.settings
																.id
														}
														definition={getDatasourceDef(
															datasource.datasource_id,
														)}
														onValidate={function (
															datasource_def,
															settings: DatasourceProviderSettings,
														): void {
															updateDatasource(
																settings,
															);
														}}
													/>
												);
											},
										)}
									</div>
									<div
										className="flex justify-end mt-1.5 gap-3"
										style={{ justifyContent: "flex-end" }}
									>
										<DatasourceAdder
											handleAdd={handleAdd}
										/>
										<DialogClose
											className="float-end"
											asChild
										>
											<Button onClick={() => {}}>
												<CheckIcon />
											</Button>
										</DialogClose>
									</div>
								</div>
							</DialogHeader>
						</DialogContent>
					</Dialog>
				</NavbarItem>
			)}
			{datasourceComponents}
			{/*
			 * Children render unconditionally: the dashboard and all widgets
			 * mount immediately, regardless of datasource connection state, so
			 * one unready or offline datasource never hides the whole dashboard.
			 * Per-datasource degradation is communicated through
			 * `datasourceStatuses` (status badges, the `DatasourceOffline` widget
			 * affordance) rather than by withholding `children`.
			 * `allDatasourcesReady` remains computed and exposed on the context
			 * above for any consumer that still reads it.
			 */}
			{children}
		</GlobalDataSourcesContextProvider>
	);
};

/**
 * Access global datasource context.
 * @returns Global datasource context value.
 */
const useGlobalDataSources = () => {
	return useGlobalDataSourcesContext();
};

export { GlobalDataSourcesProvider, useGlobalDataSources };
