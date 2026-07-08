/**
 * Intent-based datasource subscription registry.
 *
 * Owns all subscribe/unsubscribe (and advertise/unadvertise) wire traffic for
 * datasource topics. Widgets declare *intents* — "I want data for this topic"
 * — and the registry decides when to talk to the wire (the `PluginsManager`
 * hook protocol) based on datasource readiness, refcounts, and a per-wire-key
 * state machine.
 *
 * Why this exists — the race conditions it removes:
 * - Intents survive a datasource being absent/`connecting` and auto-flush on
 *   `DATASOURCE_READY`, so a widget that mounts before its datasource connects
 *   (and a datasource that connects after the widget mounts) both subscribe.
 * - Reconnect (`DATASOURCE_DISPOSED` → `DATASOURCE_READY`) re-issues subscribe
 *   exactly once, so data resumes after a drop without duplicate subscribes
 *   (makes rosbridge/tello behave like foxglove already does).
 * - Unmount-while-subscribe-in-flight is leak-free via a generation token: a
 *   subscribe that resolves after teardown is neutralised.
 * - StrictMode double-invoke is harmless: a register-once published action with
 *   remove-before-add and a two-level refcount never double-subscribes.
 * - Advertise gets the same re-flush-on-READY treatment, so a publisher that
 *   advertised before the datasource was ready isn't left as a phantom.
 *
 * Design constraints:
 * - Plain TypeScript. No React, no `"use client"`, no import of
 *   `@workspace/ormi-core` or `@workspace/ormi-plugins`. The manager is taken
 *   as the structural {@link SubscriptionManagerLike} interface (satisfied by
 *   the real `PluginsManager`) for unit-testability and to avoid a dependency
 *   edge from `utils` into the plugin/core packages.
 * - SSR-safe: logic only, no browser globals; nothing runs until a client
 *   provider calls {@link getDatasourceSubscriptionRegistry} with a real manager.
 *
 * Hook-name decoupling decision: the `DATASOURCE_READY` / `DATASOURCE_DISPOSED`
 * hook names default to the `PluginsHooks` enum *string values*
 * (`"datasource-ready"` / `"datasource-disposed"`) but are accepted via the
 * {@link RegistryOptions} `options` param. This keeps `@workspace/utils` free of
 * any `ormi-plugins`/`ormi-core` dependency edge while still letting a caller
 * inject the canonical enum values if they ever change.
 */

import { metrics, type CounterId, type RingId } from "./metrics/metrics-core";
import { createTopicKey, type TopicKeyInput } from "./topic-key";

/**
 * A selected topic as consumed by the registry. Structurally compatible with
 * `SelectedTopic` from `@workspace/ormi-core` (which carries `source.id`,
 * `topic`, and `property`), kept decoupled here.
 */
export type RegistryTopic = TopicKeyInput;

/** Default datasource-lifecycle hook names — the `PluginsHooks` string values. */
const DEFAULT_DATASOURCE_READY_HOOK = "datasource-ready";
const DEFAULT_DATASOURCE_DISPOSED_HOOK = "datasource-disposed";

/** Hook-name helpers — mirror the datasource wire protocol exactly. */
export const subscribeHook = (dsId: string): string => `${dsId}-subscribe`;
export const unsubscribeHook = (dsId: string): string => `${dsId}-unsubscribe`;
export const publishedHook = (dsId: string, topic: string): string =>
	`${dsId}-${topic}-published`;
export const advertiseHook = (dsId: string): string => `${dsId}-advertise`;
export const unadvertiseHook = (dsId: string): string => `${dsId}-unadvertise`;

/** Action descriptor accepted by {@link SubscriptionManagerLike.addAction}. */
export interface ManagerAction {
	id: string;
	priority: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	action: (...args: any[]) => void;
}

