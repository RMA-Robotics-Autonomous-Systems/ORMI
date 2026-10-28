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

/** The hooks {@link usePluginPages} reads, as a module-level array. */
const PAGES_LIST_HOOKS = [PluginsHooks.PAGES_LIST] as const;

/** Fresh accumulator for `PAGES_LIST`, module-level so its identity is stable. */
const emptyPages = (): PageDefinition[] => [];

/**
 * Returns all page definitions registered by plugins, re-read whenever a
 * plugin adds or removes one.
 * @returns Array of PageDefinition.
 */
const usePluginPages = (): PageDefinition[] =>
	usePluginFilter(PluginsHooks.PAGES_LIST, emptyPages, PAGES_LIST_HOOKS);

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
 * Apply `hook` to a fresh `initial()`, as of `revision`.
 *
 * `revision` is unused in the body on purpose: it is an argument so the React
 * Compiler, which treats a call's arguments as its memo dependencies and
 * cannot see into this function, re-applies the filter when it moves. Read in
 * the caller and dropped (`void revision`) or keyed only in a `useMemo`
 * dependency list, the compiler strips it and keys the filter call on the
 * manager alone, so a later registration is never seen however often the
 * component re-renders.
 *
 * @param manager - Plugins manager.
 * @param revision - Combined revision of the hooks the read depends on.
 * @param hook - Filter hook to apply.
 * @param initial - Builds the accumulator; called on every application.
 * @returns The filtered value.
 */
function applyFilterAtRevision<T>(
	manager: PluginsManager,
	revision: number,
	hook: string | PluginsHooks,
	initial: () => T,
): T {
	return manager.applyFilter<T>(hook, initial());
}

/**
 * Apply a filter during render and re-apply it whenever a filter is added to
 * or removed from one of `watched`: {@link usePluginFiltersRevision} plus a
 * read the React Compiler cannot freeze ({@link applyFilterAtRevision}).
 *
 * Pass module-level `initial` and `watched`, so the result keeps its identity
 * between registrations. `watched` names `hook` and every hook its filters
 * apply from inside, and nothing else.
 *
 * @param hook - Filter hook to apply.
 * @param initial - Builds a fresh accumulator (filters may mutate it).
 * @param watched - Hooks whose registrations change the result.
 * @returns The filtered value.
 */
const usePluginFilter = <T,>(
	hook: string | PluginsHooks,
	initial: () => T,
	watched: ReadonlyArray<string | PluginsHooks>,
): T => {
	const manager = usePluginsContext();
	const revision = usePluginFiltersRevision(watched);
	return applyFilterAtRevision(manager, revision, hook, initial);
};

/**
 * Exported components and hooks for plugin system.
 */
export {
	PluginsProvider,
	usePluginsManager,
	usePluginPages,
	usePluginFiltersRevision,
	usePluginFilter,
	applyFilterAtRevision,
	combinedFilterRevision,
	subscribeFilterHooks,
};
