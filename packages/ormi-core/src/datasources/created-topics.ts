/**
 * Registry of topics that exist because the operator said so.
 *
 * A datasource enumerates what its robot already advertises. Everything else an
 * operator needs — most of all a topic they create so a control widget can
 * *command* the robot with it — exists nowhere on the wire at the moment it is
 * created: the robot has never published `/cmd_vel`, so no `AVAILABLE_TOPICS`
 * contributor can name it.
 *
 * Before this module the created topic was handed straight back to the one
 * picker that opened the creator dialog and stored in that widget's settings.
 * Nothing else in the app could see it: not the topics panel, not another
 * widget's picker, not the routing index. It reappeared only once the robot
 * itself started advertising the topic — which for a publisher happens some
 * time after the advertise reaches the bridge — so the operator learned to
 * reload the page, and the reload was doing the work.
 *
 * This is the missing half: one process-wide store of operator-declared topics
 * that contributes them to {@link PluginsHooks.AVAILABLE_TOPICS} like any
 * datasource would, and notifies listeners the moment its contents change, so a
 * list on screen updates without waiting for its next poll.
 *
 * Two kinds of entry, deliberately different:
 *
 * - **Declared** ({@link CreatedTopicsStore.declare}) — the operator created
 *   this topic. It stays listed for the session whether or not any widget is
 *   currently using it, because the operator's next act is usually to place the
 *   widget that will.
 * - **Retained** ({@link CreatedTopicsStore.retain}) — a live publisher is
 *   advertising this topic right now. Refcounted and released on unmount, so a
 *   control widget restored from a saved workspace re-declares its own publish
 *   topic on mount and the list is honest after a reload without persisting
 *   anything.
 *
 * Plain TypeScript: no React, no browser globals, so the rules are unit
 * testable and the module is safe to import from anywhere in core.
 */

import { PluginsHooks, type PluginsManager } from "@workspace/ormi-plugins";

import type { DatasourceTopic } from "./datasource-interface";

/**
 * Filter priority for the created-topics contribution.
 *
 * `applyFilterAsync` runs filters in ascending priority, and datasource
 * contributors sit at 100, so a deliberately large number puts this one last:
 * it sees everything the datasources enumerated and can drop a created topic
 * the robot has meanwhile started advertising for real. Listing a topic twice
 * is not cosmetic — the topics panel keys rows on `datasource_id` + name, and
 * two rows with one key is a React key collision on the operator's screen.
 */
const CREATED_TOPICS_FILTER_PRIORITY = 10_000;

/** Registered id of the created-topics `AVAILABLE_TOPICS` filter. */
const CREATED_TOPICS_FILTER_ID = "core-created-topics";

/**
 * Identity of a topic as a *list* entry: the datasource it belongs to and its
 * name.
 *
 * Deliberately not `createTopicKey`, which also folds in `property`. A property
 * is one widget's view of a message, not a second topic, and keying on it here
 * would list `/odom` once per field some widget happens to read.
 */
const topicKey = (topic: { source: { id: string }; topic: string }): string =>
	`${topic.source.id}::${topic.topic}`;

/** A store entry: the topic plus why it is still listed. */
interface CreatedTopicEntry {
	topic: DatasourceTopic;
	/** The operator created this topic; it outlives any widget using it. */
	declared: boolean;
	/** Number of live publishers currently advertising it. */
	retainCount: number;
}

/** Public surface of the created-topics store. */
export interface CreatedTopicsStore {
	/**
	 * Every topic the store currently offers.
	 *
	 * Identity-stable between changes and freshly built on each change, so it
	 * can back a `useSyncExternalStore` snapshot directly.
	 */
	list(): readonly DatasourceTopic[];
	/**
	 * Record a topic the operator created. Idempotent per topic identity; a
	 * second declaration replaces the stored shape (type, raw type) so a
	 * re-created topic does not keep a stale type.
	 *
	 * @param topic - The created topic.
	 * @returns True when the store's contents changed.
	 */
	declare(topic: DatasourceTopic): boolean;
	/**
	 * Record that something is advertising this topic right now.
	 *
	 * @param topic - The advertised topic.
	 * @returns A release function; idempotent.
	 */
	retain(topic: DatasourceTopic): () => void;
	/**
	 * Forget an operator-declared topic. A topic still retained by a live
	 * publisher stays listed — it is demonstrably there.
	 *
	 * @param topic - The topic to forget.
	 * @returns True when the store's contents changed.
	 */
	forget(topic: { source: { id: string }; topic: string }): boolean;
	/**
	 * Forget every declared topic belonging to one datasource.
	 *
	 * Called when the operator removes a datasource: a topic they declared on
	 * it describes a wire that no longer exists, so leaving it listed offers a
	 * destination nothing can ever deliver. Retained topics are left alone —
	 * their publishers unmount with the datasource and release them, and a
	 * topic something is demonstrably advertising is not a ghost.
	 *
	 * @param sourceId - Datasource instance id being removed.
	 * @returns True when the store's contents changed.
	 */
	forgetSource(sourceId: string): boolean;
	/**
	 * Subscribe to content changes.
	 *
	 * @param listener - Called after every change to {@link list}.
	 * @returns An unsubscribe function.
	 */
	subscribe(listener: () => void): () => void;
	/** Unregister the `AVAILABLE_TOPICS` contribution. For tests. */
	dispose(): void;
}