/**
 * Structural subset of `PluginsManager` the registry depends on.
 *
 * The real `PluginsManager` satisfies this interface. The registry never calls
 * `WaitAndDoAction` / `WaitForActionToExist`: it waits on `DATASOURCE_READY`
 * events instead of polling for a subscribe hook to appear.
 */
export interface SubscriptionManagerLike {
	addAction(name: string, action: ManagerAction): void;
	removeAction(id: string): void;
	/** Returns `true` if at least one action handled the event (vs none registered yet). */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	doAction(name: string, ...args: any[]): boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	applyFilterAsync<T>(name: string, ...args: any[]): Promise<T>;
}

/** Options for customising registry behaviour (primarily for decoupling/tests). */
export interface RegistryOptions {
	/** Hook name for the datasource-ready lifecycle event. */
	readyHook?: string;
	/** Hook name for the datasource-disposed lifecycle event. */
	disposedHook?: string;
}

/** Callback invoked per published message for a subscribe intent. */
export type OnDataCallback = (
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any,
	time: number,
	referenceFrameId: string,
) => void;

/** A widget's declared intent to receive data for a topic. */
export interface SubscribeIntent {
	/** Topic to subscribe to (carries `source.id`, `topic`, `property`). */
	topic: RegistryTopic;
	/** Invoked for every published message on the topic. */
	onData: OnDataCallback;
}

/** Handle returned by {@link DatasourceSubscriptionRegistry.subscribe}. */
export interface SubscriptionHandle {
	/** Release the intent. Idempotent. */
	unsubscribe(): void;
}

/** Handle returned by {@link DatasourceSubscriptionRegistry.advertise}. */
export interface AdvertiseHandle {
	/** Release the advertise intent. Idempotent. */
	unadvertise(): void;
}

/** Public registry surface. */
export interface DatasourceSubscriptionRegistry {
	/** Declare a subscribe intent. Idempotent / StrictMode-safe. */
	subscribe(intent: SubscribeIntent): SubscriptionHandle;
	/** Declare an advertise intent for a publisher topic. */
	advertise(topic: RegistryTopic): AdvertiseHandle;
	/** Tear down lifecycle listeners. For tests; not called in normal operation. */
	dispose(): void;
}

/** Per-wire-key subscribe state. */
type WireState = "idle" | "pending" | "subscribed";

/** Internal per-wire-key subscribe record (keyed by `dsId::topic::property`). */
interface WireEntry {
	dsId: string;
	topic: RegistryTopic;
	/** Live intent fanout: intentId → onData. Size === wire refcount. */
	fanout: Map<number, OnDataCallback>;
	wireState: WireState;
	/** Bumped on every wire transition; guards in-flight/unmount races. */
	generation: number;
	/** Whether the per-wire-key `published` action is currently registered. */
	publishedRegistered: boolean;
	/** Counter id for `wire.<key>.delivered` — one add per delivered message. */
	deliveredId: CounterId;
	/** Gauge id for `wire.<key>.fanout` — set to `fanout.size` on every change. */
	fanoutId: CounterId;
	/**
	 * Ring id for `wire.<key>.latencyMs` — per-topic end-to-end latency
	 * (publisher `time` → registry fanout). Written only while `metrics.heavy`,
	 * 1-in-32 sampled, so each topic reports its own p50/p95/p99/max instead of
	 * being smeared into one aggregate dominated by the highest-rate wire.
	 */
	latencyId: RingId;
	/** Message sequence for 1-in-32 heavy-tier latency sampling. */
	sampleSeq: number;
}

/** Per-advertise-key record (keyed by `dsId::topic::property`). */
interface AdvertiseEntry {
	dsId: string;
	topic: RegistryTopic;
	/** Number of live advertise intents on this key. */
	refcount: number;
	advertiseState: WireState;
	generation: number;
}

class Registry implements DatasourceSubscriptionRegistry {
	private readonly manager: SubscriptionManagerLike;
	private readonly readyHook: string;
	private readonly disposedHook: string;

