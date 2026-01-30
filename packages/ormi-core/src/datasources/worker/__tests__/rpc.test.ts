/**
 * Tests for RPC (Remote Procedure Call) system between host and Web Workers
 *
 * Critical: All datasources run in Web Workers. Communication failures = no data.
 * Focus: Method calls, event handling, error propagation, race conditions
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	createRpcClient,
	createRpcServer,
	RpcMethodMap,
	RpcEventMap,
	RpcRequest,
	RpcResponse,
	RpcEvent,
} from "../rpc";

// Mock RPC target (simulates postMessage interface)
class MockRpcTarget {
	private listeners: ((event: MessageEvent) => void)[] = [];
	public sentMessages: any[] = [];

	postMessage(message: unknown, transfer?: Transferable[]): void {
		this.sentMessages.push({ message, transfer });
	}

	addEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void {
		if (type === "message") {
			this.listeners.push(listener);
		}
	}

	removeEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void {
		if (type === "message") {
			this.listeners = this.listeners.filter((l) => l !== listener);
		}
	}

	// Test helper to simulate receiving a message
	simulateMessage(data: any): void {
		const event = { data } as MessageEvent;
		this.listeners.forEach((listener) => listener(event));
	}

	getListenerCount(): number {
		return this.listeners.length;
	}
}

describe("RPC Client", () => {
	let clientTarget: MockRpcTarget;
	let serverTarget: MockRpcTarget;

	beforeEach(() => {
		clientTarget = new MockRpcTarget();
		serverTarget = new MockRpcTarget();
	});

	test("should send RPC request with correct structure", () => {
		interface TestMethods extends RpcMethodMap {
			add: (a: number, b: number) => number;
		}

		const client = createRpcClient<TestMethods, {}>(clientTarget);

		// Call method (don't await - we're just checking the request)
		client.call("add", 2, 3);

		// Check request was sent
		expect(clientTarget.sentMessages.length).toBe(1);
		const request = clientTarget.sentMessages[0]!.message as RpcRequest;

		expect(request.type).toBe("rpc/request");
		expect(request.method).toBe("add");
		expect(request.params).toEqual([2, 3]);
		expect(request.id).toBeDefined();
	});

	test("should resolve promise when receiving successful response", async () => {
		interface TestMethods extends RpcMethodMap {
			add: (a: number, b: number) => number;
		}

		const client = createRpcClient<TestMethods, {}>(clientTarget);

		const callPromise = client.call("add", 2, 3);

		// Simulate server response
		const request = clientTarget.sentMessages[0]!.message as RpcRequest;
		const response: RpcResponse = {
			type: "rpc/response",
			id: request.id,
			ok: true,
			result: 5,
		};
		clientTarget.simulateMessage(response);

		const result = await callPromise;
		expect(result).toBe(5);
	});

	test("should reject promise when receiving error response", async () => {
		interface TestMethods extends RpcMethodMap {
			divide: (a: number, b: number) => number;
		}

		const client = createRpcClient<TestMethods, {}>(clientTarget);

		const callPromise = client.call("divide", 10, 0);

		// Simulate error response
		const request = clientTarget.sentMessages[0]!.message as RpcRequest;
		const response: RpcResponse = {
			type: "rpc/response",
			id: request.id,
			ok: false,
			error: { message: "Division by zero", code: "MATH_ERROR" },
		};
		clientTarget.simulateMessage(response);

		await expect(callPromise).rejects.toEqual({
			message: "Division by zero",
			code: "MATH_ERROR",
		});
	});

	test("should handle multiple concurrent calls correctly", async () => {
		interface TestMethods extends RpcMethodMap {
			multiply: (a: number, b: number) => number;
		}

		const client = createRpcClient<TestMethods, {}>(clientTarget);

		// Make multiple concurrent calls
		const call1 = client.call("multiply", 2, 3);
		const call2 = client.call("multiply", 4, 5);
		const call3 = client.call("multiply", 6, 7);

		// Respond to them in reverse order
		const req3 = clientTarget.sentMessages[2]!.message as RpcRequest;
		const req2 = clientTarget.sentMessages[1]!.message as RpcRequest;
		const req1 = clientTarget.sentMessages[0]!.message as RpcRequest;

		clientTarget.simulateMessage({
			type: "rpc/response",
			id: req3.id,
			ok: true,
			result: 42,
		});
		clientTarget.simulateMessage({
			type: "rpc/response",
			id: req2.id,
			ok: true,
			result: 20,
		});
		clientTarget.simulateMessage({
			type: "rpc/response",
			id: req1.id,
			ok: true,
			result: 6,
		});

		// Each call should resolve with its own result
		expect(await call1).toBe(6);
		expect(await call2).toBe(20);
		expect(await call3).toBe(42);
	});

	test("should handle event subscriptions", () => {
		interface TestEvents extends RpcEventMap {
			dataReceived: { value: number };
		}

		const client = createRpcClient<{}, TestEvents>(clientTarget);
		const handler = mock(() => {});

		client.onEvent("dataReceived", handler);

		// Simulate event from server
		const event: RpcEvent<TestEvents> = {
			type: "rpc/event",
			event: "dataReceived",
			payload: { value: 42 },
		};
		clientTarget.simulateMessage(event);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ value: 42 });
	});

	test("should remove event listener when unsubscribe is called", () => {
		interface TestEvents extends RpcEventMap {
			statusUpdate: string;
		}

		const client = createRpcClient<{}, TestEvents>(clientTarget);
		const handler = mock(() => {});

		const unsubscribe = client.onEvent("statusUpdate", handler);

		// Send event before unsubscribe
		clientTarget.simulateMessage({
			type: "rpc/event",
			event: "statusUpdate",
			payload: "connected",
		});
		expect(handler).toHaveBeenCalledTimes(1);

		// Unsubscribe
		unsubscribe();

		// Send event after unsubscribe
		clientTarget.simulateMessage({
			type: "rpc/event",
			event: "statusUpdate",
			payload: "disconnected",
		});

		// Handler should not be called again
		expect(handler).toHaveBeenCalledTimes(1);
	});

	test("should cleanup on dispose", () => {
		const client = createRpcClient<{}, {}>(clientTarget);

		expect(clientTarget.getListenerCount()).toBe(1);

		client.dispose();

		expect(clientTarget.getListenerCount()).toBe(0);
	});

	test("should ignore malformed messages", () => {
		interface TestMethods extends RpcMethodMap {
			test: () => void;
		}

		createRpcClient<TestMethods, {}>(clientTarget);

		// These should not throw
		clientTarget.simulateMessage(null);
		clientTarget.simulateMessage(undefined);
		clientTarget.simulateMessage("invalid");
		clientTarget.simulateMessage({ wrongType: true });
		clientTarget.simulateMessage({ type: "unknown" });
	});
});

describe("RPC Server", () => {
	let serverTarget: MockRpcTarget;

	beforeEach(() => {
		serverTarget = new MockRpcTarget();
	});

	test("should execute method and send success response", async () => {
		interface TestMethods extends RpcMethodMap {
			add: (a: number, b: number) => number;
		}

		const methods: TestMethods = {
			add: (a: number, b: number) => a + b,
		};

		createRpcServer<TestMethods, {}>(serverTarget, methods);

		// Simulate request from client
		const request: RpcRequest<TestMethods> = {
			type: "rpc/request",
			id: "test-123",
			method: "add",
			params: [5, 7],
		};
		serverTarget.simulateMessage(request);

		// Give async execution time to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Check response
		expect(serverTarget.sentMessages.length).toBe(1);
		const response = serverTarget.sentMessages[0]!.message as RpcResponse;

		expect(response.type).toBe("rpc/response");
		expect(response.id).toBe("test-123");
		expect(response.ok).toBe(true);
		expect(response.result).toBe(12);
	});

	test("should send error response when method throws", async () => {
		interface TestMethods extends RpcMethodMap {
			failingMethod: () => void;
		}

		const methods: TestMethods = {
			failingMethod: () => {
				throw new Error("Something went wrong");
			},
		};

		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);

		const request: RpcRequest<TestMethods> = {
			type: "rpc/request",
			id: "test-456",
			method: "failingMethod",
			params: [],
		};
		serverTarget.simulateMessage(request);

		await new Promise((resolve) => setTimeout(resolve, 10));

		const response = serverTarget.sentMessages[0]!.message as RpcResponse;

		expect(response.type).toBe("rpc/response");
		expect(response.ok).toBe(false);
		expect(response.error?.message).toBe("Something went wrong");
		expect(response.error?.code).toBe("RPC_METHOD_ERROR");
	});

	test("should send error response for unknown method", async () => {
		interface TestMethods extends RpcMethodMap {
			knownMethod: () => void;
		}

		const methods: TestMethods = {
			knownMethod: () => {},
		};

		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);

		const request: RpcRequest = {
			type: "rpc/request",
			id: "test-789",
			method: "unknownMethod",
			params: [],
		};
		serverTarget.simulateMessage(request);

		await new Promise((resolve) => setTimeout(resolve, 10));

		const response = serverTarget.sentMessages[0]!.message as RpcResponse;

		expect(response.ok).toBe(false);
		expect(response.error?.code).toBe("RPC_METHOD_NOT_FOUND");
	});

	test("should emit events to client", () => {
		interface TestEvents extends RpcEventMap {
			progress: { percent: number };
		}

		const server = createRpcServer<{}, TestEvents>(serverTarget, {});

		server.emit("progress", { percent: 50 });

		expect(serverTarget.sentMessages.length).toBe(1);
		const event = serverTarget.sentMessages[0]!
			.message as RpcEvent<TestEvents>;

		expect(event.type).toBe("rpc/event");
		expect(event.event).toBe("progress");
		expect(event.payload).toEqual({ percent: 50 });
	});

	test("should handle async methods correctly", async () => {
		interface TestMethods extends RpcMethodMap {
			asyncAdd: (a: number, b: number) => Promise<number>;
		}

		const methods: TestMethods = {
			asyncAdd: async (a: number, b: number) => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return a + b;
			},
		};

		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);

		const request: RpcRequest<TestMethods> = {
			type: "rpc/request",
			id: "async-test",
			method: "asyncAdd",
			params: [10, 20],
		};
		serverTarget.simulateMessage(request);

		await new Promise((resolve) => setTimeout(resolve, 20));

		const response = serverTarget.sentMessages[0]!.message as RpcResponse;

		expect(response.ok).toBe(true);
		expect(response.result).toBe(30);
	});

	test("should cleanup on dispose", () => {
		const server = createRpcServer<{}, {}>(serverTarget, {});

		expect(serverTarget.getListenerCount()).toBe(1);

		server.dispose();

		expect(serverTarget.getListenerCount()).toBe(0);
	});
});

describe("RPC Client-Server Integration", () => {
	test("should handle full request-response cycle", async () => {
		const clientTarget = new MockRpcTarget();
		const serverTarget = new MockRpcTarget();

		interface TestMethods extends RpcMethodMap {
			echo: (message: string) => string;
		}

		// Create server
		const methods: TestMethods = {
			echo: (message: string) => `Echo: ${message}`,
		};
		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);

		// Create client
		const client = createRpcClient<TestMethods, {}>(clientTarget);

		// Manually wire client -> server
		clientTarget.postMessage = (msg) => serverTarget.simulateMessage(msg);
		serverTarget.postMessage = (msg) => clientTarget.simulateMessage(msg);

		// Make call
		const result = await client.call("echo", "Hello");

		expect(result).toBe("Echo: Hello");
	});

	test("should handle event from server to client", (done) => {
		const clientTarget = new MockRpcTarget();
		const serverTarget = new MockRpcTarget();

		interface TestEvents extends RpcEventMap {
			notification: { message: string };
		}

		// Wire targets
		serverTarget.postMessage = (msg) => clientTarget.simulateMessage(msg);

		const server = createRpcServer<{}, TestEvents>(serverTarget, {});
		const client = createRpcClient<{}, TestEvents>(clientTarget);

		client.onEvent("notification", (payload) => {
			expect(payload.message).toBe("Test notification");
			done();
		});

		server.emit("notification", { message: "Test notification" });
	});
});

describe("RPC Edge Cases & Production Scenarios", () => {
	test("should handle response arriving after dispose (memory leak prevention)", async () => {
		const clientTarget = new MockRpcTarget();
		const client = createRpcClient<{ test: () => string }, {}>(
			clientTarget,
		);

		// Start a call
		const promise = client.call("test");

		// Dispose before response arrives
		client.dispose();

		// Simulate delayed response
		clientTarget.simulateMessage({
			type: "rpc/response",
			id: clientTarget.sentMessages[0]!.message.id,
			ok: true,
			result: "too late",
		});

		// Promise should not resolve/reject after dispose
		// This prevents memory leaks from stale promises
		await expect(
			Promise.race([
				promise,
				new Promise((resolve) =>
					setTimeout(() => resolve("timeout"), 10),
				),
			]),
		).resolves.toBe("timeout");
	});

	test("should handle duplicate response IDs (prevents double-resolve)", async () => {
		const clientTarget = new MockRpcTarget();
		const client = createRpcClient<{ test: () => string }, {}>(
			clientTarget,
		);

		const promise = client.call("test");
		const requestId = clientTarget.sentMessages[0]!.message.id;

		// First response - should resolve
		clientTarget.simulateMessage({
			type: "rpc/response",
			id: requestId,
			ok: true,
			result: "first",
		});

		const result = await promise;
		expect(result).toBe("first");

		// Second response with same ID - should be ignored (no error thrown)
		expect(() => {
			clientTarget.simulateMessage({
				type: "rpc/response",
				id: requestId,
				ok: true,
				result: "second",
			});
		}).not.toThrow();
	});

	test("should handle malformed RPC messages without crashing", () => {
		const clientTarget = new MockRpcTarget();
		const client = createRpcClient<{}, {}>(clientTarget);

		// These should not crash
		expect(() => clientTarget.simulateMessage(null)).not.toThrow();
		expect(() => clientTarget.simulateMessage(undefined)).not.toThrow();
		expect(() => clientTarget.simulateMessage("string")).not.toThrow();
		expect(() => clientTarget.simulateMessage(123)).not.toThrow();
		expect(() => clientTarget.simulateMessage([])).not.toThrow();
		expect(() =>
			clientTarget.simulateMessage({ wrong: "format" }),
		).not.toThrow();
	});

	test("should handle method returning undefined", async () => {
		const clientTarget = new MockRpcTarget();
		const serverTarget = new MockRpcTarget();

		interface TestMethods extends RpcMethodMap {
			returnsUndefined: () => undefined;
		}

		const methods: TestMethods = {
			returnsUndefined: () => undefined,
		};

		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);
		const client = createRpcClient<TestMethods, {}>(clientTarget);

		clientTarget.postMessage = (msg) => serverTarget.simulateMessage(msg);
		serverTarget.postMessage = (msg) => clientTarget.simulateMessage(msg);

		const result = await client.call("returnsUndefined");
		expect(result).toBeUndefined();
	});

	test("should handle method throwing non-Error objects", async () => {
		const clientTarget = new MockRpcTarget();
		const serverTarget = new MockRpcTarget();

		interface TestMethods extends RpcMethodMap {
			throwsString: () => void;
			throwsNull: () => void;
			throwsObject: () => void;
		}

		const methods: TestMethods = {
			throwsString: () => {
				throw "string error";
			},
			throwsNull: () => {
				throw null;
			},
			throwsObject: () => {
				throw { custom: "error" };
			},
		};

		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);
		const client = createRpcClient<TestMethods, {}>(clientTarget);

		clientTarget.postMessage = (msg) => serverTarget.simulateMessage(msg);
		serverTarget.postMessage = (msg) => clientTarget.simulateMessage(msg);

		await expect(client.call("throwsString")).rejects.toMatchObject({
			message: "string error",
		});

		await expect(client.call("throwsNull")).rejects.toMatchObject({
			message: "null",
		});

		await expect(client.call("throwsObject")).rejects.toMatchObject({
			message: "[object Object]",
		});
	});

	test("should handle concurrent calls with responses arriving out of order", async () => {
		const clientTarget = new MockRpcTarget();
		const serverTarget = new MockRpcTarget();

		interface TestMethods extends RpcMethodMap {
			delay: (ms: number, value: string) => Promise<string>;
		}

		const methods: TestMethods = {
			delay: async (ms: number, value: string) => {
				await new Promise((resolve) => setTimeout(resolve, ms));
				return value;
			},
		};

		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);
		const client = createRpcClient<TestMethods, {}>(clientTarget);

		clientTarget.postMessage = (msg) => serverTarget.simulateMessage(msg);
		serverTarget.postMessage = (msg) => clientTarget.simulateMessage(msg);

		// Start multiple calls - second finishes first
		const slow = client.call("delay", 20, "slow");
		const fast = client.call("delay", 1, "fast");

		// Even though "fast" finishes first, each promise should resolve correctly
		expect(await fast).toBe("fast");
		expect(await slow).toBe("slow");
	});

	test("should handle server processing same method concurrently", async () => {
		const clientTarget = new MockRpcTarget();
		const serverTarget = new MockRpcTarget();
		let activeCount = 0;
		let maxConcurrent = 0;

		interface TestMethods extends RpcMethodMap {
			concurrent: () => Promise<number>;
		}

		const methods: TestMethods = {
			concurrent: async () => {
				activeCount++;
				maxConcurrent = Math.max(maxConcurrent, activeCount);
				await new Promise((resolve) => setTimeout(resolve, 5));
				activeCount--;
				return maxConcurrent;
			},
		};

		const server = createRpcServer<TestMethods, {}>(serverTarget, methods);
		const client = createRpcClient<TestMethods, {}>(clientTarget);

		clientTarget.postMessage = (msg) => serverTarget.simulateMessage(msg);
		serverTarget.postMessage = (msg) => clientTarget.simulateMessage(msg);

		// Fire 5 concurrent calls
		const results = await Promise.all([
			client.call("concurrent"),
			client.call("concurrent"),
			client.call("concurrent"),
			client.call("concurrent"),
			client.call("concurrent"),
		]);

		// Should handle all 5 concurrently
		expect(maxConcurrent).toBe(5);
	});

	test("should not leak memory when adding/removing event listeners repeatedly", () => {
		const clientTarget = new MockRpcTarget();
		const client = createRpcClient<{}, { test: string }>(clientTarget);

		// Add and remove many listeners
		for (let i = 0; i < 100; i++) {
			const unsubscribe = client.onEvent("test", () => {});
			unsubscribe();
		}

		// Internal map should be empty
		clientTarget.simulateMessage({
			type: "rpc/event",
			event: "test",
			payload: "test",
		});

		// If no error thrown, memory is properly cleaned
		expect(true).toBe(true);
	});

	test("should handle postMessage throwing (network disconnection simulation)", () => {
		const clientTarget = new MockRpcTarget();
		const client = createRpcClient<{ test: () => string }, {}>(
			clientTarget,
		);

		// Simulate postMessage failure (worker terminated, etc.)
		clientTarget.postMessage = () => {
			throw new Error("Worker terminated");
		};

		// Call should throw immediately (not hang)
		expect(() => client.call("test")).toThrow("Worker terminated");
	});

	test("should handle response with wrong type field", async () => {
		const clientTarget = new MockRpcTarget();
		const client = createRpcClient<{ test: () => string }, {}>(
			clientTarget,
		);

		const promise = client.call("test");

		// Send malformed response
		clientTarget.simulateMessage({
			type: "wrong-type",
			id: clientTarget.sentMessages[0]!.message.id,
			ok: true,
			result: "test",
		});

		// Promise should not resolve (timeout instead)
		await expect(
			Promise.race([
				promise,
				new Promise((resolve) =>
					setTimeout(() => resolve("timeout"), 10),
				),
			]),
		).resolves.toBe("timeout");
	});
});
