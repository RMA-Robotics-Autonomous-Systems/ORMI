/**
 * Unit tests for the intent-based datasource subscription registry.
 *
 * These tests exercise the subscribe/reconnect/teardown race conditions
 * against a hand-rolled `SubscriptionManagerLike` mock — mount-before-connect,
 * connect-after-mount, reconnect re-flush, in-flight teardown, StrictMode
 * double-invoke, and phantom advertise. No React rendering is involved — all the
 * lifecycle logic lives in the registry, so the registry alone proves the
 * behaviour the core providers rely on.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
	getDatasourceSubscriptionRegistry,
	subscribeHook,
	unsubscribeHook,
	publishedHook,
	advertiseHook,
	unadvertiseHook,
	type SubscriptionManagerLike,
	type ManagerAction,
	type RegistryTopic,
} from "../datasource-subscription-registry";

const READY_HOOK = "datasource-ready";
const DISPOSED_HOOK = "datasource-disposed";

interface DoActionCall {
	name: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	args: any[];
}

/**
 * Hand-rolled `SubscriptionManagerLike` mock. Records add/remove/doAction/
 * applyFilterAsync, throws on duplicate action id (mirrors the real manager so
 * register-once is proven), and exposes helpers to emit lifecycle events and
 * to register a refcounting subscribe hook like a real plugin.
 */
class MockManager implements SubscriptionManagerLike {
	actions = new Map<string, Map<string, ManagerAction>>();
	doActionCalls: DoActionCall[] = [];
	applyFilterAsyncCalls: DoActionCall[] = [];
	addActionLog: string[] = [];
	removeActionLog: string[] = [];

	/** Optional deferred mode for advertise filters (B-style async). */
	private deferAdvertise = false;
	private pendingAdvertise: Array<() => void> = [];
	/** Datasources whose `-advertise` filter is NOT yet registered (returns input, not `true`). */
	private advertiseFilterMissing = new Set<string>();

	addAction(name: string, action: ManagerAction): void {
		this.addActionLog.push(action.id);
		let bucket = this.actions.get(name);
		if (!bucket) {
			bucket = new Map();
			this.actions.set(name, bucket);
		}
		if (bucket.has(action.id)) {
			throw new Error(`Action with id ${action.id} already exists`);
		}
		bucket.set(action.id, action);
	}

