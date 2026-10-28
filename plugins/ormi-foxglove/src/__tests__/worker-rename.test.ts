/**
 * Renaming a worker-backed Foxglove datasource must not restart its worker,
 * and its topic rows must carry the new title.
 */

import { describe, test, expect } from "bun:test";
import { PluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";

import { FoxgloveWorkerHost } from "../foxglove-worker-host";
import { foxgloveWorkerConnectionKey } from "../foxglove-connection";
import type { FoxgloveDataSourceSettings } from "../types";

interface Request {
	id: string;
	method: string;
}

/** A worker whose replies the test writes. */
class ScriptedWorker {
	private listeners: ((event: MessageEvent) => void)[] = [];
	readonly requests: Request[] = [];

	postMessage(message: unknown): void {
		this.requests.push(message as Request);
	}
	addEventListener(_: string, listener: (event: MessageEvent) => void) {
		this.listeners.push(listener);
	}
	removeEventListener(_: string, listener: (event: MessageEvent) => void) {
		this.listeners = this.listeners.filter((l) => l !== listener);
	}
	terminate(): void {}

	async next(method: string): Promise<string> {
		for (let i = 0; i < 100; i++) {
			const r = [...this.requests]
				.reverse()
				.find((q) => q.method === method);
			if (r) return r.id;
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
		throw new Error(`no ${method} request`);
	}
	reply(id: string, result?: unknown): void {
		this.listeners.forEach((l) =>
			l({
				data: { type: "rpc/response", id, ok: true, result },
			} as MessageEvent),
		);
	}
}

const settings: FoxgloveDataSourceSettings = {
	id: "fox",
	title: "Old name",
	enable: true,
	url: "wss://robot:8765",
	reconnectTimeout: 2,
	toasts: false,
	transformTreeTopics: ["/tf"],
};

describe("foxgloveWorkerConnectionKey", () => {
	test("ignores title, toasts and enable", () => {
		const key = foxgloveWorkerConnectionKey(settings);
		expect(
			foxgloveWorkerConnectionKey({
				...settings,
				title: "New name",
				toasts: true,
				enable: false,
			}),
		).toBe(key);
	});

	test("changes for every connection setting", () => {
		const key = foxgloveWorkerConnectionKey(settings);
		for (const patch of [
			{ url: "wss://other:8765" },
			{ reconnectTimeout: 5 },
			{ transformTreeTopics: ["/tf", "/tf_static"] },
		]) {
			expect(
				foxgloveWorkerConnectionKey({ ...settings, ...patch }),
			).not.toBe(key);
		}
	});

	test("does not depend on key order", () => {
		const { url, ...rest } = settings;
		expect(foxgloveWorkerConnectionKey({ url, ...rest })).toBe(
			foxgloveWorkerConnectionKey(settings),
		);
	});
});

describe("a renamed worker datasource", () => {
	test("lists its topics under the new title without a restart", async () => {
		const manager = new PluginsManager(new Map());
		const worker = new ScriptedWorker();
		const host = new FoxgloveWorkerHost({
			worker: worker as unknown as Worker,
			datasourceId: "fox",
			settings,
			pluginsManager: manager,
		});
		host.registerHooks();
		const init = host.init();
		worker.reply(await worker.next("init"));
		await init;

		host.updateSettings({ ...settings, title: "New name" });
		const row: DatasourceTopic = {
			topic: "/scan",
			datasource_id: "fox",
			source: settings,
			type: "LaserScan",
			rawType: "sensor_msgs/msg/LaserScan",
		};
		const poll = manager.applyFilterAsync<DatasourceTopic[]>(
			PluginsHooks.AVAILABLE_TOPICS,
			[],
		);
		worker.reply(await worker.next("listTopics"), [row]);

		expect((await poll).map((t) => t.source.title)).toEqual(["New name"]);
		expect(worker.requests.filter((r) => r.method === "init")).toHaveLength(
			1,
		);
		host.dispose();
	});
});
