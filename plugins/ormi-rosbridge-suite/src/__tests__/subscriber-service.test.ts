/**
 * Tests for SubscriberService — subscriber leak detection.
 *
 * Every test verifies that ROSLIB.Topic subscribers are created and destroyed
 * the exact number of times expected.  A "subscriber leak" is any case where
 * a ROSLIB.Topic is created but its `unsubscribe()` method is never called,
 * leaving an open WebSocket subscription consuming bandwidth and memory.
 *
 * The TopicFactory constructor parameter lets us inject a mock that tracks
 * subscribe/unsubscribe calls without a real ROS connection.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
	SubscriberService,
	type TopicLike,
	type TopicFactory,
} from "../subscriber-service";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";
import type * as ROSLIB from "roslib";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Stub for ROSLIB.Ros — the service only passes it through to the factory. */
const mockRos = {} as ROSLIB.Ros;

/** Instrumented stand-in for a ROSLIB.Topic. */
interface MockTopic extends TopicLike {
	name: string;
	subscribeCallCount: number;
	unsubscribeCallCount: number;
	lastCallback: ((msg: unknown) => void) | null;
	/** Simulate an incoming message arriving from ROS. */
	fire(msg: unknown): void;
}

/** Returns a factory and the list of MockTopics it has created so far. */
function makeFactory(): { factory: TopicFactory; created: MockTopic[] } {
	const created: MockTopic[] = [];

	const factory: TopicFactory = (opts) => {
		const t: MockTopic = {
			name: opts.name,
			subscribeCallCount: 0,
			unsubscribeCallCount: 0,
			lastCallback: null,
			subscribe(cb) {
				this.subscribeCallCount++;
				this.lastCallback = cb;
			},
			unsubscribe() {
				this.unsubscribeCallCount++;
			},
			fire(msg) {
				this.lastCallback?.(msg);
			},
		};
		created.push(t);
		return t;
	};

	return { factory, created };
}

/** Build a minimal DatasourceTopic. */
function makeTopic(
	topic: string,
	rawType = "std_msgs/msg/String",
): DatasourceTopic {
	return {
		topic,
		datasource_id: "test-ds",
		source: { id: "test-ds", title: "Test", enable: true },
		type: "String",
		rawType,
	};
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

describe("SubscriberService — subscribe", () => {
	test("creates exactly one ROSLIB subscriber and forwards messages", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);

		const received: unknown[] = [];
		service.subscribe(mockRos, makeTopic("/foo"), (msg) =>
			received.push(msg),
		);

		expect(created).toHaveLength(1);
		expect(created[0]!.subscribeCallCount).toBe(1);
		expect(service.activeCount).toBe(1);

		created[0]!.fire("hello");
		expect(received).toEqual(["hello"]);
	});

	test("second subscribe to the same topic increments ref count — no new ROSLIB.Topic", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);
		const t = makeTopic("/foo");

		service.subscribe(mockRos, t, () => {});
		service.subscribe(mockRos, t, () => {});

		expect(created).toHaveLength(1);
		expect(service.refCountFor("/foo")).toBe(2);
		expect(service.activeCount).toBe(1);
	});

	test("subscribing to two different topics creates two independent ROSLIB subscribers", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);

		service.subscribe(mockRos, makeTopic("/a"), () => {});
		service.subscribe(mockRos, makeTopic("/b"), () => {});

		expect(created).toHaveLength(2);
		expect(service.activeCount).toBe(2);
		expect(service.refCountFor("/a")).toBe(1);
		expect(service.refCountFor("/b")).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

