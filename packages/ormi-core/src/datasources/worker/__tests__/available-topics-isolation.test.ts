/**
 * One unreachable datasource must not empty the topic list.
 *
 * Operator report: "I still need to reload a dashboard after creating it for it
 * to load any topics."
 *
 * `AVAILABLE_TOPICS` is applied by `applyFilterAsync`, which awaits every
 * registered contributor **sequentially, with no per-filter isolation**: the
 * first one to reject rejects the whole call, and the topic list's poll drops
 * the result and leaves the panel empty. A worker host's `init` rejects on an
 * unreachable endpoint — the normal first state of a datasource added to a
 * fresh workspace, before the operator has typed the robot's URL — and the
 * rejected promise was stored once and awaited by every later call. So a single
 * mistyped URL blacked out every topic of every datasource for the rest of the
 * session, and the only way back was a reload, by which point the saved
 * settings were already correct and `init` succeeded on the first try.
 *
 * These tests pin the two properties that make that impossible: the filter
 * never rejects, and a datasource that recovers starts listing topics again
 * without a reload.
 */

import { describe, test, expect } from "bun:test";
import { PluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

import { WorkerDatasourceHost } from "../host";
import type { DatasourceTopic } from "../../datasource-interface";
import type { RpcRequest, RpcResponse } from "../rpc";

/**
 * A worker whose replies the test writes.
 *
 * Requests are recorded rather than answered; the test decides which ones get a
 * response, so "never answers", "answers with an error" and "answers" are all
 * reachable.
 */
class ScriptedWorker {
	private listeners: ((event: MessageEvent) => void)[] = [];

	readonly requests: RpcRequest[] = [];

	postMessage(message: unknown): void {
		this.requests.push(message as RpcRequest);
	}

	addEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void {
		if (type === "message") this.listeners.push(listener);
	}

	removeEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void {
		this.listeners = this.listeners.filter((entry) => entry !== listener);
	}

	terminate(): void {}

	/** Id of the last request for `method`, or undefined if never called. */
	lastRequestId(method: string): string | undefined {
		for (let index = this.requests.length - 1; index >= 0; index--) {
			const request = this.requests[index]!;
			if (request.method === method) return request.id;
		}
		return undefined;
	}

	/**
	 * Wait until a request for `method` has been made that is not `notId`, and
	 * return its id. Lets a test answer the call a poll is actually waiting on
	 * rather than a stale one from an earlier poll.
	 */
	async nextRequestId(method: string, notId?: string): Promise<string> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const id = this.lastRequestId(method);
			if (id !== undefined && id !== notId) return id;
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
		throw new Error(`worker never received a new ${method} request`);
	}

	/** Reply to a request, as the worker's RPC server would. */
	reply(id: string, ok: boolean, payload?: unknown): void {
		const response: RpcResponse = ok
			? { type: "rpc/response", id, ok: true, result: payload }
			: {
					type: "rpc/response",
					id,
					ok: false,
					error: { message: String(payload) },
				};
		this.listeners.forEach((listener) =>
			listener({ data: response } as MessageEvent),
		);
	}
}

/** A topic contributed by an unrelated, healthy datasource. */
const healthyTopic: DatasourceTopic = {
	topic: "/odom",
	datasource_id: "healthy",
	source: { id: "healthy", title: "Working robot", enable: true },
	type: "Odometry",
	rawType: "nav_msgs/msg/Odometry",
};

/** A manager with one healthy contributor already registered. */
function managerWithHealthyDatasource(): PluginsManager {
	const manager = new PluginsManager(new Map());
	manager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
		id: "healthy-available-topics",
		priority: 10,
		filter: async (topics: DatasourceTopic[]) => [...topics, healthyTopic],
	});
	return manager;
}

/** Read the list exactly as the topic panel's poll does. */
function listTopics(manager: PluginsManager): Promise<DatasourceTopic[]> {
	return manager.applyFilterAsync<DatasourceTopic[]>(
		PluginsHooks.AVAILABLE_TOPICS,
		[],
	);
}

describe("a worker datasource that cannot connect", () => {
	test("does not take the other datasources' topics down with it", async () => {
		const manager = managerWithHealthyDatasource();
		const worker = new ScriptedWorker();

		const host = new WorkerDatasourceHost({
			worker: worker as unknown as Worker,
			datasourceId: "broken",
			settings: { id: "broken", title: "Unreachable", enable: true },
			pluginsManager: manager,
		});
		host.registerHooks();

		// The operator's URL is wrong, so the worker's connect fails.
		const init = host.init();
		worker.reply(
			worker.lastRequestId("init")!,
			false,
			"Connection timeout to ws://wrong:8765",
		);
		await expect(init).rejects.toBeDefined();

		// The panel asks. It must get an answer, and it must contain the other
		// datasource's topic.
		const listed = await listTopics(manager);
		expect(listed.map((topic) => topic.topic)).toEqual(["/odom"]);
	});

	test("lists its topics again once it recovers, with no reload", async () => {
		const manager = managerWithHealthyDatasource();
		const worker = new ScriptedWorker();

		const host = new WorkerDatasourceHost({
			worker: worker as unknown as Worker,
			datasourceId: "broken",
			settings: { id: "broken", title: "Unreachable", enable: true },
			pluginsManager: manager,
		});
		host.registerHooks();

		const init = host.init();
		worker.reply(
			worker.lastRequestId("init")!,
			false,
			"Connection refused",
		);
		await expect(init).rejects.toBeDefined();

		// First poll: the host asks the worker rather than re-throwing the dead
		// init, and the worker (still disconnected) reports nothing.
		const firstPoll = listTopics(manager);
		const firstCall = await worker.nextRequestId("listTopics");
		worker.reply(firstCall, true, []);
		expect((await firstPoll).map((topic) => topic.topic)).toEqual([
			"/odom",
		]);

		// The worker reconnects on its own and now has a channel. The failed
		// init must not be what the host keeps answering with.
		const recovered: DatasourceTopic = {
			topic: "/scan",
			datasource_id: "broken",
			source: { id: "broken", title: "Unreachable", enable: true },
			type: "LaserScan",
			rawType: "sensor_msgs/msg/LaserScan",
		};
		const secondPoll = listTopics(manager);
		const secondCall = await worker.nextRequestId("listTopics", firstCall);
		worker.reply(secondCall, true, [recovered]);

		expect((await secondPoll).map((topic) => topic.topic).sort()).toEqual([
			"/odom",
			"/scan",
		]);
	});

	test("a worker that never answers at all still yields a list", async () => {
		// A worker that failed to load never runs its own connect timeout, so
		// `init` neither resolves nor rejects. Without a bound on the wait the
		// whole chain hangs and the panel is empty forever, with nothing logged.
		const manager = managerWithHealthyDatasource();
		const worker = new ScriptedWorker();

		const host = new WorkerDatasourceHost({
			worker: worker as unknown as Worker,
			datasourceId: "dead",
			settings: { id: "dead", title: "Dead worker", enable: true },
			pluginsManager: manager,
		});
		host.registerHooks();

		// Deliberately never replied to, and deliberately not awaited.
		void host.init().catch(() => {});

		const listed = await Promise.race([
			listTopics(manager),
			new Promise<"hung">((resolve) =>
				setTimeout(() => resolve("hung"), 6000),
			),
		]);

		expect(listed).not.toBe("hung");
		expect(
			(listed as DatasourceTopic[]).map((topic) => topic.topic),
		).toEqual(["/odom"]);
	}, 10000);
});
