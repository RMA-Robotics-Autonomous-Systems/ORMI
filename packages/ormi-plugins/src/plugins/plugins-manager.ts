import { metrics, type CounterId, type RingId } from "@workspace/utils/metrics";

import { Plugin, PluginAction, PluginFilter } from "./plugins-types";
import { PluginsHooks } from "./plugins-types";

type HookName = string | PluginsHooks;

/** Shared frozen empties so a zero-handler dispatch allocates nothing. */
const EMPTY_FILTERS: ReadonlyArray<PluginFilter> = Object.freeze([]);
const EMPTY_ACTIONS: ReadonlyArray<PluginAction> = Object.freeze([]);

/**
 * Manages plugin actions and filters on client side.
 *
 * `plugins` stays the source of truth (per-plugin provenance still drives
 * {@link collectGroups} / {@link applyFilterTracked} and removal-by-id). On top
 * of it we keep a **derived, copy-on-write flat index** per hook so the hot
 * dispatch paths ({@link doAction} / {@link applyFilter} / {@link applyFilterAsync})
 * never re-flatten or re-sort per call: they read one frozen, priority-ordered
 * array and iterate it. The index is rebuilt only on a registration change
 * (`add*`/`remove*`), publishing a **new** frozen array (never mutating in
 * place), so a dispatch mid-fan-out keeps iterating its own snapshot even when a
 * handler registers/removes another handler.
 *
 * The seed relies on the contract that all post-construction registration goes
 * through this manager's `add*`/`remove*`; direct `Plugin.addFilter/addAction`
 * only runs inside plugin subclass constructors, before the plugin is handed to
 * the manager. Post-hoc direct plugin-map mutation is not observed.
 */
export class PluginsManager {
	private plugins: Map<HookName, Plugin>;

	/** Derived per-hook flat indexes (copy-on-write frozen arrays). */
	private filterIndex = new Map<HookName, ReadonlyArray<PluginFilter>>();
	private actionIndex = new Map<HookName, ReadonlyArray<PluginAction>>();

	/**
	 * id → hooks it is registered under, so `removeFilter`/`removeAction` (which
	 * take no hook name) rebuild exactly the affected hooks. Filters and actions
	 * have independent id spaces (separate plugin maps), and one id may appear
	 * under several hooks — hence a Set per id, matching today's remove-from-all
	 * semantics.
	 */
	private filterIdToHooks = new Map<string, Set<HookName>>();
	private actionIdToHooks = new Map<string, Set<HookName>>();

	/** Zero-handler warn fires once per hook (cleared on the next registration). */
	private warnedFilterHooks = new Set<HookName>();
	private warnedActionHooks = new Set<HookName>();

	/** Heavy-tier dispatch metric ids (registered once; idempotent). */
	private readonly dispatchMsRing: RingId;
	private readonly dispatchesCounter: CounterId;

	constructor(pluginsMap: Map<HookName, Plugin>) {
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

		this.dispatchMsRing = metrics.ring("broker.dispatchMs");
		this.dispatchesCounter = metrics.counter("broker.dispatches");

		this.seedIndexes();
	}

	/**
	 * Walk every plugin's per-hook maps once to seed the flat indexes and the
	 * id→hooks maps. Runs after the "basic" plugin is inserted so index order
	 * matches `plugins` insertion order (basic last).
	 */
	private seedIndexes(): void {
		const filterHooks = new Set<HookName>();
		const actionHooks = new Set<HookName>();

		this.plugins.forEach((plugin) => {
			plugin.filters.forEach((filterMap, hook) => {
				filterHooks.add(hook);
				filterMap.forEach((filter) => {
					this.trackId(this.filterIdToHooks, filter.id, hook);
				});
			});
			plugin.actions.forEach((actionMap, hook) => {
				actionHooks.add(hook);
				actionMap.forEach((action) => {
					this.trackId(this.actionIdToHooks, action.id, hook);
				});
			});
		});

		filterHooks.forEach((hook) => this.rebuildFilterIndex(hook));
		actionHooks.forEach((hook) => this.rebuildActionIndex(hook));
	}

