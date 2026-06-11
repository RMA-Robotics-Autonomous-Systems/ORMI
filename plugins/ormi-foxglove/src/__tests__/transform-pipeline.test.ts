/**
 * Full transform pipeline tests for the Foxglove plugin.
 *
 * Simulates a connection: a real PluginsManager, the transform manager's subscribe + handler
 * registration, and message delivery on the `${ds}-${topic}-published` hooks — then asserts the
 * shared transform table is populated correctly (ROS→THREE conversion, namespacing, stamp,
 * static/dynamic, per-source isolation). This exercises the real manager code end to end without
 * a WebSocket, so a broken link between "message arrives" and "table populated" is caught here.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PluginsManager } from "@workspace/ormi-plugins";
import {
	getTransformTable,
	clearAllTransforms,
	subscribeToTransforms,
	__setFrameScheduler,
	type FrameScheduler,
} from "@workspace/ormi-core/transforms";
import {
	applyFoxgloveTransformMessage,
	setupFoxgloveTransformManager,
} from "../transform-tree-manager";
import type { FoxgloveDataSourceSettings } from "../types";

const K = (source: string, frame: string) => `${source}::${frame}`;

/** A ROS2-shaped TransformStamped (note `nanosec`, as Foxglove delivers it). */
function ros2Tf(
	frame: string,
	child: string,
	pos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
) {
	return {
		header: { frame_id: frame, stamp: { sec: 100, nanosec: 250_000_000 } },
		child_frame_id: child,
		transform: {
			translation: pos,
			rotation: { x: 0, y: 0, z: 0, w: 1 },
		},
	};
}

function settings(
	id: string,
	transformTreeTopics: string[] = ["/tf", "/tf_static"],
): FoxgloveDataSourceSettings {
	return {
		id,
		enable: true,
		transformTreeTopics,
	} as unknown as FoxgloveDataSourceSettings;
}

/** A manager with no-op subscribe/unsubscribe actions; records the subscribed topics. */
function managerWithSubscribe(datasourceId: string, recorder: string[]) {
	const pm = new PluginsManager(new Map());
	pm.addAction(`${datasourceId}-subscribe`, {
		id: `${datasourceId}-subscribe`,
		priority: 10,
		action: (topic: { topic: string }) => recorder.push(topic.topic),
	});
	pm.addAction(`${datasourceId}-unsubscribe`, {
		id: `${datasourceId}-unsubscribe`,
		priority: 10,
		action: () => {},
	});
	return pm;
}

/** A frame scheduler whose callbacks run only on `flush()` (simulates the browser's rAF). */
function makeFakeScheduler() {
	const queue: Array<{ handle: number; cb: () => void }> = [];
	let next = 1;
	const scheduler: FrameScheduler = {
		schedule: (cb) => {
			const handle = next++;
			queue.push({ handle, cb });
			return handle;
		},
		cancel: (handle) => {
			const i = queue.findIndex((q) => q.handle === handle);
			if (i >= 0) queue.splice(i, 1);
		},
	};
	return {
		scheduler,
		flush: () => queue.splice(0).forEach((q) => q.cb()),
	};
}

