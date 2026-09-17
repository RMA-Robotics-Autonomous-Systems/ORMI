/**
 * Tests for the topic poll's backoff curve.
 *
 * The poll is what a picker depends on to ever have options at all. It used to
 * stop after a fixed number of empty lists and latch `[]`, which left every
 * control on the dashboard permanently empty when a robot took longer than
 * twelve seconds to enumerate — and because the gear card stays mounted between
 * opens, reopening the configuration dialog did not clear it.
 *
 * The replacement never stops, so the only thing left to get wrong is the
 * backoff: a curve that degenerates to a constant hammers the filter forever,
 * and one that grows without bound is indistinguishable from having given up.
 * Neither is visible in a running dashboard.
 */

import { describe, test, expect } from "bun:test";
import {
	nextSettledTopicsDelay,
	SETTLED_TOPICS_MAX_POLL_MS,
	SETTLED_TOPICS_POLL_BACKOFF,
	SETTLED_TOPICS_POLL_MS,
} from "../use-settled-topics";

describe("nextSettledTopicsDelay", () => {
	test("grows the interval after each empty list", () => {
		const second = nextSettledTopicsDelay(SETTLED_TOPICS_POLL_MS);

		expect(second).toBeGreaterThan(SETTLED_TOPICS_POLL_MS);
		expect(second).toBe(
			Math.round(SETTLED_TOPICS_POLL_MS * SETTLED_TOPICS_POLL_BACKOFF),
		);
	});

	test("stops growing at the ceiling instead of stopping altogether", () => {
		let delay = SETTLED_TOPICS_POLL_MS;
		for (let i = 0; i < 100; i += 1) {
			delay = nextSettledTopicsDelay(delay);
			expect(delay).toBeLessThanOrEqual(SETTLED_TOPICS_MAX_POLL_MS);
		}

		expect(delay).toBe(SETTLED_TOPICS_MAX_POLL_MS);
		// The ceiling is a plateau, never a stop: a robot powered on an hour
		// into the session still has to be picked up.
		expect(nextSettledTopicsDelay(delay)).toBe(SETTLED_TOPICS_MAX_POLL_MS);
	});

	test("reaches the ceiling from a nonsense interval rather than spinning", () => {
		expect(nextSettledTopicsDelay(0)).toBe(SETTLED_TOPICS_POLL_MS);
		expect(nextSettledTopicsDelay(-1)).toBe(SETTLED_TOPICS_POLL_MS);
		expect(nextSettledTopicsDelay(Number.NaN)).toBe(SETTLED_TOPICS_POLL_MS);
		expect(nextSettledTopicsDelay(Number.POSITIVE_INFINITY)).toBe(
			SETTLED_TOPICS_POLL_MS,
		);
	});
});
