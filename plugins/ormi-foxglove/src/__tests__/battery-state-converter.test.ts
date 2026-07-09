import { describe, expect, it } from "bun:test";

import type { BatteryState } from "@workspace/ormi-core/types";

import { UnifiedConverter } from "../unified-converter";

const battery =
	UnifiedConverter.converters.BatteryState!.conversions[
		"sensor_msgs/msg/BatteryState"
	]!;

const fromRos2 = (data: unknown): BatteryState =>
	battery.fromRos2(data) as BatteryState;

describe("BatteryState conversion (foxglove)", () => {
	it("routes sensor_msgs/msg/BatteryState to the BatteryState webapp type", () => {
		expect(
			UnifiedConverter.getWebappTypeFromROSType(
				"sensor_msgs/msg/BatteryState",
			),
		).toBe("BatteryState");
	});

	it("flattens header.stamp to seconds", () => {
		const state = fromRos2({
			header: {
				stamp: { sec: 12, nanosec: 500_000_000 },
				frame_id: "battery_link",
			},
		});
		expect(state.timestamp).toBeCloseTo(12.5, 6);
		expect(state.frameId).toBe("battery_link");
	});

	it("preserves NaN for unmeasured float fields (never 0)", () => {
		const state = fromRos2({
			voltage: 24.1,
			temperature: NaN,
			current: null,
			charge: undefined,
			capacity: "not-a-number",
			percentage: NaN,
		});
		expect(state.voltage).toBe(24.1);
		expect(Number.isNaN(state.temperature)).toBe(true);
		expect(Number.isNaN(state.current)).toBe(true);
		expect(Number.isNaN(state.charge)).toBe(true);
		expect(Number.isNaN(state.capacity)).toBe(true);
		expect(Number.isNaN(state.percentage)).toBe(true);
	});

	it("passes enum values through unchanged and coerces present to boolean", () => {
		const state = fromRos2({
			power_supply_status: 2,
			power_supply_health: 4,
			power_supply_technology: 3,
			present: 1,
		});
		expect(state.powerSupplyStatus).toBe(2);
		expect(state.powerSupplyHealth).toBe(4);
		expect(state.powerSupplyTechnology).toBe(3);
		expect(state.present).toBe(true);
	});

	it("normalizes cell arrays to plain number[] regardless of source shape", () => {
		const state = fromRos2({
			cell_voltage: new Float32Array([3.7, 3.8]),
			cell_temperature: [30, 31, 32],
		});
		expect(Array.isArray(state.cellVoltage)).toBe(true);
		expect(state.cellVoltage.length).toBe(2);
		expect(state.cellVoltage[0]).toBeCloseTo(3.7, 5);
		expect(Array.isArray(state.cellTemperature)).toBe(true);
		expect(state.cellTemperature).toEqual([30, 31, 32]);
	});

	it("defaults strings and stamp for a minimal message", () => {
		const state = fromRos2({});
		expect(state.timestamp).toBe(0);
		expect(state.frameId).toBe("");
		expect(state.location).toBe("");
		expect(state.serialNumber).toBe("");
		expect(state.cellVoltage).toEqual([]);
		expect(state.cellTemperature).toEqual([]);
	});
});
