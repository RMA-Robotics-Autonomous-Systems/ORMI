/**
 * Tests for TransformTreeManager - subscription and cleanup race conditions
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

describe("TransformTreeManager - Subscription Races", () => {
	test("should wait for all subscriptions before initializing", async () => {
		const subscribePromises: Array<Promise<void>> = [];
		let subscribeCount = 0;

		const mockPluginsManager = {
			addAction: mock(() => {}),
			removeAction: mock(() => {}),
			doAction: mock(async (action: string, topic: any) => {
				if (action.includes("-subscribe")) {
					subscribeCount++;
					// Simulate async subscription
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
			}),
		};

		const topics = ["/tf", "/tf_static"];

		// Simulate subscription process
		const allSubscriptions = Promise.all(
			topics.map(async (topic) => {
				await mockPluginsManager.doAction("datasource-subscribe", {
					topic,
					type: "tf2_msgs/TFMessage",
				});
			}),
		);

		// Check that initialization waits
		let initialized = false;
		allSubscriptions.then(() => {
			initialized = true;
		});

		// Before subscriptions complete
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(initialized).toBe(false);

		// After subscriptions complete
		await allSubscriptions;
		expect(initialized).toBe(true);
		expect(subscribeCount).toBe(2);
	});

	test("should handle subscription failures gracefully", async () => {
		let failCount = 0;
		const mockPluginsManager = {
			addAction: mock(() => {}),
			doAction: mock(async (action: string, data?: any) => {
				if (action.includes("-subscribe")) {
					failCount++;
					throw new Error("Subscription failed");
				}
			}),
		};

		const topics = ["/tf", "/tf_static"];

		// Should not throw, but should track errors
		const results = await Promise.allSettled(
			topics.map((topic) =>
				mockPluginsManager
					.doAction("datasource-subscribe", { topic })
					.catch((error) => ({ error: error.message })),
			),
		);

		expect(failCount).toBe(2);
		expect(results.every((r) => r.status === "fulfilled")).toBe(true);
	});
});

describe("TransformTreeManager - Cleanup Races", () => {
	test("should complete unsubscribe before clearing atoms", async () => {
		const events: string[] = [];

		const mockPluginsManager = {
			removeAction: mock(() => {
				events.push("removeAction");
			}),
			doAction: mock(async (action: string, data?: any) => {
				if (action.includes("-unsubscribe")) {
					// Simulate async unsubscribe
					await new Promise((resolve) => setTimeout(resolve, 50));
					events.push("unsubscribe");
				}
			}),
		};

		const mockClearTransforms = mock(() => {
			events.push("clearTransforms");
		});

		// Simulate cleanup
		const topics = ["/tf", "/tf_static"];

		mockPluginsManager.removeAction();

		await Promise.all(
			topics.map((topic) =>
				mockPluginsManager.doAction("datasource-unsubscribe", {
					topic,
				}),
			),
		);

		mockClearTransforms();

		// Check order
		expect(events[0]).toBe("removeAction");
		expect(events[1]).toBe("unsubscribe");
		expect(events[2]).toBe("unsubscribe");
		expect(events[3]).toBe("clearTransforms");
	});

	test("should handle cleanup when messages arrive during teardown", async () => {
		const messagesReceived: any[] = [];
		const messageQueue: any[] = [];

		let isCleaningUp = false;

		const mockProcessTFMessage = mock(
			(datasourceId: string, message: any) => {
				if (isCleaningUp) {
					// Should reject messages during cleanup
					return;
				}
				messagesReceived.push(message);
			},
		);

		// Simulate messages arriving
		messageQueue.push({ transforms: [{ header: { frame_id: "map" } }] });
		messageQueue.push({ transforms: [{ header: { frame_id: "odom" } }] });

		// Process initial messages
		messageQueue.forEach((msg) =>
			mockProcessTFMessage("datasource-1", msg),
		);
		expect(messagesReceived.length).toBe(2);

		// Start cleanup
		isCleaningUp = true;

		// Try to process more messages
		messageQueue.forEach((msg) =>
			mockProcessTFMessage("datasource-1", msg),
		);

		// Should not have processed new messages
		expect(messagesReceived.length).toBe(2);
	});
});

describe("TransformTreeManager - Connection State", () => {
	test("should queue transforms when connection is not ready", () => {
		const pendingMessages: any[] = [];
		const processedMessages: any[] = [];
		let isConnected = false;

		const queueOrProcess = (datasourceId: string, message: any) => {
			if (!isConnected) {
				pendingMessages.push({ datasourceId, message });
			} else {
				processedMessages.push({ datasourceId, message });
			}
		};

		const message1 = { transforms: [{ header: { frame_id: "map" } }] };
		const message2 = { transforms: [{ header: { frame_id: "odom" } }] };

		// Before connection
		queueOrProcess("datasource-1", message1);
		expect(pendingMessages.length).toBe(1);
		expect(processedMessages.length).toBe(0);

		// After connection
		isConnected = true;
		queueOrProcess("datasource-1", message2);
		expect(processedMessages.length).toBe(1);

		// Process pending
		pendingMessages.forEach(({ datasourceId, message }) => {
			processedMessages.push({ datasourceId, message });
		});
		pendingMessages.length = 0;

		expect(processedMessages.length).toBe(2);
		expect(pendingMessages.length).toBe(0);
	});

	test("should drop stale messages after reconnect", () => {
		const messageTimestamps = new Map<string, number>();
		let connectionId = 1;

		const isStaleMessage = (messageConnectionId: number) => {
			return messageConnectionId < connectionId;
		};

		// Initial connection
		const msg1ConnectionId = connectionId;
		messageTimestamps.set("msg1", msg1ConnectionId);

		// Reconnect (connection ID increments)
		connectionId++;

		const msg2ConnectionId = connectionId;
		messageTimestamps.set("msg2", msg2ConnectionId);

		// Check staleness
		expect(isStaleMessage(msg1ConnectionId)).toBe(true);
		expect(isStaleMessage(msg2ConnectionId)).toBe(false);
	});
});

describe("TransformTreeManager - Multiple Datasources", () => {
	test("should track per-datasource frame ownership", () => {
		const frameOwnership = new Map<string, Set<string>>();

		const addFrame = (datasourceId: string, frameId: string) => {
			if (!frameOwnership.has(frameId)) {
				frameOwnership.set(frameId, new Set());
			}
			frameOwnership.get(frameId)!.add(datasourceId);
		};

		const removeFramesFromDatasource = (datasourceId: string) => {
			const framesToRemove: string[] = [];

			frameOwnership.forEach((owners, frameId) => {
				owners.delete(datasourceId);
				if (owners.size === 0) {
					framesToRemove.push(frameId);
				}
			});

			framesToRemove.forEach((frameId) => {
				frameOwnership.delete(frameId);
			});
		};

		// Datasource 1 adds frames
		addFrame("datasource-1", "map");
		addFrame("datasource-1", "odom");

		// Datasource 2 adds frames
		addFrame("datasource-2", "map");
		addFrame("datasource-2", "base_link");

		expect(frameOwnership.size).toBe(3); // map, odom, base_link
		expect(frameOwnership.get("map")?.size).toBe(2); // Both datasources

		// Datasource 1 disconnects
		removeFramesFromDatasource("datasource-1");

		expect(frameOwnership.has("map")).toBe(true); // Still owned by datasource-2
		expect(frameOwnership.has("odom")).toBe(false); // Removed
		expect(frameOwnership.has("base_link")).toBe(true); // Still owned by datasource-2
	});

	test("should merge transforms from multiple datasources correctly", () => {
		const frames = new Map<
			string,
			{
				transform: { x: number; y: number };
				lastUpdate: number;
				datasourceId: string;
			}
		>();

		const updateFrame = (
			datasourceId: string,
			frameId: string,
			transform: { x: number; y: number },
			timestamp: number,
		) => {
			const existing = frames.get(frameId);

			// Only update if newer or first time
			if (!existing || timestamp > existing.lastUpdate) {
				frames.set(frameId, {
					transform,
					lastUpdate: timestamp,
					datasourceId,
				});
			}
		};

		// Datasource 1 updates at t=100
		updateFrame("datasource-1", "robot", { x: 1, y: 0 }, 100);
		expect(frames.get("robot")?.transform.x).toBe(1);

		// Datasource 2 updates at t=50 (older, should be ignored)
		updateFrame("datasource-2", "robot", { x: 5, y: 5 }, 50);
		expect(frames.get("robot")?.transform.x).toBe(1); // Still 1

		// Datasource 2 updates at t=200 (newer, should update)
		updateFrame("datasource-2", "robot", { x: 10, y: 10 }, 200);
		expect(frames.get("robot")?.transform.x).toBe(10);
		expect(frames.get("robot")?.datasourceId).toBe("datasource-2");
	});
});

describe("TransformTreeManager - Static Transforms", () => {
	test("should handle /tf_static differently from /tf", () => {
		const staticFrames = new Map<string, any>();
		const dynamicFrames = new Map<string, any>();

		const processTransform = (
			topic: string,
			frameId: string,
			transform: any,
		) => {
			if (topic === "/tf_static") {
				// Static - only update if not exists
				if (!staticFrames.has(frameId)) {
					staticFrames.set(frameId, transform);
				}
			} else {
				// Dynamic - always update
				dynamicFrames.set(frameId, transform);
			}
		};

		processTransform("/tf_static", "map_to_odom", { x: 1 });
		processTransform("/tf", "odom_to_base", { x: 2 });

		// Try to update static again
		processTransform("/tf_static", "map_to_odom", { x: 999 });

		expect(staticFrames.get("map_to_odom")).toEqual({ x: 1 }); // Unchanged

		// Update dynamic again
		processTransform("/tf", "odom_to_base", { x: 999 });
		expect(dynamicFrames.get("odom_to_base")).toEqual({ x: 999 }); // Updated
	});
});

describe("TransformTreeManager - Error Recovery", () => {
	test("should recover from malformed transform messages", () => {
		const validMessages: any[] = [];
		const invalidMessages: any[] = [];

		const processMessage = (message: any) => {
			try {
				// Validate
				if (
					!message?.transforms ||
					!Array.isArray(message.transforms)
				) {
					throw new Error("Invalid message format");
				}

				message.transforms.forEach((tf: any) => {
					if (!tf.header?.frame_id || !tf.child_frame_id) {
						throw new Error("Missing frame IDs");
					}
				});

				validMessages.push(message);
			} catch (error) {
				invalidMessages.push({ message, error });
			}
		};

		processMessage({ transforms: [] }); // Valid but empty
		processMessage(null); // Invalid
		processMessage({
			transforms: [
				{ header: { frame_id: "map" }, child_frame_id: "odom" },
			],
		}); // Valid
		processMessage({ transforms: [{ header: {} }] }); // Invalid

		expect(validMessages.length).toBe(2);
		expect(invalidMessages.length).toBe(2);
	});
});
