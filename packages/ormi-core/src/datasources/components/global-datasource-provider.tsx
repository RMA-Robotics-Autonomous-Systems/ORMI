"use client";

/**
 * Load available datasources and render their providers.
 */

import React, { useState, useEffect } from "react";
import {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasource-interface";
import { useDashboardManager } from "../../dashboard/components/dashboard-provider";

import {
	PluginsHooks,
	PluginsManager,
	usePluginsManager,
} from "@workspace/ormi-plugins";

import { useNavbar } from "@workspace/ui/combined/navbar";

import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
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
import {
	CheckIcon,
	CloudCogIcon,
	Loader2,
	AlertCircle,
	XCircle,
} from "lucide-react";
import { Template, useTemplates } from "../../templates";
import { createSafeContext } from "@workspace/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";

/** Datasource connection status. */
type DatasourceStatus = "connecting" | "ready" | "error" | "disposed";

type GlobalDataSources = object;

const [GlobalDataSourcesContextProvider, useGlobalDataSourcesContext] =
	createSafeContext<GlobalDataSources>("GlobalDataSources");

/**
 * Global datasource provider wiring datasource providers and navbar UI.
 * @param props - Component props.
 * @returns React element.
 */
const GlobalDataSourcesProvider = (props: { children: React.ReactNode }) => {
	const { children } = props;

	const { datasources, updateDatasource, addDatasource, removeDatasource } =
		useDashboardManager();

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

	const { setNavbarItem, removeNavbarItem } = useNavbar();

	const { addTemplate } = useTemplates();

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
			const next = new Map(prev);
			datasources.forEach((ds) => {
				if (!next.has(ds.settings.id)) {
					next.set(ds.settings.id, "connecting");
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
				}
			});
			return next;
		});
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
			setReadyDatasources(new Set());
		}
	}, [initialized]);

	useEffect(() => {
		if (!initialized) return;

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

		// Create status badges for each datasource
		const datasourceStatusElements = Array.from(datasources.values()).map(
			(ds) => {
				const status =
					datasourceStatuses.get(ds.settings.id) || "connecting";
				const statusConfig = {
					connecting: {
						icon: Loader2,
						variant: "secondary" as const,
						color: "text-blue-600",
						label: "Connecting",
					},
					ready: {
						icon: CheckIcon,
						variant: "default" as const,
						color: "text-green-600",
						label: "Ready",
					},
					error: {
						icon: AlertCircle,
						variant: "destructive" as const,
						color: "text-red-600",
						label: "Error",
					},
					disposed: {
						icon: XCircle,
						variant: "outline" as const,
						color: "text-gray-600",
						label: "Disposed",
					},
				}[status];
				const Icon = statusConfig.icon;

				return (
					<Tooltip key={ds.settings.id}>
						<TooltipTrigger asChild>
							<Badge
								variant={statusConfig.variant}
								className="gap-1"
							>
								<Icon
									className={`h-3 w-3 ${statusConfig.color} ${status === "connecting" ? "animate-spin" : ""}`}
								/>
								<span className={statusConfig.color}>
									{ds.settings.title}
								</span>
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							<p>
								{ds.settings.title}: {statusConfig.label}
							</p>
						</TooltipContent>
					</Tooltip>
				);
			},
		);

		// Set status indicator as separate navbar item
		if (datasourceStatusElements.length > 0) {
			setNavbarItem(
				"center",
				"datasources_status",
				<TooltipProvider>
					<div className="flex h-full items-center gap-2">
						{datasourceStatusElements}
					</div>
				</TooltipProvider>,
				0,
			);
		} else {
			removeNavbarItem("center", "datasources_status");
		}

		setNavbarItem(
			"center",
			"datasources_combo",
			<Dialog>
				<DialogTrigger asChild>
					<Button
						variant={"ghost"}
						className={
							datasources.size === 0 ? "animate-pulse" : ""
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
												addTemplate={addTemplate}
												onRemove={handleRemove}
												data={datasource.settings}
												key={datasource.settings.id}
												definition={getDatasourceDef(
													datasource.datasource_id,
												)}
												onValidate={function (
													datasource_def,
													settings: DatasourceProviderSettings,
												): void {
													updateDatasource(
														datasource.datasource_id,
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
								<DatasourceAdder handleAdd={handleAdd} />
								<DialogClose className="float-end" asChild>
									<Button onClick={() => {}}>
										<CheckIcon />
									</Button>
								</DialogClose>
							</div>
						</div>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
			0,
		);

		pluginsManager.addFilter(PluginsHooks.AVAILABLE_DATASOURCES, {
			id: "available_datasources",
			priority: 10,
			filter: () => {
				return Array.from(datasources.values());
			},
		});

		return () => {
			removeNavbarItem("center", "datasources_combo");
			removeNavbarItem("center", "datasources_status");
			pluginsManager.removeFilter("available_datasources");
		};
	}, [
		initialized,
		addDatasource,
		removeDatasource,
		updateDatasource,
		dataSourcesTypes,
		datasources,
		datasourceStatuses,
		pluginsManager,
		addTemplate,
		setNavbarItem,
		removeNavbarItem,
	]);

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

	// Determine if all datasources are ready
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
		<GlobalDataSourcesContextProvider value={{}}>
			{datasourceComponents}
			{allDatasourcesReady && children}
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
