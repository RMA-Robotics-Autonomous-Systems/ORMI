import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { Db3ReaderHost } from "./db3-reader-host";

/** Stand-in for the reader worker: records requests, replies on demand. */
class FakeWorker {
	static last: FakeWorker;
	posted: { id: number; type: string }[] = [];
	terminated = false;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message: string }) => void) | null = null;

	constructor() {
		FakeWorker.last = this;
	}

	postMessage(message: { id: number; type: string }): void {
		this.posted.push(message);
	}

	terminate(): void {
		this.terminated = true;
	}

	reply(data: unknown): void {
		this.onmessage?.({ data });
	}
}

const RealWorker = globalThis.Worker;
beforeAll(() => {
	globalThis.Worker = FakeWorker as unknown as typeof Worker;
});
afterAll(() => {
	globalThis.Worker = RealWorker;
});

describe("Db3ReaderHost", () => {
	it("settles concurrent same-kind calls by request id, in any reply order", async () => {
		const host = new Db3ReaderHost();
		const worker = FakeWorker.last;
		const first = host.getTopics();
		const second = host.getTopics();
		const [a, b] = worker.posted;
		expect(a!.id).not.toBe(b!.id);

		const topic = (name: string) => ({
			id: 1,
			name,
			type: "std_msgs/msg/Float64",
			messageCount: 1,
		});
		worker.reply({ id: b!.id, type: "topics", data: [topic("/b")] });
		worker.reply({ id: a!.id, type: "topics", data: [topic("/a")] });

		expect((await first)[0]!.name).toBe("/a");
		expect((await second)[0]!.name).toBe("/b");
	});

	it("rejects only the call an error names", async () => {
		const host = new Db3ReaderHost();
		const worker = FakeWorker.last;
		const failing = host.readTopic("/x");
		const ok = host.readTopic("/y");
		const [x, y] = worker.posted;

		worker.reply({ id: x!.id, type: "error", message: "No bag loaded" });
		worker.reply({ id: y!.id, type: "series", topicName: "/y", data: [] });

		await expect(failing).rejects.toThrow("No bag loaded");
		expect(await ok).toEqual([]);
	});

	it("rejects every pending call on terminate", async () => {
		const host = new Db3ReaderHost();
		const worker = FakeWorker.last;
		const calls = [host.getTopics(), host.readGpsTopic("/fix")];

		host.terminate();

		expect(worker.terminated).toBe(true);
		for (const call of calls) {
			await expect(call).rejects.toThrow("Bag reader closed");
		}
	});

	it("rejects every pending call when the worker fails", async () => {
		const host = new Db3ReaderHost();
		const worker = FakeWorker.last;
		const call = host.openBag(new ArrayBuffer(8));

		worker.onerror?.({ message: "worker script failed" });

		await expect(call).rejects.toThrow("worker script failed");
	});
});
