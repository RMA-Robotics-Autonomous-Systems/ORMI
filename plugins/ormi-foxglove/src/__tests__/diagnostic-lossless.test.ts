/**
 * Guards the DiagnosticArray branch of the foxglove lossless-topic predicate:
 * a shared `/diagnostics` topic is multi-publisher (low-Hz nodes interleave
 * messages), so — like TF deltas — it must be coalesced losslessly rather than
 * last-wins.
 */

import { describe, test, expect } from "bun:test";

import { isDiagnosticSchema } from "../subscription-manager";

describe("isDiagnosticSchema", () => {
	test("matches DiagnosticArray", () => {
		expect(isDiagnosticSchema("diagnostic_msgs/msg/DiagnosticArray")).toBe(
			true,
		);
	});

	test("does not match other schemas", () => {
		expect(isDiagnosticSchema("tf2_msgs/msg/TFMessage")).toBe(false);
		expect(isDiagnosticSchema("diagnostic_msgs/msg/DiagnosticStatus")).toBe(
			false,
		);
		expect(isDiagnosticSchema("sensor_msgs/msg/Image")).toBe(false);
	});
});
