/**
 * Tests for the map's follow camera decisions.
 *
 * The gesture check fails in two directions and neither shows on a type
 * check: too eager, and zooming in on a followed robot drops the follow; too
 * lax, and an operator who drags away is pulled back on the next fix, with a
 * robot that keeps yanking the view wherever they look. The glide fails just
 * as quietly: a dead zone applied mid-glide parks the robot at its edge, and a
 * step that overshoots makes a jittery fix shake the whole map.
 */

import { describe, test, expect } from "bun:test";
import {
	followDeadbandPx,
	followStep,
	FOLLOW_DEADBAND_MIN_PX,
	FOLLOW_SETTLE_PX,
	isFollowableMarker,
	isOperatorPan,
	latestFix,
	toggleFollow,
} from "../follow-camera";

/** A fix as the GPS converters deliver it. */
const fix = (longitude: unknown, latitude: unknown) => ({
	coords: { longitude, latitude },
	timestamp: 0,
});

describe("isOperatorPan", () => {
	test("a mouse drag pans", () => {
		expect(isOperatorPan("dragstart", { type: "mousedown" })).toBe(true);
	});

	test("a one-finger touch drag pans", () => {
		expect(
			isOperatorPan("dragstart", { type: "touchmove", touches: [{}] }),
		).toBe(true);
	});

	test("a two-finger pinch is a zoom, even though its midpoint drifts", () => {
		expect(
			isOperatorPan("dragstart", {
				type: "touchmove",
				touches: [{}, {}],
			}),
		).toBe(false);
	});

	test("arrow keys pan, shift + arrow rotates or pitches", () => {
		for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
			expect(isOperatorPan("movestart", { key, shiftKey: false })).toBe(
				true,
			);
			expect(isOperatorPan("movestart", { key, shiftKey: true })).toBe(
				false,
			);
		}
	});

	test("keyboard zoom keeps the follow", () => {
		expect(isOperatorPan("movestart", { key: "+", shiftKey: false })).toBe(
			false,
		);
		expect(isOperatorPan("movestart", { key: "-", shiftKey: false })).toBe(
			false,
		);
	});

	test("scroll zoom and mouse rotation keep the follow", () => {
		expect(isOperatorPan("movestart", { type: "wheel", deltaY: 120 })).toBe(
			false,
		);
		expect(
			isOperatorPan("movestart", { type: "mousedown", button: 2 }),
		).toBe(false);
	});

	test("the camera's own moves never end the follow", () => {
		expect(isOperatorPan("movestart", undefined)).toBe(false);
		expect(isOperatorPan("dragstart", undefined)).toBe(false);
	});
});

describe("latestFix", () => {
	test("returns the newest fix as [lng, lat]", () => {
		expect(latestFix([fix(4.1, 50.1), fix(4.2, 50.2)])).toEqual([
			4.2, 50.2,
		]);
	});

	test("an empty buffer has no fix", () => {
		expect(latestFix([])).toBeNull();
	});

	test("a fix without finite coordinates is not a position", () => {
		expect(latestFix([fix(Number.NaN, 50)])).toBeNull();
		expect(latestFix([fix("4", 50)])).toBeNull();
		expect(latestFix([{}])).toBeNull();
	});
});

describe("toggleFollow", () => {
	test("pressing an entry starts following it", () => {
		expect(toggleFollow(null, "a")).toBe("a");
	});

	test("pressing another entry switches to it", () => {
		expect(toggleFollow("a", "b")).toBe("b");
	});

	test("pressing the followed entry stops", () => {
		expect(toggleFollow("a", "a")).toBeNull();
	});
});

describe("isFollowableMarker", () => {
	test("markers that draw a moving position can be followed", () => {
		expect(isFollowableMarker("simple")).toBe(true);
		expect(isFollowableMarker("path")).toBe(true);
		expect(isFollowableMarker("multipoints")).toBe(true);
	});

	test("a heatmap and plugin marker types cannot", () => {
		expect(isFollowableMarker("heatmap")).toBe(false);
		expect(isFollowableMarker("some-plugin-marker")).toBe(false);
		expect(isFollowableMarker(undefined)).toBe(false);
	});
});

describe("followDeadbandPx", () => {
	test("scales with the map's shorter side", () => {
		expect(followDeadbandPx(1600, 1000)).toBe(150);
		expect(followDeadbandPx(1000, 1600)).toBe(150);
	});

	test("never shrinks below the minimum on a small tile", () => {
		expect(followDeadbandPx(100, 80)).toBe(FOLLOW_DEADBAND_MIN_PX);
	});
});

describe("followStep", () => {
	const deadband = 50;

	test("jitter inside the dead zone leaves an idle camera still", () => {
		expect(followStep([30, -30], 16, false, deadband)).toEqual({
			gliding: false,
			move: null,
		});
	});

	test("leaving the dead zone starts a glide toward the entry", () => {
		const step = followStep([100, 0], 16, false, deadband);
		expect(step.gliding).toBe(true);
		const [mx, my] = step.move!;
		expect(mx).toBeGreaterThan(0);
		expect(mx).toBeLessThan(100);
		expect(my).toBe(0);
	});

	test("a glide does not stop at the dead zone's edge", () => {
		const step = followStep([20, 0], 16, true, deadband);
		expect(step.gliding).toBe(true);
		expect(step.move![0]).toBeGreaterThan(0);
	});

	test("a glide converges on the entry without overshooting", () => {
		let offset = 300;
		let gliding = false;
		let frames = 0;
		do {
			const step = followStep([offset, 0], 16, gliding, deadband);
			gliding = step.gliding;
			const moved = step.move?.[0] ?? 0;
			expect(moved).toBeLessThanOrEqual(offset);
			offset -= moved;
			frames += 1;
		} while (gliding && frames < 1000);
		expect(gliding).toBe(false);
		expect(Math.abs(offset)).toBeLessThan(1e-9);
		// ~350 ms time constant at 60 fps: settled in a few seconds, not instantly.
		expect(frames).toBeGreaterThan(20);
		expect(frames).toBeLessThan(400);
	});

	test("the last fraction of a pixel snaps and ends the glide", () => {
		const step = followStep([FOLLOW_SETTLE_PX / 2, 0], 16, true, deadband);
		expect(step).toEqual({
			gliding: false,
			move: [FOLLOW_SETTLE_PX / 2, 0],
		});
	});

	test("reduced motion snaps the whole offset in one frame", () => {
		expect(followStep([100, -40], 16, false, deadband, 0)).toEqual({
			gliding: false,
			move: [100, -40],
		});
	});

	test("reduced motion still honours the dead zone", () => {
		expect(followStep([10, 0], 16, false, deadband, 0).move).toBeNull();
	});

	test("a long frame gap cannot jump past the entry", () => {
		const step = followStep([100, 0], 10_000, true, deadband);
		expect(step.move![0]).toBeLessThan(100);
	});

	test("a position that cannot be projected moves nothing", () => {
		expect(followStep([Number.NaN, 0], 16, true, deadband)).toEqual({
			gliding: false,
			move: null,
		});
	});
});
