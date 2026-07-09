import { describe, expect, it } from "bun:test";

import type { DiagnosticArray } from "@workspace/ormi-core/types";

import { UnifiedConverter } from "../unified-converter";

const diagnostic =
	UnifiedConverter.converters.DiagnosticArray!.conversions[
		"diagnostic_msgs/msg/DiagnosticArray"
	]!;

const fromRos2 = (data: unknown): DiagnosticArray =>
	diagnostic.fromRos2(data) as DiagnosticArray;

describe("DiagnosticArray conversion (foxglove)", () => {
	it("routes diagnostic_msgs/msg/DiagnosticArray to the DiagnosticArray webapp type", () => {
		expect(
			UnifiedConverter.getWebappTypeFromROSType(
				"diagnostic_msgs/msg/DiagnosticArray",
			),
		).toBe("DiagnosticArray");
	});

	it("flattens header.stamp to seconds", () => {
		const array = fromRos2({
			header: {
				stamp: { sec: 12, nanosec: 500_000_000 },
				frame_id: "base_link",
			},
			status: [],
		});
		expect(array.timestamp).toBeCloseTo(12.5, 6);
		expect(array.frameId).toBe("base_link");
	});

	it("normalizes a numeric level byte", () => {
		const array = fromRos2({
			status: [{ level: 2, name: "motor", hardware_id: "m0" }],
		});
		expect(array.status[0]!.level).toBe(2);
	});

	it("normalizes a 1-char-string level byte to its char code", () => {
		// Under CBOR/rosbridge a ROS byte can arrive as a 1-char string.
		const array = fromRos2({
			status: [
				{ level: String.fromCharCode(1), name: "cpu" }, // WARN
				{ level: String.fromCharCode(3), name: "lidar" }, // STALE
			],
		});
		expect(array.status[0]!.level).toBe(1);
		expect(array.status[1]!.level).toBe(3);
	});

	it("maps nested status and KeyValue fields with string coercion", () => {
		const array = fromRos2({
			status: [
				{
					level: 1,
					name: "temp",
					message: "hot",
					hardware_id: "cpu0",
					values: [
						{ key: "celsius", value: 91 },
						{ key: 42, value: true },
					],
				},
			],
		});
		const status = array.status[0]!;
		expect(status.name).toBe("temp");
		expect(status.message).toBe("hot");
		expect(status.hardwareId).toBe("cpu0");
		expect(status.values).toEqual([
			{ key: "celsius", value: "91" },
			{ key: "42", value: "true" },
		]);
	});

	it("defaults missing status/values arrays and stamp", () => {
		const array = fromRos2({});
		expect(array.timestamp).toBe(0);
		expect(array.frameId).toBe("");
		expect(array.status).toEqual([]);

		const withoutValues = fromRos2({
			status: [{ level: 0, name: "ok" }],
		});
		const status = withoutValues.status[0]!;
		expect(status.level).toBe(0);
		expect(status.message).toBe("");
		expect(status.hardwareId).toBe("");
		expect(status.values).toEqual([]);
	});
});