	private trackId(
		map: Map<string, Set<HookName>>,
		id: string,
		hook: HookName,
	): void {
		let hooks = map.get(id);
		if (hooks === undefined) {
			hooks = new Set();
			map.set(id, hooks);
		}
		hooks.add(hook);
	}

	/**
	 * Rebuild one hook's filter array from `plugins` (copy-on-write). Flattens in
	 * plugin-insertion → inner-map-insertion order, then stable-sorts by
	 * ascending priority — reproducing the exact order the per-call flatten+sort
	 * used to produce. Publishes a new frozen array; the previous one is left
	 * untouched for any in-flight dispatch.
	 */
	private rebuildFilterIndex(hook: HookName): void {
		const filters: PluginFilter[] = [];
		this.plugins.forEach((plugin) => {
			plugin.filters.get(hook)?.forEach((filter) => {
				filters.push(filter);
			});
		});
		filters.sort((a, b) => a.priority - b.priority);

		if (filters.length === 0) {
			this.filterIndex.delete(hook);
		} else {
			this.filterIndex.set(hook, Object.freeze(filters));
		}
	}

	/** Action counterpart of {@link rebuildFilterIndex}. */
	private rebuildActionIndex(hook: HookName): void {
		const actions: PluginAction[] = [];
		this.plugins.forEach((plugin) => {
			plugin.actions.get(hook)?.forEach((action) => {
				actions.push(action);
			});
		});
		actions.sort((a, b) => a.priority - b.priority);

		if (actions.length === 0) {
			this.actionIndex.delete(hook);
		} else {
			this.actionIndex.set(hook, Object.freeze(actions));
		}
	}

	/**
	 * Applies a filter to transform data through registered plugin filters.
	 * @param filterName - Filter hook name.
	 * @param args - Arguments where first is the value to transform.
	 * @returns Transformed value.
	 */
	applyFilter<T>(filterName: HookName, ...args: any): T {
		if (args.length < 1) {
			throw new Error(`No argument given in ${filterName}`);
		}
		let result = args[0];

		const filters = this.filterIndex.get(filterName) ?? EMPTY_FILTERS;
		if (filters.length === 0) {
			this.warnOnce(this.warnedFilterHooks, filterName, "filter");
			return result;
		}

		const timed = metrics.heavy;
		const startedAt = timed ? performance.now() : 0;

		const rest = args.slice(1);
		// try/finally so a throwing filter still records the dispatch metric; the
		// throw propagates unchanged and the remaining filters are still skipped.
		try {
			for (const filter of filters) {
				result = filter.filter(result, ...rest);
			}
		} finally {
			if (timed) {
				metrics.add(this.dispatchesCounter);
				metrics.observe(
					this.dispatchMsRing,
					performance.now() - startedAt,
				);
			}
		}

		return result;
	}

	/**
	 * Applies a filter asynchronously through registered plugin filters.
	 * @param filterName - Filter hook name.
	 * @param args - Arguments where first is the value to transform.
	 * @returns Promise resolving to transformed value.
	 */
	async applyFilterAsync<T>(filterName: HookName, ...args: any): Promise<T> {
		if (args.length < 1) {
			throw new Error(`No argument given in ${filterName}`);
		}
		let result = args[0];

		const filters = this.filterIndex.get(filterName) ?? EMPTY_FILTERS;
		if (filters.length === 0) {
			this.warnOnce(this.warnedFilterHooks, filterName, "filter");
			return result;
		}

		const rest = args.slice(1);
		for (const filter of filters) {
			result = (await filter.filter(result, ...rest)) as T;
		}

		return result;
	}

	/**
	 * Adds a filter to the basic plugin.
	 * @param filterName - Filter hook name.
	 * @param filter - Filter to add.
	 */
	addFilter(filterName: HookName, filter: PluginFilter): void {
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

		this.trackId(this.filterIdToHooks, filter.id, filterName);
		this.warnedFilterHooks.delete(filterName);
		this.rebuildFilterIndex(filterName);
	}