	/** Wire keys grouped per datasource id, for efficient READY/DISPOSED re-flush. */
	private readonly wires = new Map<string, WireEntry>();
	private readonly advertisements = new Map<string, AdvertiseEntry>();

	/** Datasources currently READY (driven by the registry's own listeners). */
	private readonly readyDatasources = new Set<string>();

	/** Monotonic intent id allocator. */
	private nextIntentId = 1;

	private disposed = false;

	private readonly readyListener = (dsId: string) =>
		this.handleDatasourceReady(dsId);
	private readonly disposedListener = (dsId: string) =>
		this.handleDatasourceDisposed(dsId);

	constructor(manager: SubscriptionManagerLike, options?: RegistryOptions) {
		this.manager = manager;
		this.readyHook = options?.readyHook ?? DEFAULT_DATASOURCE_READY_HOOK;
		this.disposedHook =
			options?.disposedHook ?? DEFAULT_DATASOURCE_DISPOSED_HOOK;

		// Register lifecycle listeners ONCE. Ids are distinct from the global
		// provider's `global-datasources-ready-tracker` / `-disposed-tracker`
		// to avoid a duplicate-id collision.
		this.manager.addAction(this.readyHook, {
			id: "registry-ready-listener",
			priority: 10,
			action: this.readyListener,
		});
		this.manager.addAction(this.disposedHook, {
			id: "registry-disposed-listener",
			priority: 10,
			action: this.disposedListener,
		});
	}

	// --- Subscribe path ---------------------------------------------------

	subscribe(intent: SubscribeIntent): SubscriptionHandle {
		const { topic, onData } = intent;
		const key = createTopicKey(topic);
		const dsId = topic.source.id;
		const intentId = this.nextIntentId++;

		let entry = this.wires.get(key);
		if (!entry) {
			entry = {
				dsId,
				topic,
				fanout: new Map(),
				wireState: "idle",
				generation: 0,
				publishedRegistered: false,
				deliveredId: metrics.counter(`wire.${key}.delivered`),
				fanoutId: metrics.counter(`wire.${key}.fanout`),
				latencyId: metrics.ring(`wire.${key}.latencyMs`),
				sampleSeq: 0,
			};
			this.wires.set(key, entry);
		}

		const wasEmpty = entry.fanout.size === 0;
		entry.fanout.set(intentId, onData);
		metrics.set(entry.fanoutId, entry.fanout.size);

		// 0 → 1 transition: register the per-wire-key published action and, if
		// the datasource is already READY, fire `-subscribe`. Otherwise the
		// intent simply waits for READY — no polling, no timeout.
		if (wasEmpty) {
			entry.generation++;
			this.registerPublishedAction(entry, key);
			if (this.readyDatasources.has(dsId)) {
				this.fireSubscribe(entry);
			} else {
				entry.wireState = "idle";
			}
		}

		let released = false;
		return {
			unsubscribe: () => {
				if (released) return; // idempotent — safe under double-invoke
				released = true;
				this.releaseIntent(key, intentId);
			},
		};
	}

	/** Register the single per-wire-key `published` action (remove-before-add). */
	private registerPublishedAction(entry: WireEntry, key: string): void {
		const { dsId, topic } = entry;
		const actionId = `registry::${dsId}::${topic.topic}::${topic.property ?? ""}-published`;

		// remove-before-add defends against a lingering stale id from a prior
		// torn-down cycle (StrictMode / rapid remount).
		this.manager.removeAction(actionId);
		this.manager.addAction(publishedHook(dsId, topic.topic), {
			id: actionId,
			priority: 10,
			action: (
				value: unknown,
				time: number,
				referenceFrameId: string,
			) => {
				// Fan out to every live intent on this wire key.
				const live = this.wires.get(key);
				if (!live) return;
				metrics.add(live.deliveredId);
				if (metrics.heavy && (live.sampleSeq++ & 31) === 0) {
					metrics.observe(live.latencyId, Date.now() - time);
				}
				live.fanout.forEach((cb) => cb(value, time, referenceFrameId));
			},
		});
		entry.publishedRegistered = true;
	}

