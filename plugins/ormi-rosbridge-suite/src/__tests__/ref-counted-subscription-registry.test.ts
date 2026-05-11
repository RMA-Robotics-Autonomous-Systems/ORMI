import { describe, expect, test } from "bun:test";
import {
	RefCountedSubscriptionRegistry,
	type Unsubscribable,
} from "../ref-counted-subscription-registry";

interface MockSubscriber extends Unsubscribable {
	readonly id: string;
	unsubscribeCallCount: number;
}

const makeSubscriber = (id: string): MockSubscriber => ({
	id,
	unsubscribeCallCount: 0,
	unsubscribe() {
		this.unsubscribeCallCount += 1;
	},
});

describe("RefCountedSubscriptionRegistry", () => {
	test("creates one subscriber per topic and increments the ref count for repeated subscribes", () => {
		const registry = new RefCountedSubscriptionRegistry<
			MockSubscriber,
			{ rawType: string; webType: string }
		>();
		let createdCount = 0;

		const create = () => {
			createdCount += 1;
			return {
				subscriber: makeSubscriber(`sub-${createdCount}`),
				metadata: {
					rawType: "std_msgs/msg/String",
					webType: "String",
				},
			};
		};

		const first = registry.subscribe("/foo", create);
		const second = registry.subscribe("/foo", create);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(createdCount).toBe(1);
		expect(registry.activeCount).toBe(1);
		expect(registry.refCountFor("/foo")).toBe(2);
		expect(registry.get("/foo")?.metadata.rawType).toBe(
			"std_msgs/msg/String",
		);
	});

	test("unsubscribe only tears down the subscriber when the last consumer leaves", () => {
		const registry = new RefCountedSubscriptionRegistry<MockSubscriber>();

		registry.subscribe("/foo", () => ({
			subscriber: makeSubscriber("sub-1"),
			metadata: undefined,
		}));
		registry.subscribe("/foo", () => ({
			subscriber: makeSubscriber("sub-2"),
			metadata: undefined,
		}));

		const active = registry.get("/foo")?.subscriber;
		registry.unsubscribe("/foo");

		expect(active?.unsubscribeCallCount).toBe(0);
		expect(registry.refCountFor("/foo")).toBe(1);

		registry.unsubscribe("/foo");

		expect(active?.unsubscribeCallCount).toBe(1);
		expect(registry.activeCount).toBe(0);
		expect(registry.refCountFor("/foo")).toBe(0);
	});

	test("ignoreCount forces immediate teardown", () => {
		const registry = new RefCountedSubscriptionRegistry<MockSubscriber>();

		registry.subscribe("/foo", () => ({
			subscriber: makeSubscriber("sub-1"),
			metadata: undefined,
		}));
		registry.subscribe("/foo", () => ({
			subscriber: makeSubscriber("sub-2"),
			metadata: undefined,
		}));

		const active = registry.get("/foo")?.subscriber;
		registry.unsubscribe("/foo", true);

		expect(active?.unsubscribeCallCount).toBe(1);
		expect(registry.activeCount).toBe(0);
	});

	test("cleanup unsubscribes every active subscriber exactly once", () => {
		const registry = new RefCountedSubscriptionRegistry<MockSubscriber>();

		registry.subscribe("/a", () => ({
			subscriber: makeSubscriber("sub-a"),
			metadata: undefined,
		}));
		registry.subscribe("/b", () => ({
			subscriber: makeSubscriber("sub-b"),
			metadata: undefined,
		}));

		const a = registry.get("/a")?.subscriber;
		const b = registry.get("/b")?.subscriber;
		registry.cleanup();

		expect(a?.unsubscribeCallCount).toBe(1);
		expect(b?.unsubscribeCallCount).toBe(1);
		expect(registry.activeCount).toBe(0);
	});

	test("replacing the subscriber preserves the topic contract across reconnects", () => {
		const registry = new RefCountedSubscriptionRegistry<
			MockSubscriber,
			{ rawType: string; webType: string }
		>();

		registry.subscribe("/foo", () => ({
			subscriber: makeSubscriber("sub-1"),
			metadata: {
				rawType: "sensor_msgs/msg/Image",
				webType: "Image",
			},
		}));
		registry.subscribe("/foo", () => ({
			subscriber: makeSubscriber("sub-2"),
			metadata: {
				rawType: "sensor_msgs/msg/Image",
				webType: "Image",
			},
		}));

		const replacement = makeSubscriber("sub-reconnected");
		const replaced = registry.replaceSubscriber("/foo", replacement);

		expect(replaced).toBe(true);
		expect(registry.get("/foo")?.subscriber).toBe(replacement);
		expect(registry.refCountFor("/foo")).toBe(2);
		expect(registry.get("/foo")?.metadata.webType).toBe("Image");
	});
});
