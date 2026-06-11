/**
 * Async reactivity tests — exercises the browser-path contract: the FIRST change after a quiet
 * period bumps the version synchronously (leading edge — no timer can drop it); rapid follow-up
 * changes coalesce into a single trailing bump; a stuck trailing bump is force-committed by the
 * next incoming message (watchdog). The default scheduler is synchronous under bun (no browser),
 * so these tests inject a controllable scheduler to drive the trailing path explicitly.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
	__setFrameScheduler,
	processTFMessage,
	clearAllTransforms,
	getTransformTable,
	subscribeToTransforms,
	transformStore,
	transformVersionAtom,
	type FrameScheduler,
	type TFMessage,
} from "../transform-atoms";

/** A frame scheduler whose callbacks run only when `flush()` is called. */
function makeFakeScheduler() {
	const queue: Array<{ handle: number; cb: () => void }> = [];
	let nextHandle = 1;
	const scheduler: FrameScheduler = {
		schedule: (cb) => {
			const handle = nextHandle++;
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
		pending: () => queue.length,
		flush: () => queue.splice(0).forEach((q) => q.cb()),
	};
}

function tf(
	frame: string,
	child: string,
	pos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
): TFMessage {
	return {
		transforms: [
			{
				header: { frame_id: frame },
				child_frame_id: child,
				transform: {
					translation: pos,
					rotation: { x: 0, y: 0, z: 0, w: 1 },
				},
			},
		],
	};
}

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("Transform reactivity (leading edge + trailing coalesce)", () => {
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

	test("the first change after a quiet period bumps synchronously — no timer involved", () => {
		const v0 = transformStore.get(transformVersionAtom);

		processTFMessage("ds", tf("map", "odom"));

		// Data AND version are visible immediately: consumers can never be stranded on a
		// stale snapshot by a dropped timer, because the leading bump doesn't use one.
		expect(getTransformTable().has("ds::odom")).toBe(true);
		expect(transformStore.get(transformVersionAtom)).toBe(v0 + 1);
		expect(fake.pending()).toBe(0);
	});

	test("subscribers are notified synchronously on the leading edge", () => {
		let notified = 0;
		const unsub = subscribeToTransforms(() => {
			notified++;
		});

		processTFMessage("ds", tf("map", "odom"));
		expect(notified).toBe(1); // immediate — this is the load-bearing guarantee

		unsub();
	});

	test("rapid follow-up changes coalesce into a single trailing bump", () => {
		const v0 = transformStore.get(transformVersionAtom);

		// Leading bump (sync).
		processTFMessage("ds", tf("map", "odom", { x: 1, y: 0, z: 0 }));
		expect(transformStore.get(transformVersionAtom)).toBe(v0 + 1);

		// Within the coalescing window: deferred to one trailing bump, not two more.
		processTFMessage("ds", tf("map", "odom", { x: 2, y: 0, z: 0 }));
		processTFMessage("ds", tf("odom", "base_link"));
		expect(fake.pending()).toBe(1);
		expect(transformStore.get(transformVersionAtom)).toBe(v0 + 1);

		// Data is in the table regardless — only the notification is deferred.
		expect(getTransformTable().size).toBe(2);
		expect(getTransformTable().get("ds::odom")?.transform.position.x).toBe(
			2,
		);

		fake.flush();
		expect(transformStore.get(transformVersionAtom)).toBe(v0 + 2);
	});

	test("a clear bumps synchronously and cancels any pending trailing bump", () => {
		processTFMessage("ds", tf("map", "odom", { x: 1, y: 0, z: 0 })); // leading (sync)
		processTFMessage("ds", tf("map", "odom", { x: 2, y: 0, z: 0 })); // trailing (pending)
		expect(fake.pending()).toBe(1);

		const vBefore = transformStore.get(transformVersionAtom);
		clearAllTransforms();

		expect(fake.pending()).toBe(0); // pending trailing bump cancelled
		expect(transformStore.get(transformVersionAtom)).toBe(vBefore + 1);
		expect(getTransformTable().size).toBe(0);
	});

	test("watchdog: a stuck trailing bump is force-committed by later traffic, even epsilon-equal", async () => {
		// Reproduces the production freeze: topology lands while a trailing bump is pending,
		// the trailing callback never fires (broken/parked timer), and all later messages are
		// epsilon-equal (stationary robot) so `changed` never re-arms a bump. The watchdog in
		// processTFMessage must commit the overdue bump anyway.
		processTFMessage("ds", tf("map", "odom", { x: 1, y: 0, z: 0 })); // leading (sync)
		processTFMessage("ds", tf("odom", "base_link", { x: 5, y: 0, z: 0 })); // trailing (pending)
		expect(fake.pending()).toBe(1);
		const vStuck = transformStore.get(transformVersionAtom);

		// The trailing callback never fires. Time passes beyond the stuck threshold.
		await sleep(120);

		// An epsilon-equal message arrives (changed=false). The watchdog must still heal.
		processTFMessage("ds", tf("odom", "base_link", { x: 5, y: 0, z: 0 }));

		expect(transformStore.get(transformVersionAtom)).toBe(vStuck + 1);
		expect(fake.pending()).toBe(0); // stuck handle cancelled
	});
});
