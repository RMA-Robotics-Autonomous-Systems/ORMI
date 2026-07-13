import { describe, expect, it } from "bun:test";

import type { LoadgenGenerator } from "../index";
import type { PointsCloud } from "@workspace/ormi-core/types";
import {
	createGeneratorState,
	decodeCapMsFor,
	decodeFrame,
	getGeneratorForTopic,
	losslessFor,
	pointCountFor,
	produceRaw,
	topicTypeFor,
} from "../loadgen-generators";

const gen = (over: Partial<LoadgenGenerator>): LoadgenGenerator => ({
	topicPrefix: "/load/x",
	topicCount: 1,
	type: "object",
	rateHz: 30,
	payloadBytes: 4096,
	...over,
});

describe("produceRaw + decodeFrame round-trip", () => {
	it("scalar produces a JSON string that decodes to a number", () => {
		const generator = gen({ type: "scalar", payloadBytes: 256 });
		const state = createGeneratorState(generator);
		const raw = produceRaw(generator, state);

		expect(typeof raw.bytes).toBe("string");
		expect(raw.time).toBeGreaterThan(0);
		expect(typeof decodeFrame(raw, generator)).toBe("number");
	});

	it("scalar payload string grows with payloadBytes", () => {
		const small = gen({ type: "scalar", payloadBytes: 64 });
		const large = gen({ type: "scalar", payloadBytes: 8192 });
		const smallBytes = produceRaw(small, createGeneratorState(small))
			.bytes as string;
		const largeBytes = produceRaw(large, createGeneratorState(large))
			.bytes as string;

		expect(largeBytes.length).toBeGreaterThan(smallBytes.length);
		expect(largeBytes.length).toBeGreaterThanOrEqual(8192 - 64);
	});

	it("object decodes to a populated odom-like message", () => {
		const generator = gen({ type: "object" });
		const state = createGeneratorState(generator);
		const decoded = decodeFrame(
			produceRaw(generator, state),
			generator,
		) as Record<string, unknown>;

		expect(decoded).toHaveProperty("pose");
		expect(decoded).toHaveProperty("velocity");
	});

	it("malformed frames still parse but eventually omit a field", () => {
		const generator = gen({ type: "malformed" });
		const state = createGeneratorState(generator);

		let sawOmission = false;
		for (let i = 0; i < 40; i++) {
			const raw = produceRaw(generator, state);
			// Every frame must remain valid JSON (parses without throwing).
			const decoded = decodeFrame(raw, generator) as {
				pose: { position?: unknown; orientation?: unknown };
				velocity: { linear?: unknown; angular?: unknown };
			};
			if (
				decoded.pose.position === undefined ||
				decoded.pose.orientation === undefined ||
				decoded.velocity.linear === undefined ||
				decoded.velocity.angular === undefined
			) {
				sawOmission = true;
			}
		}
		// 40 frames → at least 4 tenth-frames, so an omission is guaranteed.
		expect(sawOmission).toBe(true);
	});

	it("pointcloud produces a packed buffer decoding to typed-array PointsCloud", () => {
		const generator = gen({ type: "pointcloud", payloadBytes: 1200 });
		const state = createGeneratorState(generator);
		const raw = produceRaw(generator, state);

		expect(raw.bytes).toBeInstanceOf(ArrayBuffer);

		const numPoints = pointCountFor(generator);
		const decoded = decodeFrame(raw, generator) as PointsCloud;
		expect(decoded.points).toBeInstanceOf(Float32Array);
		expect(decoded.points.length).toBe(numPoints * 3);
		expect(decoded.colors).toBeInstanceOf(Float32Array);
		expect(decoded.colors!.length).toBe(numPoints * 3);
	});
});

describe("topic metadata helpers", () => {
	it("topicTypeFor maps payload shapes to webapp types", () => {
		expect(topicTypeFor(gen({ type: "scalar" }))).toBe("number");
		expect(topicTypeFor(gen({ type: "pointcloud" }))).toBe("PointsCloud");
		expect(topicTypeFor(gen({ type: "object" }))).toBe("object");
		expect(topicTypeFor(gen({ type: "malformed" }))).toBe("object");
	});

	it("losslessFor is lossy for every type (state-like payloads)", () => {
		expect(losslessFor(gen({ type: "scalar" }))).toBe(false);
		expect(losslessFor(gen({ type: "pointcloud" }))).toBe(false);
	});

	it("decodeCapMsFor caps only pointclouds", () => {
		expect(decodeCapMsFor(gen({ type: "pointcloud" }))).toBeCloseTo(
			1000 / 12,
		);
		expect(decodeCapMsFor(gen({ type: "scalar" }))).toBe(0);
		expect(decodeCapMsFor(gen({ type: "object" }))).toBe(0);
	});
});

describe("getGeneratorForTopic", () => {
	const generators = [
		gen({ topicPrefix: "/load/scalar", topicCount: 3, type: "scalar" }),
		gen({ topicPrefix: "/load/cloud", topicCount: 2, type: "pointcloud" }),
	];

	it("resolves a valid indexed topic to its generator", () => {
		expect(getGeneratorForTopic("/load/scalar/2", generators)?.type).toBe(
			"scalar",
		);
		expect(getGeneratorForTopic("/load/cloud/0", generators)?.type).toBe(
			"pointcloud",
		);
	});

	it("rejects out-of-range, non-integer, and unknown topics", () => {
		expect(
			getGeneratorForTopic("/load/scalar/3", generators),
		).toBeUndefined();
		expect(
			getGeneratorForTopic("/load/scalar/x", generators),
		).toBeUndefined();
		expect(
			getGeneratorForTopic("/load/other/0", generators),
		).toBeUndefined();
	});
});
