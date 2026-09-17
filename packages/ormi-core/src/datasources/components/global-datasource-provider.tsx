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
import { Card } from "@workspace/ui/components/card";
import { DATASOURCE_CONFIGURE_EVENT } from "@workspace/ui/components/datasource-offline";
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
import { getCreatedTopicsStore } from "../created-topics";
import { DatasourceStatusBadges } from "./datasource-status-badges";
import { CheckIcon, CloudCogIcon, PuzzleIcon, Trash2Icon } from "lucide-react";
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
 * A configured datasource paired with the definition that backs it.
 *
 * `unsupported` is an expected state, not an error: dev-only plugins are gated
 * out of production builds, so a saved workspace can legitimately reference a
 * `datasource_id` that no plugin in this build provides.
 */
type ResolvedDatasourceEntry =
	| {
			kind: "supported";
			datasource: Datasource;
			definition: DatasourceDefinition<DatasourceProviderSettings>;
	  }
	| { kind: "unsupported"; datasource: Datasource };

/**
 * Pair each configured datasource with its definition, marking the ones no
 * plugin in this build provides as `unsupported` instead of throwing.
 *
 * Pure: the single resolution path used both to mount providers and to render
 * configuration cards, so the two can never disagree about what is supported.
 *
 * @param datasources - Configured datasource instances.
 * @param definitions - Definitions contributed by the loaded plugins, keyed by id.
 * @returns One entry per datasource, in input order.
 */
function resolveDatasourceEntries(
	datasources: Iterable<Datasource>,
	definitions: ReadonlyMap<
		string,
		DatasourceDefinition<DatasourceProviderSettings>
	>,
): ResolvedDatasourceEntry[] {
	return Array.from(datasources, (datasource) => {
		const definition = definitions.get(datasource.datasource_id);
		return definition
			? ({ kind: "supported", datasource, definition } as const)
			: ({ kind: "unsupported", datasource } as const);
	});
}

/** Props for {@link UnsupportedDatasourceCard}. */
interface UnsupportedDatasourceCardProps {
	/** The configured datasource whose definition is missing. */
	datasource: Datasource;
	/** Removes the datasource from the workspace. */
	onRemove: (source_id: string) => void;
}

/**
 * Configuration card for a datasource whose definition no plugin provides.
 *
 * Names the missing `datasource_id` and requires an operator decision — keep
 * it (and restore the plugin) or remove it — rather than crashing the
 * dashboard or dropping the entry silently.
 *
 * @param props - Component props.
 * @returns React element.
 */