	removeAction(id: string): void {
		this.removeActionLog.push(id);
		this.actions.forEach((bucket) => {
			bucket.delete(id);
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	doAction(name: string, ...args: any[]): boolean {
		this.doActionCalls.push({ name, args });
		const bucket = this.actions.get(name);
		bucket?.forEach((a) => a.action(...args));
		return bucket !== undefined && bucket.size > 0;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async applyFilterAsync<T>(name: string, ...args: any[]): Promise<T> {
		this.applyFilterAsyncCalls.push({ name, args });
		if (this.deferAdvertise) {
			await new Promise<void>((resolve) =>
				this.pendingAdvertise.push(resolve),
			);
		}
		// Model the real `-advertise` filter: it returns `true` once registered, and when no
		// filter is registered `applyFilterAsync` passes the input through unchanged.
		if (name.endsWith("-advertise")) {
			const dsId = name.slice(0, -"-advertise".length);
			return (
				this.advertiseFilterMissing.has(dsId) ? args[0] : true
			) as T;
		}
		return args[0] as T;
	}

	/** Toggle whether a datasource's `-advertise` filter is registered yet. */
	setAdvertiseFilterMissing(dsId: string, missing: boolean): void {
		if (missing) this.advertiseFilterMissing.add(dsId);
		else this.advertiseFilterMissing.delete(dsId);
	}

	// --- test helpers ---

	emitReady(dsId: string): void {
		this.doAction(READY_HOOK, dsId);
	}

	emitDisposed(dsId: string): void {
		this.doAction(DISPOSED_HOOK, dsId);
	}

	/** Simulate a plugin's refcounting `-subscribe`/`-unsubscribe` hooks. */
	registerSubscribeHook(dsId: string): { count: () => number } {
		let count = 0;
		this.addAction(subscribeHook(dsId), {
			id: `mock-${dsId}-subscribe`,
			priority: 10,
			action: () => {
				count++;
			},
		});
		this.addAction(unsubscribeHook(dsId), {
			id: `mock-${dsId}-unsubscribe`,
			priority: 10,
			action: () => {
				count = Math.max(0, count - 1);
			},
		});
		return { count: () => count };
	}

	/** Feed a published message into whatever published action is registered. */
	emitPublished(
		dsId: string,
		topic: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		value: any,
		time: number,
		referenceFrameId: string,
	): void {
		this.doAction(
			publishedHook(dsId, topic),
			value,
			time,
			referenceFrameId,
		);
	}

	enableDeferredAdvertise(): void {
		this.deferAdvertise = true;
	}

	resolvePendingAdvertise(): void {
		const pending = this.pendingAdvertise;
		this.pendingAdvertise = [];
		pending.forEach((r) => r());
	}

	countDoActions(name: string): number {
		return this.doActionCalls.filter((c) => c.name === name).length;
	}
}

const topic = (dsId: string, name: string, property = ""): RegistryTopic => ({
	source: { id: dsId },
	topic: name,
	property,
});

let manager: MockManager;

beforeEach(() => {
	manager = new MockManager();
});

describe("datasource-subscription-registry", () => {
	test("intent registered before ready: no -subscribe until READY, then exactly one", () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");

		reg.subscribe({ topic: topic("ds1", "/odom"), onData: () => {} });
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(0);

		manager.emitReady("ds1");
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);

		reg.dispose();
	});

	test("`-subscribe` action registered AFTER READY: wire parked (not falsely subscribed), retried once the action re-fires READY", () => {
		// The foxglove TF manager mounts as a child of SubscriptionManager (child effect before
		// parent), and the wss worker registers its subscribe action after an async handshake —
		// so `-subscribe` can be absent when the registry fires it on READY. The wire must stay
		// retryable, not be falsely marked subscribed (which would strand TF forever).
		const reg = getDatasourceSubscriptionRegistry(manager);

		const received: unknown[] = [];
		reg.subscribe({
			topic: topic("ds1", "/tf"),
			onData: (v) => received.push(v),
		});

		// READY fires while no `-subscribe` action exists yet → one attempt, but not subscribed.
		manager.emitReady("ds1");
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);

		// The SubscriptionManager registers its `-subscribe` action and re-fires READY.
		manager.registerSubscribeHook("ds1");
		manager.emitReady("ds1");
		// The re-flush retried against the live action and it took.
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(2);

		// Now genuinely subscribed: a further READY does not re-subscribe, and data flows.
		manager.emitReady("ds1");
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(2);
		manager.emitPublished("ds1", "/tf", { transforms: [] }, 1, "map");
		expect(received).toEqual([{ transforms: [] }]);

		reg.dispose();
	});

	test("onData wired: published action registered once, fans out to all intents", () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");

		const received: Array<[unknown, number, string]> = [];
		reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: (v, t, f) => received.push([v, t, f]),
		});
		manager.emitReady("ds1");

		// Exactly one published action registered for this wire key.
		const publishedBucket = manager.actions.get(
			publishedHook("ds1", "/odom"),
		);
		expect(publishedBucket?.size).toBe(1);

		manager.emitPublished("ds1", "/odom", { x: 1 }, 100, "map");
		expect(received).toEqual([[{ x: 1 }, 100, "map"]]);

		reg.dispose();
	});

	test("re-subscribes exactly once after a disconnect/reconnect, and a duplicate ready event is a no-op", () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");

		reg.subscribe({ topic: topic("ds1", "/odom"), onData: () => {} });
		manager.emitReady("ds1");
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);

		// Extra READY without DISPOSED fires no extra subscribe.
		manager.emitReady("ds1");
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);

		// Reconnect cycle: DISPOSED then READY re-subscribes exactly once.
		manager.emitDisposed("ds1");
		manager.emitReady("ds1");
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(2);

		// And again, a stray READY is still a no-op.
		manager.emitReady("ds1");
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(2);

		reg.dispose();
	});

	test("Refcount — 3 subscribes = one -subscribe; release 2 = zero; release last = one -unsubscribe + published removed", () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");
		manager.emitReady("ds1");

		const h1 = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		const h2 = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		const h3 = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});

		// One wire subscribe for three intents on the same key.
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);

		h1.unsubscribe();
		h2.unsubscribe();
		expect(manager.countDoActions(unsubscribeHook("ds1"))).toBe(0);

		h3.unsubscribe();
		expect(manager.countDoActions(unsubscribeHook("ds1"))).toBe(1);

		// Published action removed once refcount hits 0.
		const publishedBucket = manager.actions.get(
			publishedHook("ds1", "/odom"),
		);
		expect(publishedBucket?.size ?? 0).toBe(0);

		reg.dispose();
	});

	test("synchronous subscribe dispatch then immediate unsubscribe: exactly one matching -unsubscribe, no dangling state", () => {
		// Wire `-subscribe` dispatch is synchronous (`doAction`), so a subscribe
		// immediately followed by unsubscribe always produces a matching
		// `-unsubscribe` and leaves no dangling wire/published state. This is the
		// common, non-deferred path; the deferred async-ordering window is
		// exercised by the next test.
		const reg = getDatasourceSubscriptionRegistry(manager);
		const tracker = manager.registerSubscribeHook("ds1");
		manager.emitReady("ds1");

		const h = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);
		expect(tracker.count()).toBe(1);

		h.unsubscribe();
		expect(manager.countDoActions(unsubscribeHook("ds1"))).toBe(1);
		expect(tracker.count()).toBe(0);

		// No dangling published action.
		const publishedBucket = manager.actions.get(
			publishedHook("ds1", "/odom"),
		);
		expect(publishedBucket?.size ?? 0).toBe(0);

		reg.dispose();
	});

	test("re-subscribe after release re-registers cleanly: no dangling wire state from a prior teardown", () => {
		// There is no genuine subscribe-settles-after-unsubscribe window: wire
		// `-subscribe` dispatch is synchronous, so the subscribe effect always
		// completes before the release runs. What remains worth proving is that
		// a 1→0 teardown leaves no dangling registry state — a fresh subscribe on
		// the same key re-registers the published action exactly once (the
		// genuine async-ordering window lives only on the advertise path, proven
		// by "Publisher — DISPOSED mid-advertise").
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");
		manager.emitReady("ds1");

		const h = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		h.unsubscribe();
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);
		expect(manager.countDoActions(unsubscribeHook("ds1"))).toBe(1);
		expect(
			manager.actions.get(publishedHook("ds1", "/odom"))?.size ?? 0,
		).toBe(0);

		// Fresh subscribe re-registers the published action cleanly.
		const h2 = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(2);
		expect(
			manager.actions.get(publishedHook("ds1", "/odom"))?.size ?? 0,
		).toBe(1);
		h2.unsubscribe();

		reg.dispose();
	});

	test("subscribe→unsubscribe→subscribe: addAction never throws; net one wire subscribe", () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");
		manager.emitReady("ds1");

		expect(() => {
			const h1 = reg.subscribe({
				topic: topic("ds1", "/odom"),
				onData: () => {},
			});
			h1.unsubscribe();
			const h2 = reg.subscribe({
				topic: topic("ds1", "/odom"),
				onData: () => {},
			});
			h2.unsubscribe();
		}).not.toThrow();

		// Final state: one live subscribe re-established and then released, no
		// duplicate-id throw, and no lingering published action.
		const finalH = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		const publishedBucket = manager.actions.get(
			publishedHook("ds1", "/odom"),
		);
		expect(publishedBucket?.size).toBe(1);
		finalH.unsubscribe();

		reg.dispose();
	});

	test("StrictMode double mount: refcount 1→2→1 never re-fires subscribe and never throws", () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");
		manager.emitReady("ds1");

		const h1 = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		const h2 = reg.subscribe({
			topic: topic("ds1", "/odom"),
			onData: () => {},
		});
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(1);

		h2.unsubscribe();
		// Still one live intent → no unsubscribe yet.
		expect(manager.countDoActions(unsubscribeHook("ds1"))).toBe(0);

		h1.unsubscribe();
		expect(manager.countDoActions(unsubscribeHook("ds1"))).toBe(1);

		reg.dispose();
	});

	test("Publisher — advertise before READY: no applyFilterAsync until READY; DISPOSED→READY re-advertise once; unadvertise on last handle", async () => {
		const reg = getDatasourceSubscriptionRegistry(manager);

		const h = reg.advertise(topic("ds1", "/cmd_vel"));
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(0);

		manager.emitReady("ds1");
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(1);

		// Reconnect: DISPOSED then READY re-advertises exactly once.
		manager.emitDisposed("ds1");
		manager.emitReady("ds1");
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(2);

		// Extra READY → no re-advertise.
		manager.emitReady("ds1");
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(2);

		h.unadvertise();
		expect(manager.countDoActions(unadvertiseHook("ds1"))).toBe(1);

		reg.dispose();
	});

	test("Publisher — `-advertise` filter registered AFTER READY: parked (not falsely subscribed), retried once the filter re-fires READY", async () => {
		// Reproduces the keyboard-publisher failure: DATASOURCE_READY fires (connection) BEFORE
		// the PublisherManager registers its `-advertise` filter. The first advertise attempt
		// finds no filter (applyFilterAsync returns the input, not `true`) and must NOT be left
		// falsely "subscribed" — otherwise the READY re-flush never retries and publish() dies.
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.setAdvertiseFilterMissing("ds1", true);

		reg.advertise(topic("ds1", "/cmd_vel"));
		manager.emitReady("ds1");
		await Promise.resolve();
		// One attempt, but the filter wasn't there → entry stays retryable.
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(1);

		// PublisherManager registers its `-advertise` filter and re-fires READY.
		manager.setAdvertiseFilterMissing("ds1", false);
		manager.emitReady("ds1");
		await Promise.resolve();
		// The re-flush retried against the live filter and it took.
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(2);

		// Now genuinely subscribed: a further READY does not re-advertise (no infinite re-flush).
		manager.emitReady("ds1");
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(2);

		reg.dispose();
	});

	test("Publisher — DISPOSED mid-advertise: in-flight advertise is neutralised by the generation guard, then re-advertises on next READY", async () => {
		// The generation token only does real work on the async advertise path.
		// Drive it end to end: advertise → READY dispatches an advertise that
		// SUSPENDS in `applyFilterAsync`; DISPOSED arrives while suspended
		// (bumping generation, resetting advertise state to idle); the pending
		// advertise then resolves but the post-await generation guard must NOT
		// mark it advertised (no phantom advertised state); a fresh READY must
		// re-advertise, for a total of exactly two advertise dispatches ending
		// in the advertised state.
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.enableDeferredAdvertise();

		reg.advertise(topic("ds1", "/cmd_vel"));

		// First READY → advertise dispatched, suspended in applyFilterAsync.
		manager.emitReady("ds1");
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(1);

		// DISPOSED while the advertise is still in flight: bumps generation and
		// resets advertise state to idle.
		manager.emitDisposed("ds1");

		// Resolve the now-stale advertise. The post-await generation guard must
		// drop it — state must NOT become advertised (no phantom publisher).
		manager.resolvePendingAdvertise();
		await Promise.resolve();
		await Promise.resolve();

		// A fresh READY must re-advertise (state was correctly left idle by the
		// guard), giving exactly two advertise dispatches in total.
		manager.emitReady("ds1");
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(2);

		// Resolve the second advertise so it lands in the advertised state, and
		// confirm a stray READY does not re-advertise (proves it ended advertised).
		manager.resolvePendingAdvertise();
		await Promise.resolve();
		await Promise.resolve();
		manager.emitReady("ds1");
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(2);

		reg.dispose();
	});

	test("Publisher — advertise refcount: 2 intents = 1 advertise, unadvertise on last only", async () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.emitReady("ds1");

		const h1 = reg.advertise(topic("ds1", "/cmd_vel"));
		const h2 = reg.advertise(topic("ds1", "/cmd_vel"));
		await Promise.resolve();
		expect(
			manager.applyFilterAsyncCalls.filter(
				(c) => c.name === advertiseHook("ds1"),
			).length,
		).toBe(1);

		h1.unadvertise();
		expect(manager.countDoActions(unadvertiseHook("ds1"))).toBe(0);
		h2.unadvertise();
		expect(manager.countDoActions(unadvertiseHook("ds1"))).toBe(1);

		reg.dispose();
	});

	test("Listeners — registered once; dispose() removes them; duplicate-id throw is mirrored", () => {
		// First creation registers the two listeners exactly once.
		const reg = getDatasourceSubscriptionRegistry(manager);
		expect(
			manager.actions.get(READY_HOOK)?.has("registry-ready-listener"),
		).toBe(true);
		expect(
			manager.actions
				.get(DISPOSED_HOOK)
				?.has("registry-disposed-listener"),
		).toBe(true);
		expect(
			manager.addActionLog.filter(
				(id) => id === "registry-ready-listener",
			).length,
		).toBe(1);

		// Singleton: second call does NOT register again (would throw on dup id).
		const reg2 = getDatasourceSubscriptionRegistry(manager);
		expect(reg2).toBe(reg);
		expect(
			manager.addActionLog.filter(
				(id) => id === "registry-ready-listener",
			).length,
		).toBe(1);

		reg.dispose();
		expect(
			manager.actions.get(READY_HOOK)?.has("registry-ready-listener"),
		).toBe(false);
		expect(
			manager.actions
				.get(DISPOSED_HOOK)
				?.has("registry-disposed-listener"),
		).toBe(false);
	});

	test("Listener ids do not collide with the global provider trackers", () => {
		getDatasourceSubscriptionRegistry(manager);
		expect(manager.addActionLog).toContain("registry-ready-listener");
		expect(manager.addActionLog).toContain("registry-disposed-listener");
		expect(manager.addActionLog).not.toContain(
			"global-datasources-ready-tracker",
		);
		expect(manager.addActionLog).not.toContain(
			"global-datasources-disposed-tracker",
		);
	});

	test("Property-keyed dedupe: same topic, different property → two wire keys", () => {
		const reg = getDatasourceSubscriptionRegistry(manager);
		manager.registerSubscribeHook("ds1");
		manager.emitReady("ds1");

		reg.subscribe({
			topic: topic("ds1", "/odom", "pose.position"),
			onData: () => {},
		});
		reg.subscribe({
			topic: topic("ds1", "/odom", "twist.linear"),
			onData: () => {},
		});

		// Two distinct published-action ids registered for the same topic.
		const bucket = manager.actions.get(publishedHook("ds1", "/odom"));
		expect(bucket?.size).toBe(2);
		// Two wire subscribes (one per property key).
		expect(manager.countDoActions(subscribeHook("ds1"))).toBe(2);

		reg.dispose();
	});
});