describe("Foxglove TF pipeline", () => {
	beforeEach(() => clearAllTransforms());

	test("converts ROS→THREE, namespaces by source, and reads the ROS2 nanosec stamp", () => {
		applyFoxgloveTransformMessage(
			"ds1",
			{ transforms: [ros2Tf("map", "odom", { x: 1, y: 2, z: 3 })] },
			false,
		);

		const edge = getTransformTable().get(K("ds1", "odom"));
		expect(edge).toBeDefined();
		expect(edge?.parentId).toBe(K("ds1", "map"));
		expect(edge?.transform.convention).toBe("THREE");
		// 100 s + 250_000_000 ns — regression guard for the nanosec/nsec stamp bug.
		expect(edge?.stamp).toBeCloseTo(100.25, 6);
	});

	test("end to end: manager subscribes, then delivered messages populate the table", async () => {
		const subscribed: string[] = [];
		const pm = managerWithSubscribe("ds1", subscribed);

		const cleanup = setupFoxgloveTransformManager(pm, settings("ds1"));

		// The manager waits for the `*-subscribe` action (polled at 100 ms) before subscribing,
		// so the subscribe lands shortly after mount rather than synchronously.
		await new Promise<void>((resolve) => setTimeout(resolve, 250));
		expect(subscribed).toContain("/tf");
		expect(subscribed).toContain("/tf_static");

		// Simulate the connection delivering messages on the published hooks.
		pm.doAction(
			"ds1-/tf-published",
			{ transforms: [ros2Tf("map", "odom", { x: 1, y: 0, z: 0 })] },
			Date.now(),
			"map",
		);
		pm.doAction(
			"ds1-/tf_static-published",
			{
				transforms: [
					ros2Tf("base_link", "laser", { x: 0, y: 0, z: 0.2 }),
				],
			},
			Date.now(),
			"base_link",
		);

		const table = getTransformTable();
		expect(table.has(K("ds1", "odom"))).toBe(true);
		expect(table.get(K("ds1", "odom"))?.isStatic).toBe(false);
		expect(table.has(K("ds1", "laser"))).toBe(true);
		expect(table.get(K("ds1", "laser"))?.isStatic).toBe(true);

		// Cleanup drops dynamic edges; static is retained (for remount).
		cleanup();
		expect(getTransformTable().has(K("ds1", "odom"))).toBe(false);
		expect(getTransformTable().has(K("ds1", "laser"))).toBe(true);
	});

	test("two sources with identical frame names stay independent", () => {
		const pmA = managerWithSubscribe("robotA", []);
		const pmB = managerWithSubscribe("robotB", []);
		setupFoxgloveTransformManager(pmA, settings("robotA"));
		setupFoxgloveTransformManager(pmB, settings("robotB"));

		pmA.doAction("robotA-/tf-published", {
			transforms: [ros2Tf("map", "base_link", { x: 1, y: 0, z: 0 })],
		});
		pmB.doAction("robotB-/tf-published", {
			transforms: [ros2Tf("map", "base_link", { x: 9, y: 0, z: 0 })],
		});

		const table = getTransformTable();
		expect(table.size).toBe(2);
		expect(table.has(K("robotA", "base_link"))).toBe(true);
		expect(table.has(K("robotB", "base_link"))).toBe(true);
	});

	test("a datasource with no transformTreeTopics subscribes to nothing (likely cause of 'no transforms received')", () => {
		const subscribed: string[] = [];
		const pm = managerWithSubscribe("ds2", subscribed);

		setupFoxgloveTransformManager(pm, settings("ds2", []));

		// Nothing subscribed → no handlers → a delivered message is ignored.
		expect(subscribed).toEqual([]);
		pm.doAction("ds2-/tf-published", {
			transforms: [ros2Tf("map", "odom")],
		});
		expect(getTransformTable().size).toBe(0);
	});

	describe("mount-order race (subscribe action registered after the manager)", () => {
		const sleep = (ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms));

		/** Register a recording subscribe/unsubscribe action on an existing manager. */
		function registerSubscribe(
			pm: PluginsManager,
			datasourceId: string,
			recorder: string[],
		) {
			pm.addAction(`${datasourceId}-subscribe`, {
				id: `${datasourceId}-subscribe`,
				priority: 10,
				action: (topic: { topic: string }) =>
					recorder.push(topic.topic),
			});
			pm.addAction(`${datasourceId}-unsubscribe`, {
				id: `${datasourceId}-unsubscribe`,
				priority: 10,
				action: () => {},
			});
		}

		// Reproduces production: React fires the child TransformTreeManager effect BEFORE the
		// parent SubscriptionManager registers `*-subscribe`. With a plain `doAction` the subscribe
		// hit "No action found" and was dropped, starving the table. The manager must instead wait
		// for the action and subscribe once it appears.
		test("subscribe still lands when the action registers after the manager mounts", async () => {
			const subscribed: string[] = [];
			const pm = new PluginsManager(new Map());

			// Manager runs while the subscribe action does NOT exist yet.
			setupFoxgloveTransformManager(pm, settings("ds1"));
			expect(subscribed).toEqual([]); // nothing subscribed — action absent

			// Parent registers the action slightly later (real mount order).
			registerSubscribe(pm, "ds1", subscribed);

			// WaitForActionToExist polls at 100 ms — give it a couple of cycles.
			await sleep(250);

			expect(subscribed).toContain("/tf");
			expect(subscribed).toContain("/tf_static");
		});

		// A manager unmounted while still waiting must NOT subscribe afterwards, or a late
		// subscribe would land after the cleanup's unsubscribe (dangling subscription).
		test("a manager unmounted before the action registers does not subscribe", async () => {
			const subscribed: string[] = [];
			const pm = new PluginsManager(new Map());

			const cleanup = setupFoxgloveTransformManager(pm, settings("ds1"));
			cleanup(); // unmount during the wait, before the action exists

			registerSubscribe(pm, "ds1", subscribed);
			await sleep(250);

			expect(subscribed).toEqual([]); // aborted — never subscribed late
		});
	});

	describe("async reactivity (browser-faithful)", () => {
		let fake: ReturnType<typeof makeFakeScheduler>;

		beforeEach(() => {
			clearAllTransforms();
			fake = makeFakeScheduler();
			__setFrameScheduler(fake.scheduler);
		});
		afterEach(() => {
			__setFrameScheduler(null);
			clearAllTransforms();
		});

		test("a delivered message populates the table and notifies consumers immediately (leading edge)", () => {
			const pm = managerWithSubscribe("ds1", []);
			setupFoxgloveTransformManager(pm, settings("ds1"));

			let notified = 0;
			const unsub = subscribeToTransforms(() => {
				notified++;
			});

			pm.doAction("ds1-/tf-published", {
				transforms: [ros2Tf("map", "odom", { x: 1, y: 0, z: 0 })],
			});

			// Table AND notification land synchronously: the first change after a quiet period
			// must never hang on a timer (a dropped timer used to freeze the whole TF UI).
			expect(getTransformTable().has(K("ds1", "odom"))).toBe(true);
			expect(notified).toBe(1);

			unsub();
		});

		test("a burst of messages coalesces to a leading + one trailing notification", () => {
			const pm = managerWithSubscribe("ds1", []);
			setupFoxgloveTransformManager(pm, settings("ds1"));

			let notified = 0;
			const unsub = subscribeToTransforms(() => {
				notified++;
			});

			for (let i = 0; i < 50; i++) {
				pm.doAction("ds1-/tf-published", {
					transforms: [ros2Tf("map", "odom", { x: i, y: 0, z: 0 })],
				});
			}

			// First message notified synchronously; the other 49 coalesced into one pending bump.
			expect(notified).toBe(1);
			fake.flush();
			expect(notified).toBe(2); // 50 messages → 2 notifications total

			unsub();
		});
	});
});