	/** Fire `-subscribe` for a wire key and mark it subscribed (only if an action handled it). */
	private fireSubscribe(entry: WireEntry): void {
		// `doAction` is SYNCHRONOUS (see `PluginsManager.doAction`): it runs every
		// registered subscribe action inline and returns only once they are done.
		// There is therefore no await window during which a concurrent transition
		// (release / DISPOSED) could bump `entry.generation`, so no generation
		// guard or transient `"pending"` state is needed here.
		//
		// But the `-subscribe` action may not be registered yet when this fires (the foxglove TF
		// manager mounts as a child of SubscriptionManager — child effect before parent — and the
		// wss worker registers its subscribe action after an async handshake). `doAction` returns
		// `false` in that case; staying "idle" keeps the intent retryable so the re-flush — which
		// the subscribe managers trigger by re-firing DATASOURCE_READY once their action is live —
		// recovers it. Marking "subscribed" unconditionally would strand the wire forever.
		const handled = this.manager.doAction(
			subscribeHook(entry.dsId),
			entry.topic,
		);
		entry.wireState = handled ? "subscribed" : "idle";
	}

	/** Release one intent from a wire key; tear down wire at refcount 0. */
	private releaseIntent(key: string, intentId: number): void {
		const entry = this.wires.get(key);
		if (!entry) return;
		if (!entry.fanout.delete(intentId)) return;
		metrics.set(entry.fanoutId, entry.fanout.size);

		if (entry.fanout.size > 0) {
			// Intermediate refcount change — no wire traffic.
			return;
		}

		// 1 → 0 transition. Bump generation so any in-flight subscribe
		// completion is neutralised, and always fire `-unsubscribe`
		// (plugins are refcount/idempotent and tolerate it), guaranteeing a
		// matching unsubscribe with no leak.
		entry.generation++;
		this.manager.doAction(unsubscribeHook(entry.dsId), entry.topic);

		// Remove the per-wire-key published action.
		const actionId = `registry::${entry.dsId}::${entry.topic.topic}::${entry.topic.property ?? ""}-published`;
		this.manager.removeAction(actionId);
		entry.publishedRegistered = false;
		entry.wireState = "idle";

		this.wires.delete(key);
	}

	// --- Advertise path ---------------------------------------------------

	advertise(topic: RegistryTopic): AdvertiseHandle {
		const key = createTopicKey(topic);
		const dsId = topic.source.id;

		let entry = this.advertisements.get(key);
		if (!entry) {
			entry = {
				dsId,
				topic,
				refcount: 0,
				advertiseState: "idle",
				generation: 0,
			};
			this.advertisements.set(key, entry);
		}

		const wasEmpty = entry.refcount === 0;
		entry.refcount++;

		if (wasEmpty) {
			entry.generation++;
			if (this.readyDatasources.has(dsId)) {
				void this.fireAdvertise(entry);
			} else {
				entry.advertiseState = "idle";
			}
		}

		let released = false;
		return {
			unadvertise: () => {
				if (released) return; // idempotent
				released = true;
				this.releaseAdvertise(key);
			},
		};
	}

	/** Fire `-advertise` (async filter) for an advertise key. */
	private async fireAdvertise(entry: AdvertiseEntry): Promise<void> {
		entry.advertiseState = "pending";
		const generationAtDispatch = entry.generation;
		let advertised = false;
		try {
			// The `-advertise` filter (PublisherManager) returns `true` once the channel is
			// advertised. Any other value means it did NOT take — most importantly, when no
			// `-advertise` filter is registered yet `applyFilterAsync` returns the input topic
			// unchanged (the publisher manager registers its filter *after* DATASOURCE_READY
			// fires). Treating that as success would falsely mark the entry "subscribed" and the
			// READY re-flush — which only retries non-subscribed entries — would never recover,
			// permanently breaking publish. So only "subscribe" on a genuine `true`.
			const result = await this.manager.applyFilterAsync<unknown>(
				advertiseHook(entry.dsId),
				entry.topic,
			);
			advertised = result === true;
		} catch {
			advertised = false;
		}
		if (entry.generation !== generationAtDispatch) return; // superseded
		// Stay "idle" on failure so a later re-flush (e.g. once the publisher's `-advertise`
		// filter is live, which re-fires DATASOURCE_READY) retries.
		entry.advertiseState = advertised ? "subscribed" : "idle";
	}