	/**
	 * Removes a filter by its ID from all plugins.
	 * @param pluginFilterId - Filter ID to remove.
	 */
	removeFilter(pluginFilterId: string): void {
		const hooks = this.filterIdToHooks.get(pluginFilterId);
		if (hooks === undefined) {
			// Non-existent id — no-op (matches the historical silent swallow).
			return;
		}

		this.plugins.forEach((plugin) => {
			hooks.forEach((hook) => {
				plugin.filters.get(hook)?.delete(pluginFilterId);
			});
		});

		hooks.forEach((hook) => this.rebuildFilterIndex(hook));
		this.filterIdToHooks.delete(pluginFilterId);
	}

	/**
	 * Executes all callbacks registered on the action hook.
	 * @param actionName - Action hook name.
	 * @param args - Arguments to pass to actions.
	 * @returns `true` if at least one action was registered (and invoked), `false` if none
	 * existed. Lets callers (e.g. the subscription registry) tell "fired" from "no handler yet"
	 * — a dropped action is not silently treated as success.
	 */
	doAction(actionName: HookName, ...args: any): boolean {
		const actions = this.actionIndex.get(actionName) ?? EMPTY_ACTIONS;

		if (actions.length === 0) {
			this.warnOnce(this.warnedActionHooks, actionName, "action");
			return false;
		}

		const timed = metrics.heavy;
		const startedAt = timed ? performance.now() : 0;

		// try/finally so a throwing action still records the dispatch metric; the
		// throw propagates unchanged and the remaining actions are still skipped.
		try {
			for (const action of actions) {
				action.action(...args);
			}
		} finally {
			if (timed) {
				metrics.add(this.dispatchesCounter);
				metrics.observe(
					this.dispatchMsRing,
					performance.now() - startedAt,
				);
			}
		}

		return true;
	}

	/**
	 * Emits the zero-handler warning at most once per hook. Cleared by the next
	 * successful registration on that hook, so a later empty period can warn
	 * again — but a reconnect storm of dispatches to an empty hook stays quiet.
	 */
	private warnOnce(
		warned: Set<HookName>,
		hook: HookName,
		kind: "filter" | "action",
	): void {
		if (warned.has(hook)) {
			return;
		}
		warned.add(hook);
		console.warn(`No ${kind} found for ${hook}`);
	}