describe("SubscriberService — unsubscribe", () => {
	test("single subscribe → single unsubscribe destroys the ROSLIB subscriber", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);
		const t = makeTopic("/foo");

		service.subscribe(mockRos, t, () => {});
		service.unsubscribe(t);

		expect(created[0]!.unsubscribeCallCount).toBe(1);
		expect(service.activeCount).toBe(0);
		expect(service.refCountFor("/foo")).toBe(0);
	});

	test("two subscribes → one unsubscribe decrements ref count but does NOT call ROSLIB.unsubscribe", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);
		const t = makeTopic("/foo");

		service.subscribe(mockRos, t, () => {});
		service.subscribe(mockRos, t, () => {});
		service.unsubscribe(t);

		expect(created[0]!.unsubscribeCallCount).toBe(0); // still alive
		expect(service.refCountFor("/foo")).toBe(1);
		expect(service.activeCount).toBe(1);
	});

	test("two subscribes → two unsubscribes destroys the ROSLIB subscriber exactly once", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);
		const t = makeTopic("/foo");

		service.subscribe(mockRos, t, () => {});
		service.subscribe(mockRos, t, () => {});
		service.unsubscribe(t);
		service.unsubscribe(t);

		expect(created[0]!.unsubscribeCallCount).toBe(1);
		expect(service.activeCount).toBe(0);
	});

	test("ignoreCount:true forces immediate destruction regardless of ref count", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);
		const t = makeTopic("/foo");

		service.subscribe(mockRos, t, () => {});
		service.subscribe(mockRos, t, () => {});
		service.subscribe(mockRos, t, () => {});

		service.unsubscribe(t, true);

		expect(created[0]!.unsubscribeCallCount).toBe(1);
		expect(service.activeCount).toBe(0);
	});

	test("unsubscribing a topic not in the registry is a no-op", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);

		// Should not throw
		service.unsubscribe(makeTopic("/ghost"));

		expect(created).toHaveLength(0);
		expect(service.activeCount).toBe(0);
	});

	test("unsubscribing topic A does not affect topic B", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);

		service.subscribe(mockRos, makeTopic("/a"), () => {});
		service.subscribe(mockRos, makeTopic("/b"), () => {});
		service.unsubscribe(makeTopic("/a"));

		expect(created[0]!.unsubscribeCallCount).toBe(1); // /a destroyed
		expect(created[1]!.unsubscribeCallCount).toBe(0); // /b untouched
		expect(service.activeCount).toBe(1);
		expect(service.refCountFor("/b")).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe("SubscriberService — cleanup", () => {
	test("cleanup unsubscribes all active topics", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);

		service.subscribe(mockRos, makeTopic("/a"), () => {});
		service.subscribe(mockRos, makeTopic("/b"), () => {});
		service.subscribe(mockRos, makeTopic("/c"), () => {});

		service.cleanup();

		expect(created[0]!.unsubscribeCallCount).toBe(1);
		expect(created[1]!.unsubscribeCallCount).toBe(1);
		expect(created[2]!.unsubscribeCallCount).toBe(1);
		expect(service.activeCount).toBe(0);
	});

	test("cleanup handles remaining topics after partial unsubscribes", () => {
		const { factory, created } = makeFactory();
		const service = new SubscriberService(factory);
		const a = makeTopic("/a");
		const b = makeTopic("/b");

		service.subscribe(mockRos, a, () => {});
		service.subscribe(mockRos, a, () => {}); // ref count = 2
		service.subscribe(mockRos, b, () => {});
		service.unsubscribe(a); // ref count = 1, still alive

		service.cleanup();

		// /a was NOT destroyed by unsubscribe, but cleanup must catch it
		expect(created[0]!.unsubscribeCallCount).toBe(1);
		expect(created[1]!.unsubscribeCallCount).toBe(1);
		expect(service.activeCount).toBe(0);
	});

	test("cleanup on an empty service does not throw", () => {
		const service = new SubscriberService(makeFactory().factory);
		expect(() => service.cleanup()).not.toThrow();
	});

	test("cleanup resets activeCount and refCountFor to 0", () => {
		const { factory } = makeFactory();
		const service = new SubscriberService(factory);
		const t = makeTopic("/foo");

		service.subscribe(mockRos, t, () => {});
		service.subscribe(mockRos, t, () => {});
		service.cleanup();

		expect(service.activeCount).toBe(0);
		expect(service.refCountFor("/foo")).toBe(0);
	});
});