const UnsupportedDatasourceCard = (props: UnsupportedDatasourceCardProps) => {
	const { datasource, onRemove } = props;

	return (
		<Card className="my-1.5 flex flex-row items-start gap-3 border-dashed p-4">
			<PuzzleIcon
				className="text-muted-foreground mt-0.5 size-5 shrink-0"
				aria-hidden
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="text-sm font-medium">
					{datasource.title || datasource.settings.id}
				</span>
				<p className="text-muted-foreground text-xs">
					Unsupported configuration: no plugin in this build provides
					the datasource type{" "}
					<code className="font-mono">
						{datasource.datasource_id}
					</code>
					. Its settings are kept as saved and it will not connect.
				</p>
				<p className="text-muted-foreground text-xs">
					Enable the plugin that provides this type, or remove the
					datasource from this workspace.
				</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				aria-label={`Remove unsupported datasource ${datasource.title || datasource.settings.id}`}
				onClick={() => onRemove(datasource.settings.id)}
			>
				<Trash2Icon aria-hidden />
				Remove
			</Button>
		</Card>
	);
};

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

	const [datasourcesDialogOpen, setDatasourcesDialogOpen] = useState(false);

	// A widget reporting an offline/connecting datasource offers a
	// "Check configuration" action; it announces the intent on `window` because
	// `@workspace/ui` cannot reach into core. Opening this dialog is the route
	// back from the symptom to the settings that cause it.
	useEffect(() => {
		const openDatasources = () => setDatasourcesDialogOpen(true);

		window.addEventListener(DATASOURCE_CONFIGURE_EVENT, openDatasources);
		return () => {
			window.removeEventListener(
				DATASOURCE_CONFIGURE_EVENT,
				openDatasources,
			);
		};
	}, []);

	function handleAdd(datasource_id: string) {
		addDatasource(datasource_id);
	}

	function handleRemove(source_id: string) {
		// A topic the operator declared on this datasource describes a wire
		// that is about to stop existing. Leaving it listed offers every topic
		// picker a destination nothing can deliver, and the row looks exactly
		// like a live one.
		getCreatedTopicsStore(pluginsManager).forgetSource(source_id);
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
	//
	// Both updaters return the PREVIOUS collection when the reported state is
	// already the recorded one. `DATASOURCE_READY` is deliberately idempotent
	// and is re-fired by several providers (the foxglove subscription manager
	// re-fires it once per stable connection window so the registry re-flushes
	// parked intents), so a repeat is normal traffic, not an anomaly.
	//
	// Minting a fresh Set/Map for one of those repeats is not a wasted render —
	// it is a feedback loop. This component's output is memoised on these two
	// values, so a new identity rebuilds every `<Provider {...settings} />`
	// element with a fresh props object; any datasource provider whose
	// connection effect depends on the settings OBJECT then tears its transport
	// down and rebuilds it, which fires READY again on reconnect. The datasource
	// reconnects for as long as the dashboard is open.
	useEffect(() => {
		const handleDatasourceReady = (datasourceId: string) => {
			setReadyDatasources((prev) => {
				if (prev.has(datasourceId)) return prev;
				const next = new Set(prev);
				next.add(datasourceId);
				return next;
			});
			setDatasourceStatuses((prev) => {
				if (prev.get(datasourceId) === "ready") return prev;
				const next = new Map(prev);
				next.set(datasourceId, "ready");
				return next;
			});
		};

		const handleDatasourceDisposed = (datasourceId: string) => {
			setReadyDatasources((prev) => {
				if (!prev.has(datasourceId)) return prev;
				const next = new Set(prev);
				next.delete(datasourceId);
				return next;
			});
			setDatasourceStatuses((prev) => {
				if (prev.get(datasourceId) === "disposed") return prev;
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

	// One resolution pass feeds both the mounted providers and the cards in the
	// dialog, so a datasource can never be mounted but unrenderable, or listed
	// as configurable while nothing backs it.
	const datasourceEntries = resolveDatasourceEntries(
		datasources.values(),
		dataSourcesTypes,
	);

	// Render datasources as parallel siblings. Unsupported entries mount no
	// provider — they surface as a card in the dialog instead.
	const datasourceComponents = initialized
		? datasourceEntries.map((entry) => {
				if (entry.kind === "unsupported") return null;

				const Provider = entry.definition.Provider;
				return (
					<Provider
						key={entry.datasource.settings.id}
						{...entry.datasource.settings}
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
					<Dialog
						open={datasourcesDialogOpen}
						onOpenChange={setDatasourcesDialogOpen}
					>
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
								<div className="flex flex-col gap-4 pt-2">
									<div className="flex flex-col gap-2">
										{datasourceEntries.length === 0 ? (
											<p className="text-muted-foreground text-sm">
												No datasource configured yet.
												Add one below to start receiving
												data.
											</p>
										) : (
											<h3 className="text-sm font-medium">
												In this workspace
												<span className="text-muted-foreground ml-1.5 font-normal">
													({datasourceEntries.length})
												</span>
											</h3>
										)}
										{datasourceEntries.map((entry) =>
											entry.kind === "unsupported" ? (
												<UnsupportedDatasourceCard
													key={
														entry.datasource
															.settings.id
													}
													datasource={
														entry.datasource
													}
													onRemove={handleRemove}
												/>
											) : (
												<DatasourceCard
													key={
														entry.datasource
															.settings.id
													}
													addTemplate={addTemplate}
													onRemove={handleRemove}
													data={
														entry.datasource
															.settings
													}
													definition={
														entry.definition
													}
													onValidate={function (
														datasource_def,
														settings: DatasourceProviderSettings,
													): void {
														updateDatasource(
															settings,
														);
													}}
												/>
											),
										)}
									</div>
									<DatasourceAdder
										handleAdd={handleAdd}
										hasDatasources={
											datasourceEntries.length > 0
										}
									/>
									<div className="mt-3 flex justify-end gap-3">
										<DialogClose asChild>
											<Button aria-label="Close datasource settings">
												<CheckIcon aria-hidden />
												Done
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

export {
	GlobalDataSourcesProvider,
	useGlobalDataSources,
	resolveDatasourceEntries,
};
export type { ResolvedDatasourceEntry };
