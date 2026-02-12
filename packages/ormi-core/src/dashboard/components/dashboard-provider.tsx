"use client";

import React, {
	createContext,
	useContext,
	ReactNode,
	useEffect,
	useReducer,
	JSX,
	useCallback,
	useMemo,
	useRef,
} from "react";
import { useAtom } from "jotai";
import {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	hasChangedAtom,
	forceReloadAtom,
	datasourcesAtom,
} from "../atoms";
import { DashboardInterface } from "../dashboard-interface";
import { Widget, WidgetDefinition } from "../../widgets/widget-interface";
import {
	PluginsManager,
	usePluginsManager,
	PluginsHooks,
} from "@workspace/ormi-plugins";
import { widgetNotFound } from "../../widgets/components/widget-not-found";
import {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
	DatasourceTopic,
	DatasourceTopicFilter,
} from "../../datasources/datasource-interface";
import { Spinner } from "@workspace/ui/components/spinner";
import { toast } from "sonner";

// Simple hash function for dashboard state
const hashDashboardState = (
	layouts: Record<string, any>,
	widgets: Map<string, Widget>,
	datasources: Map<string, Datasource>,
	locked: boolean,
): string => {
	const state = {
		layouts: layouts,
		widgets: Object.fromEntries(widgets),
		datasources: Object.fromEntries(datasources),
		locked,
	};

	const stateString = JSON.stringify(state, (key, value) => {
		// Skip circular reference properties that RC-Dock uses internally
		if (key === "parent" || key === "_owner" || key === "_store") {
			return undefined;
		}

		// Ensure consistent ordering for objects
		if (
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value)
		) {
			const ordered: any = {};
			Object.keys(value)
				.sort()
				.forEach((k) => {
					ordered[k] = value[k];
				});
			return ordered;
		}
		return value;
	});

	// Simple string hash function
	let hash = 0;
	for (let i = 0; i < stateString.length; i++) {
		const char = stateString.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}

	return hash.toString();
};

/** Dashboard context value. */
interface DashboardContextInterface {
	layouts: Record<string, any>;
	widgets: Map<string, Widget>;

	getComponents: (boxId: string) => JSX.Element;
	getDefinition: (widget_id: string) => WidgetDefinition;

	addWidget: (widget: WidgetDefinition, settings: any) => void;
	removeWidget: (box_id: string) => void;
	updateWidget: (box_id: string, settings: any) => void;

	updateLayouts: (newLayouts: Record<string, any>) => void;

	lockUnLockDashboard(): void;
	locked: boolean;

	savesDashboard: () => void;
	hasChanged: boolean;
	forceReload: boolean;

	datasources: Map<string, Datasource>;
	updateDatasource: (
		datasource_id: string,
		settings: DatasourceProviderSettings,
	) => void;
	addDatasource: (
		datasource_id: string,
		settings?: DatasourceProviderSettings,
	) => void;
	removeDatasource: (datasource_id: string) => void;

	dispatch: React.Dispatch<any>;
}

/** Dashboard actions context value. */
interface DashboardActionsInterface {
	getDefinition: (widget_id: string) => WidgetDefinition;
	addWidget: (widget: WidgetDefinition, settings: any) => void;
	removeWidget: (box_id: string) => void;
	updateWidget: (box_id: string, settings: any) => void;
	updateLayouts: (newLayouts: Record<string, any>) => void;
	lockUnLockDashboard(): void;
	savesDashboard: () => void;
	addDatasource: (
		datasource_id: string,
		settings?: DatasourceProviderSettings,
	) => void;
	removeDatasource: (datasource_id: string) => void;
	updateDatasource: (
		datasource_id: string,
		settings: DatasourceProviderSettings,
	) => void;
	dispatch: React.Dispatch<any>;
}

// Create the context with a default value
const DashboardContext = createContext<DashboardContextInterface>({
	layouts: {},
	widgets: new Map<string, Widget>(),

	getComponents: () => <></>,
	getDefinition: () => {
		throw new Error("Method not implemented.");
	},
	addWidget: () => {},
	removeWidget: () => {},
	updateWidget: () => {},

	updateLayouts: (newLayouts: Record<string, any>) => {},

	lockUnLockDashboard: () => {},
	locked: false,

	savesDashboard: () => {},
	hasChanged: false,
	forceReload: false,

	datasources: new Map<string, Datasource>(),
	updateDatasource: () => {},
	addDatasource: () => {},
	removeDatasource: () => {},
	dispatch: () => {
		throw new Error("Dispatch not implemented.");
	},
});

const DashboardActionsContext = createContext<DashboardActionsInterface>({
	getDefinition: () => {
		throw new Error("Method not implemented.");
	},
	addWidget: () => {},
	removeWidget: () => {},
	updateWidget: () => {},
	updateLayouts: () => {},
	lockUnLockDashboard: () => {},
	savesDashboard: () => {},
	addDatasource: () => {},
	removeDatasource: () => {},
	updateDatasource: () => {},
	dispatch: () => {
		throw new Error("Dispatch not implemented.");
	},
});