/** Whether a value can be listed as a topic at all. */
const isListable = (topic: unknown): topic is DatasourceTopic => {
	if (!topic || typeof topic !== "object") return false;
	const candidate = topic as Partial<DatasourceTopic>;
	if (typeof candidate.topic !== "string" || candidate.topic === "")
		return false;
	const source: unknown = candidate.source;
	if (!source || typeof source !== "object") return false;
	const id: unknown = (source as { id?: unknown }).id;
	return typeof id === "string" && id !== "";
};

class Store implements CreatedTopicsStore {
	private readonly manager: PluginsManager;

	private readonly entries = new Map<string, CreatedTopicEntry>();

	private readonly listeners = new Set<() => void>();

	/**
	 * Cached snapshot, replaced only when the contents change.
	 *
	 * The web app builds with the React Compiler, which infers memo
	 * dependencies from what a body actually reads; a consumer therefore has to
	 * be handed a value whose identity changes on change and only on change,
	 * never a fresh array per call.
	 */
	private snapshot: readonly DatasourceTopic[] = Object.freeze([]);

	private disposed = false;

	constructor(manager: PluginsManager) {
		this.manager = manager;
		this.manager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: CREATED_TOPICS_FILTER_ID,
			priority: CREATED_TOPICS_FILTER_PRIORITY,
			filter: (topics: DatasourceTopic[]) => this.contribute(topics),
		});
	}

	/** Append the created topics a datasource has not already enumerated. */
	private contribute(topics: DatasourceTopic[]): DatasourceTopic[] {
		if (this.snapshot.length === 0) return topics;
		const listed = new Set(topics.filter(isListable).map(topicKey));
		const extra = this.snapshot.filter(
			(topic) => !listed.has(topicKey(topic)),
		);
		return extra.length === 0 ? topics : [...topics, ...extra];
	}

	/** Rebuild the snapshot and notify. */
	private publish(): void {
		this.snapshot = Object.freeze(
			Array.from(this.entries.values(), (entry) => entry.topic),
		);
		this.listeners.forEach((listener) => listener());
	}

	list(): readonly DatasourceTopic[] {
		return this.snapshot;
	}

	declare(topic: DatasourceTopic): boolean {
		if (!isListable(topic)) return false;
		const key = topicKey(topic);
		const existing = this.entries.get(key);
		const added = existing === undefined;
		if (existing) {
			existing.topic = topic;
			existing.declared = true;
		} else {
			this.entries.set(key, { topic, declared: true, retainCount: 0 });
		}
		// Always republish: even when the entry was already listed, its stored
		// shape may have changed, and a caller re-declaring is asking for the
		// list to be refreshed.
		this.publish();
		return added;
	}

	retain(topic: DatasourceTopic): () => void {
		if (!isListable(topic)) return () => {};
		const key = topicKey(topic);
		const existing = this.entries.get(key);
		if (existing) {
			existing.retainCount++;
		} else {
			this.entries.set(key, {
				topic,
				declared: false,
				retainCount: 1,
			});
			this.publish();
		}

		let released = false;
		return () => {
			if (released) return;
			released = true;
			const entry = this.entries.get(key);
			if (!entry) return;
			entry.retainCount = Math.max(0, entry.retainCount - 1);
			if (entry.retainCount === 0 && !entry.declared) {
				this.entries.delete(key);
				this.publish();
			}
		};
	}

	forget(topic: { source: { id: string }; topic: string }): boolean {
		const key = topicKey(topic);
		const entry = this.entries.get(key);
		if (!entry || !entry.declared) return false;
		entry.declared = false;
		if (entry.retainCount > 0) return false;
		this.entries.delete(key);
		this.publish();
		return true;
	}

	forgetSource(sourceId: string): boolean {
		let changed = false;
		for (const [key, entry] of [...this.entries]) {
			if (entry.topic.source.id !== sourceId) continue;
			if (!entry.declared) continue;
			entry.declared = false;
			if (entry.retainCount > 0) continue;
			this.entries.delete(key);
			changed = true;
		}
		if (changed) this.publish();
		return changed;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.manager.removeFilter(CREATED_TOPICS_FILTER_ID);
		this.listeners.clear();
		this.entries.clear();
		this.snapshot = Object.freeze([]);
	}
}

/**
 * Key the per-manager store map is pinned under on `globalThis`.
 *
 * A package that is reachable both through its barrel (sources, in dev) and
 * through a subpath (its build output) is evaluated twice, and a module-level
 * `WeakMap` then exists twice — two stores, one of which nothing reads. The
 * global pin is what makes "one store per manager" true regardless of which
 * specifier a consumer used.
 */
const STORE_REGISTRY_KEY = "__ormi_created_topics_stores__";

/** The process-wide manager → store map. */
const storeRegistry = ((): WeakMap<PluginsManager, Store> => {
	const holder = globalThis as typeof globalThis &
		Record<string, WeakMap<PluginsManager, Store> | undefined>;
	const existing = holder[STORE_REGISTRY_KEY];
	if (existing) return existing;
	const created = new WeakMap<PluginsManager, Store>();
	holder[STORE_REGISTRY_KEY] = created;
	return created;
})();

/**
 * Get (or lazily create) the created-topics store for a plugins manager.
 *
 * Creating it registers the `AVAILABLE_TOPICS` contribution, so the first
 * caller in a session is what makes created topics visible at all. Every
 * surface that creates, advertises or lists topics therefore resolves the store
 * eagerly rather than only when it has something to add.
 *
 * @param manager - The plugins manager the store contributes to.
 * @returns The store bound to this manager instance.
 */
export function getCreatedTopicsStore(
	manager: PluginsManager,
): CreatedTopicsStore {
	let store = storeRegistry.get(manager);
	if (!store) {
		store = new Store(manager);
		storeRegistry.set(manager, store);
	}
	return store;
}
