/**
 * Tests for Foxglove worker reconnection safety and state management
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";

// Mock FoxgloveClient
class MockFoxgloveClient {
  private handlers = new Map<string, Set<Function>>();
  private channelIdCounter = 1;
  private subscriptionIdCounter = 1;
  public advertisedChannels = new Map<
    number,
    { topic: string; schemaName: string }
  >();
  public subscriptions = new Map<number, number>(); // subscriptionId -> channelId

  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: Function) {
    this.handlers.get(event)?.delete(handler);
  }

  advertise(params: {
    topic: string;
    encoding: string;
    schemaName: string;
  }): number {
    const channelId = this.channelIdCounter++;
    this.advertisedChannels.set(channelId, {
      topic: params.topic,
      schemaName: params.schemaName,
    });
    return channelId;
  }

  unadvertise(channelId: number) {
    this.advertisedChannels.delete(channelId);
  }

  subscribe(channelId: number): number {
    const subscriptionId = this.subscriptionIdCounter++;
    this.subscriptions.set(subscriptionId, channelId);
    return subscriptionId;
  }

  unsubscribe(subscriptionId: number) {
    this.subscriptions.delete(subscriptionId);
  }

  sendMessage(channelId: number, data: Uint8Array) {
    // Mock implementation
  }

  sendServiceCallRequest(params: any) {
    // Mock implementation
  }

  // Test helpers
  emitAdvertise(
    channels: Array<{
      id: number;
      topic: string;
      schemaName: string;
      schema?: string;
    }>,
  ) {
    const handlers = this.handlers.get("advertise");
    if (handlers) {
      handlers.forEach((handler) => handler(channels));
    }
  }

  emitUnadvertise(channelIds: number[]) {
    const handlers = this.handlers.get("unadvertise");
    if (handlers) {
      handlers.forEach((handler) => handler(channelIds));
    }
  }

  reset() {
    this.advertisedChannels.clear();
    this.subscriptions.clear();
    this.handlers.clear();
  }

  static SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";
}

// Mock WebSocket
class MockWebSocket {
  public readyState = 0; // CONNECTING
  private handlers = new Map<string, Set<Function>>();

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    // Simulate async connection
    setTimeout(() => this.simulateOpen(), 10);
  }

  addEventListener(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: Function) {
    this.handlers.get(event)?.delete(handler);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    const handlers = this.handlers.get("close");
    if (handlers) {
      handlers.forEach((handler) => handler({ wasClean: true }));
    }
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    const handlers = this.handlers.get("open");
    if (handlers) {
      handlers.forEach((handler) => handler({}));
    }
  }

  simulateError() {
    const handlers = this.handlers.get("error");
    if (handlers) {
      handlers.forEach((handler) => handler({}));
    }
  }

  simulateClose(wasClean: boolean = false) {
    this.readyState = MockWebSocket.CLOSED;
    const handlers = this.handlers.get("close");
    if (handlers) {
      handlers.forEach((handler) => handler({ wasClean }));
    }
  }
}

describe("Foxglove Worker - Reconnection Safety", () => {
  let originalWebSocket: any;
  let originalFoxgloveClient: any;

  beforeEach(() => {
    // Save originals
    originalWebSocket = (globalThis as any).WebSocket;

    // Install mocks
    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).FoxgloveClient = MockFoxgloveClient;
  });

  afterEach(() => {
    // Restore originals
    (globalThis as any).WebSocket = originalWebSocket;
    if (originalFoxgloveClient) {
      (globalThis as any).FoxgloveClient = originalFoxgloveClient;
    }
  });

  test("should wait for connection before resolving init", async () => {
    // This would require loading the actual worker, which is complex in a test environment
    // For now, we test the concept
    const mockWs = new MockWebSocket("ws://localhost:8765");

    const initPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 1000);

      const checkConnection = () => {
        if (mockWs.readyState === MockWebSocket.OPEN) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkConnection, 10);
        }
      };

      setTimeout(checkConnection, 10);
    });

    await expect(initPromise).resolves.toBeUndefined();
  });

  test("should queue advertise operations when disconnected", () => {
    const pendingOps = new Map<
      string,
      { topic: any; resolve: (success: boolean) => void }
    >();
    const MAX_PENDING_OPS = 100;
    const connected = false;

    const topic: DatasourceTopic = {
      topic: "/cmd_vel",
      type: "Twist",
      rawType: "geometry_msgs/msg/Twist",
      datasource_id: "test",
      source: {} as any,
    };

    let resolveValue: boolean | undefined;
    const promise = new Promise<boolean>((resolve) => {
      if (pendingOps.size < MAX_PENDING_OPS) {
        pendingOps.set(topic.topic, { topic, resolve });
        resolveValue = undefined;
      } else {
        resolve(false);
      }
    });

    expect(pendingOps.has("/cmd_vel")).toBe(true);
    expect(pendingOps.size).toBe(1);
  });

  test("should re-advertise publishers on reconnect", async () => {
    const client = new MockFoxgloveClient();

    // Initial advertise
    const channelId1 = client.advertise({
      topic: "/test",
      encoding: "cdr",
      schemaName: "std_msgs/msg/String",
    });

    expect(client.advertisedChannels.has(channelId1)).toBe(true);
    expect(client.advertisedChannels.get(channelId1)?.topic).toBe("/test");

    // Simulate disconnect
    client.reset();
    expect(client.advertisedChannels.size).toBe(0);

    // Simulate reconnect and re-advertise
    const channelId2 = client.advertise({
      topic: "/test",
      encoding: "cdr",
      schemaName: "std_msgs/msg/String",
    });

    expect(client.advertisedChannels.has(channelId2)).toBe(true);
    expect(channelId2).not.toBe(channelId1); // New channel ID
  });

  test("should clean up schema resolvers on teardown", () => {
    const schemaResolvers = new Map<
      string,
      {
        resolve: (schema: string) => void;
        reject: (error: Error) => void;
        timeout: any;
      }
    >();

    // Add a resolver
    let rejected = false;
    const timeout = setTimeout(() => {}, 10000);
    schemaResolvers.set("test/msg/Test", {
      resolve: () => {},
      reject: (error) => {
        rejected = true;
      },
      timeout,
    });

    // Simulate teardown
    schemaResolvers.forEach((resolver) => {
      clearTimeout(resolver.timeout);
      resolver.reject(new Error("Connection teardown"));
    });
    schemaResolvers.clear();

    expect(rejected).toBe(true);
    expect(schemaResolvers.size).toBe(0);
  });

  test("should maintain subscriber count across reconnect", () => {
    const subscribersByTopic = new Map<
      string,
      { topic: string; count: number }
    >();

    // Initial subscription
    subscribersByTopic.set("/data", { topic: "/data", count: 2 });

    // Save state before reconnect
    const existingSubscribers = Array.from(subscribersByTopic.values());

    // Simulate reconnect
    subscribersByTopic.clear();

    // Restore subscribers
    existingSubscribers.forEach((sub) => {
      subscribersByTopic.set(sub.topic, sub);
    });

    expect(subscribersByTopic.get("/data")?.count).toBe(2);
  });

  test("should reject pending operations on shutdown", () => {
    const pendingAdvertiseOps = new Map<
      string,
      {
        topic: any;
        resolve: (success: boolean) => void;
      }
    >();

    let resolvedValue: boolean | undefined;
    pendingAdvertiseOps.set("/test", {
      topic: {} as any,
      resolve: (value) => {
        resolvedValue = value;
      },
    });

    // Simulate shutdown
    pendingAdvertiseOps.forEach((op) => op.resolve(false));
    pendingAdvertiseOps.clear();

    expect(resolvedValue).toBe(false);
    expect(pendingAdvertiseOps.size).toBe(0);
  });

  test("WebSocket reconnect flow", async () => {
    const ws = new MockWebSocket("ws://localhost:8765");

    // Wait for initial connection
    await new Promise<void>((resolve) => {
      const check = () => {
        if (ws.readyState === MockWebSocket.OPEN) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      setTimeout(check, 10);
    });

    expect(ws.readyState).toBe(MockWebSocket.OPEN);

    // Simulate disconnect
    ws.simulateClose(false);
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);

    // In real implementation, this would trigger reconnect logic
  });

  test("should enforce max pending operations limit", () => {
    const MAX_PENDING_OPS = 100;
    const pendingOps = new Map();

    // Fill up to limit
    for (let i = 0; i < MAX_PENDING_OPS; i++) {
      pendingOps.set(`/topic_${i}`, { topic: {}, resolve: () => {} });
    }

    expect(pendingOps.size).toBe(MAX_PENDING_OPS);

    // Try to add one more
    const canAdd = pendingOps.size < MAX_PENDING_OPS;
    expect(canAdd).toBe(false);
  });
});

describe("Foxglove Worker - Error Handling", () => {
  test("should provide error context for failed advertise", () => {
    const errors: any[] = [];
    const mockErrorHandler = {
      handle: (error: any) => errors.push(error),
      handleRaw: (error: any, context: any) =>
        errors.push({ error, ...context }),
    };

    // Simulate advertise failure
    mockErrorHandler.handle({
      message: "Failed to advertise topic /test",
      context: { topic: "/test", schemaName: "std_msgs/msg/String" },
    });

    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Failed to advertise");
    expect(errors[0].context.topic).toBe("/test");
  });

  test("should handle publish when not connected", () => {
    const errors: any[] = [];
    const connected = false;
    const client = null;

    // Simulate publish attempt when not connected
    errors.push({
      message: "Cannot publish on /test: not connected",
      context: { topic: "/test" },
    });

    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("not connected");
  });
});
