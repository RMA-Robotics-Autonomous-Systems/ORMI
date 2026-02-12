import { Plugin, PluginAction, PluginFilter } from "./plugins-types";
import { PluginsHooks } from "./plugins-types";

/**
 * Manages plugin actions and filters on client side.
 */
export class PluginsManager {
	private plugins: Map<string | PluginsHooks, Plugin>;

	constructor(pluginsMap: Map<string | PluginsHooks, Plugin>) {
		this.plugins = pluginsMap;

		// add a "basic" plugin that will be used to add new filters and actions from the client side
		this.plugins.set(
			"basic",
			new Plugin({
				name: "basic",
				description: "Basic plugin",
				version: "1.0.0",
			}),
		);
	}

	/**
	 * Applies a filter to transform data through registered plugin filters.
	 * @param filterName - Filter hook name.
	 * @param args - Arguments where first is the value to transform.
	 * @returns Transformed value.
	 */
	applyFilter<T>(filterName: string | PluginsHooks, ...args: any): T {
		if (args.length < 1) {
			throw new Error(`No argument given in ${filterName}`);
		}
		let result = args[0];
		const filters: PluginFilter[] = [];

		this.plugins.forEach((plugin) => {
			const filtersMap = plugin.filters.get(filterName);

			if (filtersMap !== undefined) {
				filtersMap.forEach((filter) => {
					filters.push(filter);
				});
			}
		});

		if (filters.length === 0) {
			console.warn(`No filter found for ${filterName}`);
		}

		filters.sort((a, b) => a.priority - b.priority);

		filters.forEach((filter) => {
			result = filter.filter(result, ...args.slice(1));
		});

		return result;
	}

	/**
	 * Applies a filter asynchronously through registered plugin filters.
	 * @param filterName - Filter hook name.
	 * @param args - Arguments where first is the value to transform.
	 * @returns Promise resolving to transformed value.
	 */
	async applyFilterAsync<T>(
		filterName: string | PluginsHooks,
		...args: any
	): Promise<T> {
		if (args.length < 1) {
			throw new Error(`No argument given in ${filterName}`);
		}
		let result = args[0];
		const filters: PluginFilter[] = [];

		this.plugins.forEach((plugin) => {
			const filtersMap = plugin.filters.get(filterName);

			if (filtersMap !== undefined) {
				filtersMap.forEach((filter) => {
					filters.push(filter);
				});
			}
		});

		if (filters.length === 0) {
			console.warn(`No filter found for ${filterName}`);
			return result;
		}

		filters.sort((a, b) => a.priority - b.priority);

		for (const filter of filters) {
			result = (await filter.filter(result, ...args.slice(1))) as T;
		}

		return result;
	}

	/**
	 * Adds a filter to the basic plugin.
	 * @param filterName - Filter hook name.
	 * @param filter - Filter to add.
	 */
	addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void {
		const basicPlugin = this.plugins.get("basic");

		if (basicPlugin === undefined) {
			throw new Error("Basic plugin not found");
		}

		if (!basicPlugin.filters.has(filterName)) {
			basicPlugin.filters.set(filterName, new Map());
		}

		if (basicPlugin.filters.get(filterName)?.has(filter.id)) {
			throw new Error(`Filter with id ${filter.id} already exists`);
		}

		basicPlugin.filters.get(filterName)?.set(filter.id, filter);
	}

	/**
	 * Removes a filter by its ID from all plugins.
	 * @param pluginFilterId - Filter ID to remove.
	 */
	removeFilter(pluginFilterId: string): void {
		// search for the filter in all plugins
		// if none has the filter, throw an error, otherwise delete it
		this.plugins.forEach((plugin) => {
			plugin.filters.forEach((filterMap) => {
				if (filterMap.has(pluginFilterId)) {
					filterMap.delete(pluginFilterId);
					return;
				}
			});
		});

		// throw new Error(`Filter with id ${pluginFilterId} not found`);
	}

	/**
	 * Executes all callbacks registered on the action hook.
	 * @param actionName - Action hook name.
	 * @param args - Arguments to pass to actions.
	 */
	doAction(actionName: string | PluginsHooks, ...args: any): void {
		const actions: PluginAction[] = [];

		this.plugins.forEach((plugin) => {
			if (plugin.actions.has(actionName)) {
				const actionsMap = plugin.actions.get(actionName);

				if (actionsMap !== undefined) {
					actionsMap.forEach((action) => {
						actions.push(action);
					});
				}
			}
		});

		actions.sort((a, b) => a.priority - b.priority);

		if (actions.length === 0) {
			console.warn(`No action found for ${actionName}`);
		}

		actions.forEach((action) => {
			action.action(...args);
		});
	}

	/**
	 * Waits for action to exist, then executes it.
	 * @param actionName - Action hook name.
	 * @param timeoutSecond - Timeout in seconds (default 5).
	 * @param args - Arguments to pass to action.
	 * @returns Promise resolving to true if action executed, false if timeout.
	 */
	async WaitAndDoAction(
		actionName: string | PluginsHooks,
		timeoutSecond: number = 5,
		...args: any
	): Promise<boolean> {
		const result = await this.WaitForActionToExist(
			actionName,
			timeoutSecond,
		);

		if (!result) {
			return false;
		}

		this.doAction(actionName, ...args);
		return true;
	}

	/**
	 * Adds an action to the basic plugin.
	 * @param actionName - Action hook name.
	 * @param action - Action to add.
	 */
	addAction(actionName: string | PluginsHooks, action: PluginAction): void {
		const basicPlugin = this.plugins.get("basic");

		if (basicPlugin === undefined) {
			throw new Error("Basic plugin not found");
		}

		if (!basicPlugin.actions.has(actionName)) {
			basicPlugin.actions.set(actionName, new Map());
		}

		if (basicPlugin.actions.get(actionName)?.has(action.id)) {
			throw new Error(`Action with id ${action.id} already exists`);
		}

		basicPlugin.actions.get(actionName)?.set(action.id, action);
	}

	/**
	 * Removes an action by its ID from all plugins.
	 * @param pluginActionId - Action ID to remove.
	 */
	removeAction(pluginActionId: string): void {
		// search for the action in all plugins, if none has the action, throw an error, otherwise delete it
		this.plugins.forEach((plugin) => {
			plugin.actions.forEach((actionsMap) => {
				if (actionsMap.has(pluginActionId)) {
					actionsMap.delete(pluginActionId);
					return;
				}
			});
		});

		// throw new Error(`Action with id ${pluginActionId} not found`);
	}

	/**
	 * Waits for an action to exist with periodic checks.
	 * @param actionName - Action hook name.
	 * @param timeoutSecond - Timeout in seconds (default 5).
	 * @returns Promise resolving to true if found, false if timeout.
	 */
	WaitForActionToExist(
		actionName: string | PluginsHooks,
		timeoutSecond: number = 5,
	): Promise<boolean> {
		return new Promise((resolve) => {
			const interval = setInterval(() => {
				if (this.plugins.get("basic")?.actions.has(actionName)) {
					clearInterval(interval);
					clearTimeout(timeout);
					resolve(true);
				}
			}, 100);

			const timeout = setTimeout(() => {
				clearInterval(interval);
				resolve(false);
			}, timeoutSecond * 1000);
		});
	}

	/**
	 * Gets all registered plugins.
	 * @returns Map of plugins.
	 */
	getPlugins(): Map<string | PluginsHooks, Plugin> {
		return this.plugins;
	}
}
