/**
 * Tests for the topic picker's two unattended decisions.
 *
 * Critical: both answers are invisible when wrong. A bad buffer derivation caps
 * a chart at one sample; a bad auto-bind plots a plausible number from the
 * wrong field. Neither surfaces an error anywhere.
 */

import { describe, test, expect } from "bun:test";
import {
	buildSelectedTopic,
	canAutoBindSlot,
	deriveTopicBufferSize,
	findSoleDirectMatch,
	isDirectTypeMatch,
	isPrimitiveOnlySlot,
} from "../topic-auto-select";
import type { DatasourceTopic } from "../../../datasources/datasource-interface";
import type { DataRequirements } from "../../../widgets/widget-interface";

const makeTopic = (
	overrides: Partial<DatasourceTopic> & { topic: string },
): DatasourceTopic => ({
	datasource_id: "ros2",
	source: {
		id: "source-a",
		title: "Robot A",
	} as DatasourceTopic["source"],
	type: "",
	rawType: "",
	...overrides,
});

describe("deriveTopicBufferSize", () => {
	test("defers to the widget when the slot declares nothing", () => {
		expect(deriveTopicBufferSize(undefined)).toBeUndefined();
		expect(deriveTopicBufferSize({})).toBeUndefined();
	});

	test("honours an explicit widget-authored depth", () => {
		expect(deriveTopicBufferSize({ buffer: 1 })).toBe(1);
		expect(deriveTopicBufferSize({ buffer: 2000 })).toBe(2000);
	});

	test("rejects nonsense rather than clamping it", () => {
		// A clamped value would silently override the widget's own buffersSize.
		expect(deriveTopicBufferSize({ buffer: 0 })).toBeUndefined();
		expect(deriveTopicBufferSize({ buffer: -5 })).toBeUndefined();
		expect(deriveTopicBufferSize({ buffer: 1.5 })).toBeUndefined();
		expect(deriveTopicBufferSize({ buffer: Number.NaN })).toBeUndefined();
		expect(
			deriveTopicBufferSize({ buffer: Number.POSITIVE_INFINITY }),
		).toBeUndefined();
		expect(
			deriveTopicBufferSize({
				buffer: "100" as unknown as number,
			}),
		).toBeUndefined();
	});
});

describe("isDirectTypeMatch", () => {
	const requirements: DataRequirements = {
		accepts: ["Image"],
		acceptsRaw: ["sensor_msgs/msg/CompressedImage"],
	};

	test("matches on the webapp type", () => {
		expect(
			isDirectTypeMatch(
				makeTopic({ topic: "/cam", type: "Image" }),
				requirements,
			),
		).toBe(true);
	});

	test("matches on the raw type", () => {
		expect(
			isDirectTypeMatch(
				makeTopic({
					topic: "/cam",
					rawType: "sensor_msgs/msg/CompressedImage",
				}),
				requirements,
			),
		).toBe(true);
	});

	test("does not match a mere property match", () => {
		expect(
			isDirectTypeMatch(makeTopic({ topic: "/odom", type: "Odometry" }), {
				accepts: ["number"],
			}),
		).toBe(false);
	});

	test("never matches when there are no requirements", () => {
		expect(
			isDirectTypeMatch(
				makeTopic({ topic: "/cam", type: "Image" }),
				undefined,
			),
		).toBe(false);
	});
});

describe("isPrimitiveOnlySlot", () => {
	test("reports a slot that accepts only scalars", () => {
		expect(isPrimitiveOnlySlot({ accepts: ["number"] })).toBe(true);
		expect(isPrimitiveOnlySlot({ accepts: ["number", "boolean"] })).toBe(
			true,
		);
		expect(isPrimitiveOnlySlot({ accepts: ["string"] })).toBe(true);
	});

	test("a structural type anywhere in the list makes the slot structural", () => {
		expect(isPrimitiveOnlySlot({ accepts: ["number", "Vector3"] })).toBe(
			false,
		);
		expect(isPrimitiveOnlySlot({ accepts: ["PointsCloud"] })).toBe(false);
	});

	test("a named raw message type is a deliberate declaration, not a scalar", () => {
		expect(
			isPrimitiveOnlySlot({
				accepts: ["number"],
				acceptsRaw: ["sensor_msgs/msg/BatteryState"],
			}),
		).toBe(false);
	});

	test("says nothing about a slot with no accepted types", () => {
		expect(isPrimitiveOnlySlot(undefined)).toBe(false);
		expect(isPrimitiveOnlySlot({ accepts: [] })).toBe(false);
	});
});

describe("canAutoBindSlot", () => {
	test("allows a structural, primary slot", () => {
		expect(canAutoBindSlot({ requirements: { accepts: ["Image"] } })).toBe(
			true,
		);
		expect(
			canAutoBindSlot({
				requirements: { accepts: ["Image"] },
				role: "primary",
			}),
		).toBe(true);
	});

	test("refuses a scalar-only slot", () => {
		// The sole `number` on the wire is whichever robot enumerated first.
		expect(canAutoBindSlot({ requirements: { accepts: ["number"] } })).toBe(
			false,
		);
	});

	test("refuses a secondary slot however structural it is", () => {
		expect(
			canAutoBindSlot({
				requirements: { accepts: ["GeolocationPosition"] },
				role: "secondary",
			}),
		).toBe(false);
	});

	test("refuses a slot with nothing declared", () => {
		expect(canAutoBindSlot(undefined)).toBe(false);
		expect(canAutoBindSlot({})).toBe(false);
	});
});

