/**
 * Tests for Remote Call system
 *
 * Critical: Enables calling ROS services, triggering actions. Failures = can't control robot.
 * Focus: Call lifecycle, error handling, concurrent calls, cleanup
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { getDefaultStore } from "jotai";
import {
	remoteCallsAtom,
	allRemoteCallsAtom,
	remoteCallCountAtom,
	remoteCallsByDatasourceAtom,
	remoteCallSourcesAtom,
	setRemoteCalls,
	addRemoteCall,
	removeRemoteCall,
	clearRemoteCallsFromDatasource,
	getRemoteCalls,
	getAllRemoteCalls,
} from "../remote-call-atoms";
import type { RemoteCallDefinition } from "../remote-call-interface";

describe("Remote Call Atoms - Basic Operations", () => {
	let store: ReturnType<typeof getDefaultStore>;

	beforeEach(() => {
		// Use the default store and clear it before each test
		store = getDefaultStore();
		store.set(remoteCallsAtom, new Map());
		store.set(remoteCallSourcesAtom, new Set());
	});

	test("should start with empty remote calls", () => {
		const calls = store.get(remoteCallsAtom);
		expect(calls.size).toBe(0);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(0);

		const count = store.get(remoteCallCountAtom);
		expect(count).toBe(0);
	});

	test("should add remote calls from a datasource", () => {
		const datasourceId = "test-datasource";
		const calls: RemoteCallDefinition[] = [
			{
				name: "/set_mode",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: {
					type: "object",
					properties: { mode: { type: "string" } },
				},
				responseSchema: {
					type: "object",
					properties: { success: { type: "boolean" } },
				},
			},
			{
				name: "/emergency_stop",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object", properties: {} },
				responseSchema: {
					type: "object",
					properties: { stopped: { type: "boolean" } },
				},
			},
		];

		setRemoteCalls(datasourceId, calls);

		const storedCalls = store.get(remoteCallsAtom);
		expect(storedCalls.size).toBe(1);
		expect(storedCalls.get(datasourceId)).toEqual(calls);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(2);

		const count = store.get(remoteCallCountAtom);
		expect(count).toBe(2);
	});

	test("should replace existing calls when calling setRemoteCalls again", () => {
		const datasourceId = "test-datasource";

		const initialCalls: RemoteCallDefinition[] = [
			{
				name: "/call1",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		];

		setRemoteCalls(datasourceId, initialCalls);
		expect(store.get(remoteCallCountAtom)).toBe(1);

		const newCalls: RemoteCallDefinition[] = [
			{
				name: "/call2",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
			{
				name: "/call3",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		];

		setRemoteCalls(datasourceId, newCalls);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(2);
		expect(allCalls[0]!.name).toBe("/call2");
		expect(allCalls[1]!.name).toBe("/call3");
	});

	test("should add single remote call to existing datasource", () => {
		const datasourceId = "test-datasource";

		const existingCall: RemoteCallDefinition = {
			name: "/existing",
			datasource_id: datasourceId,
			source: {} as any,
			requestType: "test_request",
			rawRequestType: "test_request",
			responseType: "test_response",
			rawResponseType: "test_response",
			requestSchema: { type: "object" },
			responseSchema: { type: "object" },
		};

		setRemoteCalls(datasourceId, [existingCall]);

		const newCall: RemoteCallDefinition = {
			name: "/new_call",
			datasource_id: datasourceId,
			source: {} as any,
			requestType: "test_request",
			rawRequestType: "test_request",
			responseType: "test_response",
			rawResponseType: "test_response",
			requestSchema: { type: "object" },
			responseSchema: { type: "object" },
		};

		addRemoteCall(datasourceId, newCall);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(2);
		expect(allCalls.some((c) => c.name === "/existing")).toBe(true);
		expect(allCalls.some((c) => c.name === "/new_call")).toBe(true);
	});

	test("should update existing call when adding with same name", () => {
		const datasourceId = "test-datasource";

		const call1: RemoteCallDefinition = {
			name: "/update_test",
			datasource_id: datasourceId,
			source: {} as any,
			requestType: "test_request",
			rawRequestType: "test_request",
			responseType: "test_response",
			rawResponseType: "test_response",
			requestSchema: { type: "object" },
			responseSchema: { type: "object" },
		};

		addRemoteCall(datasourceId, call1);

		const call2: RemoteCallDefinition = {
			name: "/update_test",
			datasource_id: datasourceId,
			source: {} as any,
			requestType: "test_string",
			rawRequestType: "test_string",
			responseType: "test_string",
			rawResponseType: "test_string",
			requestSchema: { type: "string" },
			responseSchema: { type: "string" },
		};

		addRemoteCall(datasourceId, call2);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(1);
		expect(allCalls[0]!.name).toBe("/update_test");
		expect(allCalls[0]!.requestType).toBe("test_string");
	});

	test("should remove specific remote call", () => {
		const datasourceId = "test-datasource";
		const calls: RemoteCallDefinition[] = [
			{
				name: "/call1",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
			{
				name: "/call2",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		];

		setRemoteCalls(datasourceId, calls);
		expect(store.get(remoteCallCountAtom)).toBe(2);

		removeRemoteCall(datasourceId, "/call1");

		const remainingCalls = store.get(allRemoteCallsAtom);
		expect(remainingCalls.length).toBe(1);
		expect(remainingCalls[0]!.name).toBe("/call2");
	});

	test("should clear all calls from a datasource", () => {
		const datasource1 = "datasource1";
		const datasource2 = "datasource2";

		setRemoteCalls(datasource1, [
			{
				name: "/ds1_call1",
				datasource_id: datasource1,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		setRemoteCalls(datasource2, [
			{
				name: "/ds2_call1",
				datasource_id: datasource2,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		expect(store.get(remoteCallCountAtom)).toBe(2);

		clearRemoteCallsFromDatasource(datasource1);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(1);
		expect(allCalls[0]!.name).toBe("/ds2_call1");
	});
});

describe("Remote Call Atoms - Multiple Datasources", () => {
	let store: ReturnType<typeof getDefaultStore>;

	beforeEach(() => {
		store = getDefaultStore();
		store.set(remoteCallsAtom, new Map());
		store.set(remoteCallSourcesAtom, new Set());
	});

	test("should handle calls from multiple datasources", () => {
		const ds1Calls: RemoteCallDefinition[] = [
			{
				name: "/ds1_service",
				datasource_id: "datasource1",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		];

		const ds2Calls: RemoteCallDefinition[] = [
			{
				name: "/ds2_service",
				datasource_id: "datasource2",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		];

		setRemoteCalls("datasource1", ds1Calls);
		setRemoteCalls("datasource2", ds2Calls);

		const byDatasource = store.get(remoteCallsByDatasourceAtom);
		expect(byDatasource.size).toBe(2);
		expect(byDatasource.get("datasource1")).toEqual(ds1Calls);
		expect(byDatasource.get("datasource2")).toEqual(ds2Calls);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(2);
	});

	test("should track datasource sources correctly", () => {
		setRemoteCalls("ds1", [
			{
				name: "/service1",
				datasource_id: "ds1",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		setRemoteCalls("ds2", [
			{
				name: "/service2",
				datasource_id: "ds2",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		const sources = store.get(remoteCallSourcesAtom);
		expect(sources.size).toBe(2);
		expect(sources.has("ds1")).toBe(true);
		expect(sources.has("ds2")).toBe(true);
	});

	test("should allow same service name from different datasources", () => {
		const sameName = "/common_service";

		setRemoteCalls("ds1", [
			{
				name: sameName,
				datasource_id: "ds1",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		setRemoteCalls("ds2", [
			{
				name: sameName,
				datasource_id: "ds2",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(2);

		const names = allCalls.map((c) => c.name);
		expect(names).toContain("/common_service");
		expect(names.length).toBe(2);
	});
});

describe("Remote Call Atoms - Edge Cases", () => {
	let store: ReturnType<typeof getDefaultStore>;

	beforeEach(() => {
		store = getDefaultStore();
		store.set(remoteCallsAtom, new Map());
		store.set(remoteCallSourcesAtom, new Set());
	});

	test("should handle empty call arrays", () => {
		setRemoteCalls("empty-datasource", []);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(0);
	});

	test("should handle removing non-existent call gracefully", () => {
		setRemoteCalls("test-ds", [
			{
				name: "/existing",
				datasource_id: "test-ds",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		// Should not throw
		removeRemoteCall("test-ds", "/non-existent");

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(1);
	});

	test("should handle clearing non-existent datasource gracefully", () => {
		setRemoteCalls("existing-ds", [
			{
				name: "/service",
				datasource_id: "existing-ds",
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		]);

		// Should not throw
		clearRemoteCallsFromDatasource("non-existent-ds");

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(1);
	});

	test("should handle calls with complex schemas", () => {
		const complexCall: RemoteCallDefinition = {
			name: "/complex_service",
			datasource_id: "complex-ds",
			source: {} as any,
			requestType: "complex_request",
			rawRequestType: "complex_request",
			responseType: "complex_response",
			rawResponseType: "complex_response",
			requestSchema: {
				type: "object",
				properties: {
					nested: {
						type: "object",
						properties: {
							array: {
								type: "array",
								items: { type: "number" },
							},
						},
					},
				},
			},
			responseSchema: {
				type: "object",
				properties: {
					result: {
						type: "object",
						additionalProperties: true,
					},
				},
			},
		};

		setRemoteCalls("complex-ds", [complexCall]);

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(1);
		expect(allCalls[0]).toEqual(complexCall);
	});
});

describe("Remote Call Atoms - Store Access Functions", () => {
	let store: ReturnType<typeof getDefaultStore>;

	beforeEach(() => {
		store = getDefaultStore();
		store.set(remoteCallsAtom, new Map());
		store.set(remoteCallSourcesAtom, new Set());
	});

	test("should provide access outside React components", () => {
		const datasourceId = "external-datasource";
		const calls: RemoteCallDefinition[] = [
			{
				name: "/external_call",
				datasource_id: datasourceId,
				source: {} as any,
				requestType: "test_request",
				rawRequestType: "test_request",
				responseType: "test_response",
				rawResponseType: "test_response",
				requestSchema: { type: "object" },
				responseSchema: { type: "object" },
			},
		];

		setRemoteCalls(datasourceId, calls);

		// Use external access functions
		const allCalls = getAllRemoteCalls();
		expect(allCalls.length).toBe(1);
		expect(allCalls[0]!.name).toBe("/external_call");

		const callsByDs = getRemoteCalls();
		expect(callsByDs.size).toBe(1);
		expect(callsByDs.get(datasourceId)).toEqual(calls);
	});
});

describe("Remote Call Atoms - Concurrency", () => {
	let store: ReturnType<typeof getDefaultStore>;

	beforeEach(() => {
		store = getDefaultStore();
		store.set(remoteCallsAtom, new Map());
		store.set(remoteCallSourcesAtom, new Set());
	});

	test("should handle rapid updates from same datasource", () => {
		const datasourceId = "rapid-ds";

		// Rapidly set calls multiple times
		for (let i = 0; i < 10; i++) {
			setRemoteCalls(datasourceId, [
				{
					name: `/call_${i}`,
					datasource_id: datasourceId,
					source: {} as any,
					requestType: "test_request",
					rawRequestType: "test_request",
					responseType: "test_response",
					rawResponseType: "test_response",
					requestSchema: { type: "object" },
					responseSchema: { type: "object" },
				},
			]);
		}

		const allCalls = store.get(allRemoteCallsAtom);
		// Should only have the last set
		expect(allCalls.length).toBe(1);
		expect(allCalls[0]!.name).toBe("/call_9");
	});

	test("should handle concurrent updates from different datasources", () => {
		const numDatasources = 5;

		// Simulate concurrent updates
		for (let i = 0; i < numDatasources; i++) {
			setRemoteCalls(`datasource-${i}`, [
				{
					name: `/service-${i}`,
					datasource_id: `datasource-${i}`,
					source: {} as any,
					requestType: "test_request",
					rawRequestType: "test_request",
					responseType: "test_response",
					rawResponseType: "test_response",
					requestSchema: { type: "object" },
					responseSchema: { type: "object" },
				},
			]);
		}

		const allCalls = store.get(allRemoteCallsAtom);
		expect(allCalls.length).toBe(numDatasources);

		const byDatasource = store.get(remoteCallsByDatasourceAtom);
		expect(byDatasource.size).toBe(numDatasources);
	});
});
