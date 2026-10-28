/**
 * A worker that never answers `shutdown` is terminated after a grace period.
 * Every call still in flight at that point must reject: a terminated worker
 * will never answer it, and an unsettled promise awaited inside a hook chain
 * stalls that chain invisibly.
 */

import { describe, test, expect, spyOn } from "bun:test";
import { PluginsManager } from "@workspace/ormi-plugins";

import { WorkerDatasourceHost } from "../host";

/** A worker that records requests and answers none of them. */
class SilentWorker {
	terminated = 0;
	postMessage(): void {}
	addEventListener(): void {}
	removeEventListener(): void {}
	terminate(): void {
		this.terminated++;
	}
}

const settle = (promise: Promise<unknown>) =>
	Promise.race([
		promise.then(
			() => "resolved",
			() => "rejected",
		),
		new Promise((resolve) => setTimeout(() => resolve("pending"), 5)),
	]);

describe("WorkerDatasourceHost.dispose", () => {
	test("the shutdown timeout rejects calls still in flight", async () => {
		const worker = new SilentWorker();
		const host = new WorkerDatasourceHost({
			worker: worker as unknown as Worker,
			datasourceId: "silent",
			settings: { id: "silent", title: "Silent", enable: true },
			pluginsManager: new PluginsManager(new Map()),
		});
		const init = host.init();
		init.catch(() => {});

		// Capture the 5 s grace timer instead of waiting for it.
		const realSetTimeout = globalThis.setTimeout;
		let fireGrace: (() => void) | undefined;
		const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
			handler: () => void,
			ms?: number,
		) => {
			if (ms === 5000) {
				fireGrace = handler;
				return 0 as unknown as ReturnType<typeof setTimeout>;
			}
			return realSetTimeout(handler, ms);
		}) as typeof setTimeout);
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			host.dispose();
		} finally {
			timer.mockRestore();
		}

		try {
			expect(fireGrace).toBeDefined();
			expect(await settle(init)).toBe("pending");

			fireGrace!();
			expect(await settle(init)).toBe("rejected");
			expect(worker.terminated).toBeGreaterThan(0);
		} finally {
			warn.mockRestore();
		}
	});
});