describe("findSoleDirectMatch", () => {
	const imageRequirements: DataRequirements = { accepts: ["Image"] };

	test("binds the one directly matching topic", () => {
		const topics = [
			makeTopic({ topic: "/cam", type: "Image" }),
			makeTopic({ topic: "/scan", type: "LaserScan" }),
			makeTopic({ topic: "/joint", type: "JointState" }),
		];

		expect(findSoleDirectMatch(topics, imageRequirements)?.topic).toBe(
			"/cam",
		);
	});

	test("declines when two topics match directly", () => {
		const topics = [
			makeTopic({ topic: "/cam_front", type: "Image" }),
			makeTopic({ topic: "/cam_rear", type: "Image" }),
		];

		expect(findSoleDirectMatch(topics, imageRequirements)).toBeNull();
	});

	test("declines when the same topic name exists on two sources", () => {
		const topics = [
			makeTopic({ topic: "/cam", type: "Image" }),
			makeTopic({
				topic: "/cam",
				type: "Image",
				source: {
					id: "source-b",
					title: "Robot B",
				} as DatasourceTopic["source"],
			}),
		];

		expect(findSoleDirectMatch(topics, imageRequirements)).toBeNull();
	});

	test("collapses a duplicated entry for the same topic and source", () => {
		const topics = [
			makeTopic({ topic: "/cam", type: "Image" }),
			makeTopic({ topic: "/cam", type: "Image" }),
		];

		expect(findSoleDirectMatch(topics, imageRequirements)?.topic).toBe(
			"/cam",
		);
	});

	test("binds a raw-type-only match through the compatibility gate", () => {
		const topics = [
			makeTopic({ topic: "/cam", rawType: "sensor_msgs/msg/Image" }),
			makeTopic({ topic: "/scan", rawType: "sensor_msgs/msg/LaserScan" }),
		];

		expect(
			findSoleDirectMatch(topics, {
				accepts: [],
				acceptsRaw: ["sensor_msgs/msg/Image"],
			})?.topic,
		).toBe("/cam");
	});

	test("declines when nothing matches directly", () => {
		const topics = [makeTopic({ topic: "/scan", type: "LaserScan" })];

		expect(findSoleDirectMatch(topics, imageRequirements)).toBeNull();
	});

	test("never binds a property match, even as the only candidate", () => {
		// Odometry is `isCompatible` with a number slot through
		// pose.pose.position.x — a plausible, wrong plot if bound unattended.
		const topics = [makeTopic({ topic: "/odom", type: "Odometry" })];

		expect(findSoleDirectMatch(topics, { accepts: ["number"] })).toBeNull();
	});

	test("never binds a scalar-only slot, even with one match", () => {
		// A robot part-way through enumerating leaves exactly one number topic;
		// binding it reads as a considered choice and is an accident.
		const topics = [makeTopic({ topic: "/battery", type: "number" })];

		expect(findSoleDirectMatch(topics, { accepts: ["number"] })).toBeNull();
	});

	test("still binds a scalar slot that names a raw message type", () => {
		const topics = [
			makeTopic({
				topic: "/battery",
				type: "number",
				rawType: "sensor_msgs/msg/BatteryState",
			}),
		];

		expect(
			findSoleDirectMatch(topics, {
				accepts: ["number"],
				acceptsRaw: ["sensor_msgs/msg/BatteryState"],
			})?.topic,
		).toBe("/battery");
	});

	test("never binds a secondary slot", () => {
		// A heatmap's weighting channel is not what the operator's intent
		// determines, so there is no intent to infer.
		const topics = [makeTopic({ topic: "/cam", type: "Image" })];

		expect(
			findSoleDirectMatch(topics, imageRequirements, {
				role: "secondary",
			}),
		).toBeNull();
		expect(
			findSoleDirectMatch(topics, imageRequirements, {
				role: "primary",
			})?.topic,
		).toBe("/cam");
	});

	test("declines when the slot has no requirements", () => {
		const topics = [makeTopic({ topic: "/cam", type: "Image" })];

		expect(findSoleDirectMatch(topics, undefined)).toBeNull();
	});

	test("declines on a wildcard slot", () => {
		const topics = [makeTopic({ topic: "/cam", type: "Image" })];

		expect(findSoleDirectMatch(topics, { accepts: ["*"] })).toBeNull();
	});

	test("declines on an empty topic list", () => {
		expect(findSoleDirectMatch([], imageRequirements)).toBeNull();
	});
});

describe("buildSelectedTopic", () => {
	const topic = makeTopic({
		topic: "/cam",
		type: "Image",
		rawType: "sensor_msgs/msg/Image",
	});

	test("omits bufferSize entirely when the widget governs", () => {
		const selection = buildSelectedTopic(topic, "", undefined);

		expect(selection).not.toHaveProperty("bufferSize");
		expect(selection.topic).toBe("/cam");
		expect(selection.property).toBe("");
	});

	test("carries an explicit buffer override through", () => {
		expect(buildSelectedTopic(topic, "data", 2000).bufferSize).toBe(2000);
	});
});
