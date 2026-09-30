"use client";

import React, {
	ReactNode,
	useRef,
	useEffect,
	useCallback,
	useSyncExternalStore,
} from "react";
// import PluginsLoader from './plugins-loader';
import { PluginsManager } from "../plugins-manager";
import {
	PluginsHooks,
	Plugin,
	PluginRegistry,
	PageDefinition,
} from "../plugins-types";
import { createSafeContext } from "@workspace/utils";

/**
 * Context for accessing plugins manager.
 */
const [PluginsContextProvider, usePluginsContext] =
	createSafeContext<PluginsManager>("Plugins");

/**
 * Props for PluginsProvider.
 */
interface PluginsProviderProps {
	children: ReactNode;
	PluginsInfo: PluginRegistry;
}

/**
 * Provider component for plugin system.
 * @param props - Component props.
 * @returns React element.
 */
const PluginsProvider = (props: PluginsProviderProps) => {
	const { children, PluginsInfo } = props;

	const pluginsManagerRef = useRef<PluginsManager | null>(null);

	const [initialized, setInitialized] = React.useState(false);

	// Initialize plugins map
	useEffect(() => {
		const loadPlugins = async () => {
			const pluginsMap = new Map<string | PluginsHooks, Plugin>();

			// Load all plugins
			for (const pluginPromise of Object.values(PluginsInfo)) {
				const plugin = ((await pluginPromise) as any).default;

				if (!plugin) {
					console.error("Plugin not found", plugin);
					continue;
				}

				if (!(plugin.prototype instanceof Plugin)) {
					console.error("Invalid plugin", plugin);
					continue;
				}

				const pluginInstance = new plugin();

				if (pluginsMap.has(pluginInstance.name)) {
					console.error("Plugin already loaded", pluginInstance.name);
					continue;
				}

				pluginsMap.set(pluginInstance.name, pluginInstance);
			}

			// Update the plugins manager with the loaded plugins
			pluginsManagerRef.current = new PluginsManager(pluginsMap);
			setInitialized(true);
		};

		loadPlugins();
	}, [PluginsInfo]);

	// const elements_before_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_BEFORE_CHILDREN, []);
	// const elements_after_children = pluginsManagerRef.current.applyFilter<ReactNode>(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, []);

	return (
		pluginsManagerRef.current && (
			<PluginsContextProvider value={pluginsManagerRef.current}>
				{/* {elements_before_children} */}
				{initialized && children}
				{/* {elements_after_children} */}
			</PluginsContextProvider>
		)
	);
};

/**
 * Hook to access plugins manager from context.
 * @returns PluginsManager instance.
 * @throws Error if used outside PluginsProvider.
 */
const usePluginsManager = () => {
	return usePluginsContext();
};

/**
 * Returns all page definitions registered by plugins.
 * @returns Array of PageDefinition.
 */
const usePluginPages = (): PageDefinition[] => {
	const manager = usePluginsContext();
	return manager.applyFilter<PageDefinition[]>(PluginsHooks.PAGES_LIST, []);
};

/**
 * Combined registration revision of `hooks` on `manager`: the snapshot
 * {@link usePluginFiltersRevision} reads.
 *
 * Revisions only ever grow, so the sum changes whenever any one of them does.
 *
 * @param manager - Plugins manager.
 * @param hooks - Filter hooks to watch.
 * @returns Combined revision.
 */
function combinedFilterRevision(
	manager: PluginsManager,
	hooks: ReadonlyArray<string | PluginsHooks>,
): number {
	let revision = 0;
	for (const hook of hooks) revision += manager.getFilterRevision(hook);
	return revision;
}

/**
 * Call `onChange` whenever a filter is added to or removed from one of
 * `hooks`: the subscription {@link usePluginFiltersRevision} makes. A change
 * on any other hook is ignored, so a component watching a few registries is
 * not re-rendered by unrelated registrations (topic contributors, per-widget
 * filters).
 *
 * @param manager - Plugins manager.
 * @param hooks - Filter hooks to watch.
 * @param onChange - Called once per change to a watched hook.
 * @returns Unsubscribe function.
 */
function subscribeFilterHooks(
	manager: PluginsManager,
	hooks: ReadonlyArray<string | PluginsHooks>,
	onChange: () => void,
): () => void {
	return manager.subscribeFilters((hook) => {
		if (hooks.includes(hook)) onChange();
	});
}

/**
 * Re-render the calling component whenever a filter is added to or removed
 * from one of `hooks`.
 *
 * For a component that applies filters **during render**: a filter registered
 * afterwards (from any component's effect) is otherwise invisible to it until
 * something unrelated re-renders it. The returned number is the combined
 * revision of the watched hooks; the re-render it drives is the point, and it
 * can also be used as a memo key for values derived from those filters.
 *
 * Pass a module-level array: the subscription is keyed on its identity.
 *
 * @param hooks - Filter hooks whose registrations the render depends on,
 * including hooks applied from inside those filters.
 * @returns Combined registration revision of `hooks`.
 */
const usePluginFiltersRevision = (
	hooks: ReadonlyArray<string | PluginsHooks>,
): number => {
	const manager = usePluginsContext();

	const subscribe = useCallback(
		(onChange: () => void) =>
			subscribeFilterHooks(manager, hooks, onChange),
		[manager, hooks],
	);
	const getSnapshot = useCallback(
		() => combinedFilterRevision(manager, hooks),
		[manager, hooks],
	);

	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * Exported components and hooks for plugin system.
 */
export {
	PluginsProvider,
	usePluginsManager,
	usePluginPages,
	usePluginFiltersRevision,
	combinedFilterRevision,
	subscribeFilterHooks,
};