	private releaseAdvertise(key: string): void {
		const entry = this.advertisements.get(key);
		if (!entry) return;
		if (entry.refcount === 0) return;

		entry.refcount--;
		if (entry.refcount > 0) return;

		// Last advertise intent gone — bump generation and unadvertise.
		entry.generation++;
		this.manager.doAction(unadvertiseHook(entry.dsId), entry.topic);
		entry.advertiseState = "idle";
		this.advertisements.delete(key);
	}

	// --- Lifecycle re-flush ----------------------------------------------

	private handleDatasourceReady(dsId: string): void {
		if (this.disposed) return;
		this.readyDatasources.add(dsId);

		// Re-issue subscribe for every live wire of this ds that isn't already
		// subscribed — exactly once (the `wireState` gate makes repeated READY
		// a no-op). Covers both the first connect and the reconnect re-flush.
		this.wires.forEach((entry) => {
			if (
				entry.dsId === dsId &&
				entry.fanout.size > 0 &&
				entry.wireState !== "subscribed"
			) {
				this.fireSubscribe(entry);
			}
		});

		// Advertise re-flush, so publishers re-advertise on (re)connect.
		this.advertisements.forEach((entry) => {
			if (
				entry.dsId === dsId &&
				entry.refcount > 0 &&
				entry.advertiseState !== "subscribed"
			) {
				void this.fireAdvertise(entry);
			}
		});
	}

	private handleDatasourceDisposed(dsId: string): void {
		if (this.disposed) return;
		this.readyDatasources.delete(dsId);

		// Mark wires/advertisements idle but KEEP intents — the next READY
		// re-subscribes them (reconnect = DISPOSED → READY cycle).
		this.wires.forEach((entry) => {
			if (entry.dsId === dsId && entry.wireState !== "idle") {
				entry.generation++;
				entry.wireState = "idle";
			}
		});
		this.advertisements.forEach((entry) => {
			if (entry.dsId === dsId && entry.advertiseState !== "idle") {
				entry.generation++;
				entry.advertiseState = "idle";
			}
		});
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.manager.removeAction("registry-ready-listener");
		this.manager.removeAction("registry-disposed-listener");
	}
}

/**
 * Module-level singleton store: one registry per `PluginsManager` instance.
 *
 * A `WeakMap` keyed on the manager means intents survive widget remounts
 * (layout changes remount widget trees frequently) without leaking the
 * registry when the manager is garbage-collected. A per-provider instance
 * would lose intent state across remounts and reintroduce the
 * connect-after-mount and reconnect data-loss races.
 */
const registries = new WeakMap<SubscriptionManagerLike, Registry>();

/**
 * Get (or lazily create) the subscription registry for a `PluginsManager`.
 *
 * @param manager - The plugins manager (structural {@link SubscriptionManagerLike}).
 * @param options - Optional hook-name overrides (see {@link RegistryOptions}).
 * @returns The registry singleton bound to this manager instance.
 */
export function getDatasourceSubscriptionRegistry(
	manager: SubscriptionManagerLike,
	options?: RegistryOptions,
): DatasourceSubscriptionRegistry {
	let registry = registries.get(manager);
	if (!registry) {
		registry = new Registry(manager, options);
		registries.set(manager, registry);
	}
	return registry;
}