	/**
	 * Waits for action to exist, then executes it.
	 * @param actionName - Action hook name.
	 * @param timeoutSecond - Timeout in seconds (default 5).
	 * @param args - Arguments to pass to action.
	 * @returns Promise resolving to true if action executed, false if timeout.
	 */
	async WaitAndDoAction(
		actionName: HookName,
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
	addAction(actionName: HookName, action: PluginAction): void {
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

		this.trackId(this.actionIdToHooks, action.id, actionName);
		this.warnedActionHooks.delete(actionName);
		this.rebuildActionIndex(actionName);
	}

	/**
	 * Removes an action by its ID from all plugins.
	 * @param pluginActionId - Action ID to remove.
	 */
	removeAction(pluginActionId: string): void {
		const hooks = this.actionIdToHooks.get(pluginActionId);
		if (hooks === undefined) {
			// Non-existent id — no-op (matches the historical silent swallow).
			return;
		}

		this.plugins.forEach((plugin) => {
			hooks.forEach((hook) => {
				plugin.actions.get(hook)?.delete(pluginActionId);
			});
		});

		hooks.forEach((hook) => this.rebuildActionIndex(hook));
		this.actionIdToHooks.delete(pluginActionId);
	}

	/**
	 * Waits for an action to exist with periodic checks.
	 * @param actionName - Action hook name.
	 * @param timeoutSecond - Timeout in seconds (default 5).
	 * @returns Promise resolving to true if found, false if timeout.
	 */
	WaitForActionToExist(
		actionName: HookName,
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
	getPlugins(): Map<HookName, Plugin> {
		return this.plugins;
	}

	/**
	 * Collects the items contributed to a list filter, grouped by the plugin that
	 * provided them (provenance-based attribution — no extra field on the items).
	 *
	 * For each registered plugin, its filters for `filterName` are run in
	 * isolation against a fresh `[]` (sorted by ascending priority, mirroring
	 * {@link applyFilter} semantics), and the resulting items are attributed to
	 * `plugin.name`. Plugins that contribute zero items are skipped.
	 *
	 * Unlike {@link applyFilter} — which runs every plugin's filters over a single
	 * shared accumulator — this isolates each plugin so the contributions can be
	 * grouped. Use it to render provenance-grouped lists (e.g. the widget picker).
	 *
	 * Deliberately iterates `plugins` (not the flat index): the flat index
	 * discards the per-plugin grouping this method needs.
	 *
	 * @typeParam T - Item type the filter operates on (e.g. `WidgetDefinition`).
	 * @param filterName - List filter hook name (e.g. `WIDGETS_LIST`).
	 * @returns Groups of items keyed by the contributing plugin's name. Empty
	 * groups are omitted.
	 */
	collectGroups<T>(
		filterName: HookName,
	): { pluginName: string; items: T[] }[] {
		const groups: { pluginName: string; items: T[] }[] = [];

		this.plugins.forEach((plugin) => {
			const filtersMap = plugin.filters.get(filterName);
			if (filtersMap === undefined) {
				return;
			}

			const filters: PluginFilter[] = [];
			filtersMap.forEach((filter) => {
				filters.push(filter);
			});

			if (filters.length === 0) {
				return;
			}

			// Mirror applyFilter's ascending-priority ordering, but start from a
			// fresh accumulator so only this plugin's contributions are collected.
			filters.sort((a, b) => a.priority - b.priority);

			let items: T[] = [];
			filters.forEach((filter) => {
				items = filter.filter(items) as T[];
			});

			if (items.length > 0) {
				groups.push({ pluginName: plugin.getName(), items });
			}
		});

		return groups;
	}

	/**
	 * Like {@link applyFilter}, but also records which plugin first introduced
	 * each resulting item.
	 *
	 * Every filter is invoked **exactly once** across the whole call — definition
	 * factories that call React hooks at factory level must never be re-invoked,
	 * or their hooks fire twice and corrupt hook order (see the dashboard-shell
	 * hook-order note). This is the single-pass alternative to running
	 * {@link applyFilter} and {@link collectGroups} separately, which would
	 * evaluate the filters twice.
	 *
	 * `result` is identical to what {@link applyFilter} returns for the same hook
	 * and seed (same flattened ascending-priority order, including any final
	 * gating filter that removes items). `origin` maps `keyOf(item)` to the name
	 * of the plugin whose filter first introduced that key; first-seen wins.
	 *
	 * Gating filters only remove items (they introduce none), so survivors keep
	 * the attribution of the plugin that pushed them. Removed items leave stale
	 * `origin` entries that callers simply never read.
	 *
	 * Deliberately iterates `plugins` (not the flat index): it needs per-plugin
	 * provenance the flat index discards.
	 *
	 * @typeParam T - Item type the filter operates on (e.g. `WidgetDefinition`).
	 * @param filterName - List filter hook name (e.g. `WIDGETS_LIST`).
	 * @param seed - Initial accumulator passed to the first filter.
	 * @param keyOf - Stable key extractor used to attribute and dedupe items.
	 * @returns The filtered `result` and the `origin` attribution map.
	 */
	applyFilterTracked<T>(
		filterName: HookName,
		seed: T[],
		keyOf: (item: T) => string,
	): { result: T[]; origin: Map<string, string> } {
		const entries: { pluginName: string; filter: PluginFilter }[] = [];

		this.plugins.forEach((plugin) => {
			plugin.filters.get(filterName)?.forEach((filter) => {
				entries.push({ pluginName: plugin.getName(), filter });
			});
		});

		// Mirror applyFilter's global ascending-priority ordering.
		entries.sort((a, b) => a.filter.priority - b.filter.priority);

		let result = seed;
		const origin = new Map<string, string>();

		entries.forEach(({ pluginName, filter }) => {
			result = filter.filter(result) as T[];
			for (const item of result) {
				const key = keyOf(item);
				if (!origin.has(key)) {
					origin.set(key, pluginName);
				}
			}
		});

		return { result, origin };
	}
}
