import { describe, test, expect } from "bun:test";
import { rosbridgeConnectionKey } from "../connection-key";

const base = { id: "a", enable: true, url: "ws://x:9090", reconnectTimeout: 5 };

describe("rosbridgeConnectionKey", () => {
	test("ignores settings the connection does not use", () => {
		expect(
			rosbridgeConnectionKey({ ...base, title: "renamed" } as any),
		).toBe(rosbridgeConnectionKey(base));
	});
	test("changes with url, retry delay, enable", () => {
		const k = rosbridgeConnectionKey(base);
		expect(rosbridgeConnectionKey({ ...base, url: "ws://y" })).not.toBe(k);
		expect(
			rosbridgeConnectionKey({ ...base, reconnectTimeout: 9 }),
		).not.toBe(k);
		expect(rosbridgeConnectionKey({ ...base, enable: false })).not.toBe(k);
	});
});