/** Props for DashboardProvider. */
interface DashboardProviderProps {
	children: ReactNode;
	dashboardType: string;
	dashboardDefinition: DashboardInterface;
	OnLoad: (setState: React.Dispatch<any>) => Promise<boolean>;
	OnSave: (newDashboard: any) => Promise<boolean>;
}

// Create a provider component
const initialStateFromDefinition = (
	dashboardDefinition: DashboardInterface,
) => ({
	compactType: null,
	layouts: dashboardDefinition.layouts,
	widgets: dashboardDefinition.widgets,
	locked: dashboardDefinition.locked,
	datasources: dashboardDefinition.datasources,
	forceReload: false,
});

function dashboardReducer(state: any, action: any) {
	switch (action.type) {
		case "SET_LAYOUTS":
			return { ...state, layouts: action.payload };
		case "SET_WIDGETS":
			return { ...state, widgets: action.payload };
		case "SET_LOCKED":
			return { ...state, locked: action.payload };
		case "SET_DATASOURCES":
			return { ...state, datasources: action.payload };
		case "SET_FORCERELOAD":
			return { ...state, forceReload: action.payload };
		// Add more actions for widget/layout/datasource manipulation as needed
		default:
			return state;
	}
}

/**
 * Dashboard state provider and lifecycle handler.
 * @param props - Component props.
 * @returns React element.
 */
