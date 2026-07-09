/**
 * Guards the lossless mode-selection predicate: `diagnostic_msgs/msg/
 * DiagnosticArray` on a shared `/diagnostics` topic is multi-publisher (low-Hz
 * nodes interleave messages), so — like TF deltas — it must be coalesced
 * losslessly. Everything else stays last-wins.
 */

import { describe, test, expect } from "bun:test";

import { isLosslessRawType } from "../rosbridge-suite-source";

describe("isLosslessRawType", () => {
	test("DiagnosticArray is lossless", () => {
		expect(isLosslessRawType("diagnostic_msgs/msg/DiagnosticArray")).toBe(
			true,
		);
	});

	test("TFMessage stays lossless", () => {
		expect(isLosslessRawType("tf2_msgs/msg/TFMessage")).toBe(true);
	});

	test("sampled-state topics are not lossless", () => {
		expect(isLosslessRawType("sensor_msgs/msg/LaserScan")).toBe(false);
		expect(isLosslessRawType("nav_msgs/msg/Odometry")).toBe(false);
		expect(isLosslessRawType("")).toBe(false);
	});
});