const DashboardProvider = (props: DashboardProviderProps) => {
	const { children, dashboardType, dashboardDefinition, OnLoad, OnSave } =
		props;
	const pluginsManager = usePluginsManager() as PluginsManager;
	const availableWidgets: WidgetDefinition[] = pluginsManager.applyFilter<
		WidgetDefinition[]
	>(PluginsHooks.WIDGETS_LIST, []);
	const availableDatasources: DatasourceDefinition[] =
		pluginsManager.applyFilter<DatasourceDefinition[]>(
			PluginsHooks.DATASOURCES_LIST,
			[],
		);

	const [state, dispatch] = useReducer(
		dashboardReducer,
		initialStateFromDefinition(dashboardDefinition),
	);
	const [, setWidgetsAtom] = useAtom(widgetsAtom);
	const [, setLayoutsAtom] = useAtom(layoutsAtom);
	const [, setLockedAtom] = useAtom(lockedAtom);
	const [, setHasChangedAtom] = useAtom(hasChangedAtom);
	const [, setForceReloadAtom] = useAtom(forceReloadAtom);
	const [, setDatasourcesAtom] = useAtom(datasourcesAtom);
	const [hasChanged, setHasChanged] = React.useState<boolean>(false);
	const [initialized, setInitialized] = React.useState(false);
	const [initialHash, setInitialHash] = React.useState<string>("");

	useEffect(() => {
		setWidgetsAtom(state.widgets);
		setLayoutsAtom(state.layouts);
		setLockedAtom(state.locked);
		setForceReloadAtom(state.forceReload);
		setDatasourcesAtom(state.datasources);
	}, [
		state.widgets,
		state.layouts,
		state.locked,
		state.forceReload,
		state.datasources,
		setWidgetsAtom,
		setLayoutsAtom,
		setLockedAtom,
		setForceReloadAtom,
		setDatasourcesAtom,
	]);

	useEffect(() => {
		setHasChangedAtom(hasChanged);
	}, [hasChanged, setHasChangedAtom]);

	// PluginsManager topic filter (restored from old provider)
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
					const diagnostic = { topics, filter };
					console.warn("No topics found for the filter", diagnostic);
				}
				return filteredTopics;
			},
		});
		return () => {
			pluginsManager.removeFilter("dashboard-available-topics");
		};
	}, [pluginsManager]);

	// Load initial state from persistence
	useEffect(() => {
		OnLoad((loadedState: any) => {
			dispatch({ type: "SET_LAYOUTS", payload: loadedState.layouts });
			dispatch({ type: "SET_WIDGETS", payload: loadedState.widgets });
			dispatch({ type: "SET_LOCKED", payload: loadedState.locked });
			dispatch({
				type: "SET_DATASOURCES",
				payload: loadedState.datasources,
			});
		}).then(() => setInitialized(true));
	}, [OnLoad]);

	// Hash and change detection
	useEffect(() => {
		if (initialized) {
			const currentHash = hashDashboardState(
				state.layouts,
				state.widgets,
				state.datasources,
				state.locked,
			);
			if (!initialHash) setInitialHash(currentHash);
			setHasChanged(currentHash !== initialHash);
			// console.log("Dashboard state hash:", currentHash, "Initial hash:", initialHash, "Has changed:", currentHash !== initialHash);
		}
	}, [state, initialized, initialHash]);

	// Helper: getComponents
	const getComponents = useCallback(
		(boxId: string) => {
			const widget = state.widgets.get(boxId);
			if (widget) {
				const widgetDefinition = availableWidgets.find(
					(widget_def) => widget_def.id === widget.widget_id,
				);
				if (widgetDefinition) {
					return (
						<WidgetHost
							component={widgetDefinition.Component}
							settings={widget.settings}
						/>
					);
				}
			}
			console.error("Widget not found for boxId:", boxId);
			return (
				<WidgetHost
					component={widgetNotFound.Component}
					settings={[<p>Widget not found</p>, boxId]}
				/>
			);
		},
		[state.widgets, availableWidgets],
	);

	const stateRef = useRef(state);
	const availableWidgetsRef = useRef(availableWidgets);
	const availableDatasourcesRef = useRef(availableDatasources);
	const hasChangedRef = useRef(hasChanged);
	const initialHashRef = useRef(initialHash);
	const onSaveRef = useRef(OnSave);

	useEffect(() => {
		stateRef.current = state;
		availableWidgetsRef.current = availableWidgets;
		availableDatasourcesRef.current = availableDatasources;
	}, [state, availableWidgets, availableDatasources]);

	useEffect(() => {
		hasChangedRef.current = hasChanged;
		initialHashRef.current = initialHash;
	}, [hasChanged, initialHash]);

	useEffect(() => {
		onSaveRef.current = OnSave;
	}, [OnSave]);

	// Helper: getDefinition (stable)
	const getDefinition = useCallback((widget_id: string) => {
		const widget = availableWidgetsRef.current.find(
			(widget_def) => widget_def.id === widget_id,
		);
		if (widget) {
			return widget;
		}
		return widgetNotFound;
	}, []);

	// Generic widget CRUD helpers
	const addWidget = useCallback(
		(widget: WidgetDefinition, settings: any) => {
			const currentState = stateRef.current;
			const box_id = `component_${currentState.widgets.size}_${Date.now()}`;
			let widget_title = widget.name;
			if (widget.titleProp) {
				widget_title = settings[widget.titleProp];
			}
			const newWidget: Widget = {
				box_id,
				widget_id: widget.id,
				title: widget_title,
				settings: settings ? { ...settings } : settings,
			};
			const newWidgets = new Map(currentState.widgets);
			newWidgets.set(box_id, newWidget);
			dispatch({ type: "SET_WIDGETS", payload: newWidgets });
			// Layout manipulation is type-specific, handled in dashboard type component
		},
		[dispatch],
	);

	const removeWidget = useCallback(
		(box_id: string) => {
			const newWidgets = new Map(stateRef.current.widgets);
			newWidgets.delete(box_id);
			dispatch({ type: "SET_WIDGETS", payload: newWidgets });
			// Layout manipulation is type-specific, handled in dashboard type component
		},
		[dispatch],
	);

	const updateWidget = useCallback(
		(box_id: string, settings: any) => {
			const newWidgets = new Map(stateRef.current.widgets);
			const widget = newWidgets.get(box_id) as Widget | undefined;
			if (widget) {
				const widgetDef = getDefinition(widget.widget_id);
				const nextSettings = settings ? { ...settings } : settings;
				const nextTitle = widgetDef.titleProp
					? nextSettings?.[widgetDef.titleProp]
					: widget.title;
				const nextWidget: Widget = {
					...widget,
					settings: nextSettings,
					title: nextTitle ?? widget.title,
				};
				newWidgets.set(box_id, nextWidget);
				dispatch({ type: "SET_WIDGETS", payload: newWidgets });
			}
		},
		[dispatch, getDefinition],
	);

	const updateLayouts = useCallback(
		(newLayouts: Record<string, any>) => {
			dispatch({ type: "SET_LAYOUTS", payload: newLayouts });
		},
		[dispatch],
	);

	// Datasource CRUD helpers (restored logic)
	const addDatasource = useCallback(
		(datasource_id: string, settings?: DatasourceProviderSettings) => {
			const currentState = stateRef.current;
			const newDatasources = new Map(currentState.datasources);
			const datasourceDef = availableDatasourcesRef.current.find(
				(datasource) => datasource.id === datasource_id,
			);
			if (!datasourceDef) {
				throw new Error(`Datasource ${datasource_id} not found`);
			}
			const id = `datasource_${newDatasources.size}_${Date.now()}`;
			const datasource = {
				datasource_id: datasource_id,
				title: settings?.title || "New Datasource",
				settings: settings
					? {
							...settings,
							id: id,
						}
					: {
							...datasourceDef.data,
							id: id,
							title: "New Datasource",
						},
			} as Datasource;
			newDatasources.set(id, datasource);
			dispatch({ type: "SET_DATASOURCES", payload: newDatasources });
		},
		[dispatch],
	);

	const removeDatasource = useCallback(
		(source_id: string) => {
			const newDatasources = new Map(stateRef.current.datasources);
			newDatasources.delete(source_id);
			dispatch({ type: "SET_DATASOURCES", payload: newDatasources });
		},
		[dispatch],
	);

	const updateDatasource = useCallback(
		(datasource_id: string, settings: DatasourceProviderSettings) => {
			const newDatasources = new Map(stateRef.current.datasources);
			const datasource = newDatasources.get(settings.id) as
				| Datasource
				| undefined;
			if (datasource) {
				datasource.settings = settings;
				datasource.title = settings.title;
				newDatasources.set(settings.id, datasource);
				dispatch({ type: "SET_DATASOURCES", payload: newDatasources });
			}
		},
		[dispatch],
	);

	// Save dashboard state
	const savesDashboard = useCallback(async () => {
		if (!hasChangedRef.current) {
			toast("No changes to save");
			return;
		}

		// Force React to give us the most current state by using a functional update
		// This ensures all batched SET_LAYOUTS updates are processed
		let latestState = stateRef.current;
		dispatch((currentState: any) => {
			latestState = currentState;
			return currentState; // No actual change, just capture the latest state
		});

		const newDashboard = {
			layouts: latestState.layouts,
			widgets: latestState.widgets,
			datasources: latestState.datasources,
			locked: latestState.locked,
		};

		try {
			const success = await onSaveRef.current(newDashboard);
			if (success) {
				const currentHash = hashDashboardState(
					latestState.layouts,
					latestState.widgets,
					latestState.datasources,
					latestState.locked,
				);
				setInitialHash((prev) => currentHash);
				setHasChanged(false);
			} else {
				toast("Failed to save dashboard");
			}
		} catch (error) {
			console.error("Save error:", error);
			toast("Failed to save dashboard");
		}
	}, [dispatch]);

	// Lock/unlock dashboard
	const lockUnLockDashboard = useCallback(() => {
		dispatch({ type: "SET_LOCKED", payload: !stateRef.current.locked });
	}, [dispatch]);

	const contextValue = useMemo(
		() => ({
			...state,
			dispatch,
			dashboardType,
			hasChanged,
			getComponents,
			getDefinition,
			lockUnLockDashboard,
			addWidget,
			removeWidget,
			updateWidget,
			updateLayouts,
			addDatasource,
			removeDatasource,
			updateDatasource,
			savesDashboard,
			// Layout manipulation is type-specific, handled in dashboard type component
		}),
		[
			state,
			dispatch,
			dashboardType,
			hasChanged,
			getComponents,
			getDefinition,
			lockUnLockDashboard,
			addWidget,
			removeWidget,
			updateWidget,
			updateLayouts,
			addDatasource,
			removeDatasource,
			updateDatasource,
			savesDashboard,
		],
	);

	const actionsValue = useMemo(
		() => ({
			getDefinition,
			addWidget,
			removeWidget,
			updateWidget,
			updateLayouts,
			lockUnLockDashboard,
			savesDashboard,
			addDatasource,
			removeDatasource,
			updateDatasource,
			dispatch,
		}),
		[
			getDefinition,
			addWidget,
			removeWidget,
			updateWidget,
			updateLayouts,
			lockUnLockDashboard,
			savesDashboard,
			addDatasource,
			removeDatasource,
			updateDatasource,
			dispatch,
		],
	);

	return (
		<DashboardActionsContext.Provider value={actionsValue}>
			<DashboardContext.Provider value={contextValue}>
				{initialized ? children : <Spinner />}
			</DashboardContext.Provider>
		</DashboardActionsContext.Provider>
	);
};

/**
 * Access dashboard state context.
 * @returns Dashboard context value.
 */
const useDashboardManager = () => {
	const context = useContext(DashboardContext);
	if (context === undefined) {
		throw new Error(
			"useDashboardManager must be used within a DashboardProvider",
		);
	}
	return context;
};

export { DashboardProvider, useDashboardManager };

/**
 * Access dashboard actions context.
 * @returns Dashboard actions context value.
 */
const useDashboardActions = () => {
	const context = useContext(DashboardActionsContext);
	if (context === undefined) {
		throw new Error(
			"useDashboardActions must be used within a DashboardProvider",
		);
	}
	return context;
};

export { useDashboardActions };

const WidgetHost = React.memo(
	({
		component,
		settings,
	}: {
		component: React.ElementType | React.ReactElement;
		settings: any;
	}) => {
		if (React.isValidElement(component)) {
			return component;
		}
		return React.createElement(component as React.ElementType, settings);
	},
	(prev, next) =>
		prev.component === next.component && prev.settings === next.settings,
);
