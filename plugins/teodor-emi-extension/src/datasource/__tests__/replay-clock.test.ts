/**
 * The replay clock.
 *
 * Wall time is injected, so a whole survey runs in a millisecond and the
 * awkward cases — changing rate mid-play, seeking while paused, falling behind
 * — are testable without a worker or a recording.
 */

import { describe, expect, test } from "bun:test";
import { ReplayClock } from "../replay-clock";

/** One second of recording, in nanoseconds. */
const SEC = 1e9;

describe("ReplayClock", () => {
	test("starts paused at the beginning", () => {
		const c = new ReplayClock(10 * SEC, 1000);
		expect(c.positionAt(1000)).toBe(0);
		expect(c.positionAt(9999)).toBe(0);
		expect(c.state(1000).playing).toBe(false);
	});

	test("advances with wall time at 1x", () => {
		const c = new ReplayClock(10 * SEC, 1000);
		c.play(1000);
		expect(c.positionAt(1500)).toBeCloseTo(0.5 * SEC, 0);
		expect(c.positionAt(3000)).toBeCloseTo(2 * SEC, 0);
	});

	test("rate scales the advance", () => {
		const c = new ReplayClock(100 * SEC, 0);
		c.setRate(0, 5);
		c.play(0);
		expect(c.positionAt(1000)).toBeCloseTo(5 * SEC, 0);
	});

	test("changing rate mid-play does not jump", () => {
		// The trap: recomputing the whole elapsed span at the new rate would
		// teleport the playhead. Two seconds in at 1x must stay two seconds in.
		const c = new ReplayClock(100 * SEC, 0);
		c.play(0);
		expect(c.positionAt(2000)).toBeCloseTo(2 * SEC, 0);
		c.setRate(2000, 10);
		expect(c.positionAt(2000)).toBeCloseTo(2 * SEC, 0);
		// ...and from there it runs ten times faster.
		expect(c.positionAt(2100)).toBeCloseTo(2 * SEC + 1 * SEC, 0);
	});

	test("pause holds the position, and time passing does not move it", () => {
		const c = new ReplayClock(100 * SEC, 0);
		c.play(0);
		c.pause(3000);
		expect(c.positionAt(3000)).toBeCloseTo(3 * SEC, 0);
		expect(c.positionAt(99_000)).toBeCloseTo(3 * SEC, 0);
	});

	test("resuming continues from where it paused", () => {
		const c = new ReplayClock(100 * SEC, 0);
		c.play(0);
		c.pause(3000);
		c.play(50_000);
		expect(c.positionAt(50_000)).toBeCloseTo(3 * SEC, 0);
		expect(c.positionAt(51_000)).toBeCloseTo(4 * SEC, 0);
	});

	test("the position never runs past the end of the recording", () => {
		const c = new ReplayClock(2 * SEC, 0);
		c.play(0);
		expect(c.positionAt(60_000)).toBe(2 * SEC);
		expect(c.atEnd(60_000)).toBe(true);
	});

	test("seeking works while paused and while playing", () => {
		const c = new ReplayClock(100 * SEC, 0);
		c.seek(0, 42 * SEC);
		expect(c.positionAt(5000)).toBeCloseTo(42 * SEC, 0);
		c.play(5000);
		c.seek(6000, 10 * SEC);
		expect(c.positionAt(6000)).toBeCloseTo(10 * SEC, 0);
		// Still playing after the seek.
		expect(c.positionAt(7000)).toBeCloseTo(11 * SEC, 0);
	});

	test("seeking clamps to the recording rather than going negative or past the end", () => {
		const c = new ReplayClock(10 * SEC, 0);
		c.seek(0, -5 * SEC);
		expect(c.positionAt(0)).toBe(0);
		c.seek(0, 999 * SEC);
		expect(c.positionAt(0)).toBe(10 * SEC);
	});

	test("a nonsense seek target is treated as the beginning, not as NaN", () => {
		const c = new ReplayClock(10 * SEC, 0);
		c.seek(0, NaN);
		expect(c.positionAt(0)).toBe(0);
	});

	test("a nonsense rate is ignored rather than freezing the clock", () => {
		const c = new ReplayClock(100 * SEC, 0);
		c.play(0);
		c.setRate(1000, 0);
		c.setRate(1000, -3);
		c.setRate(1000, NaN);
		expect(c.state(1000).rate).toBe(1);
		expect(c.positionAt(2000)).toBeCloseTo(2 * SEC, 0);
	});

	test("holdAt slows playback instead of skipping messages", () => {
		// When a tick cannot publish everything due, the clock is pulled back to
		// the last message actually delivered — so the surplus is replayed next
		// tick. A replay that runs slow is fine; a detector that never sees a
		// sample is wrong.
		const c = new ReplayClock(100 * SEC, 0);
		c.play(0);
		expect(c.positionAt(5000)).toBeCloseTo(5 * SEC, 0);
		c.holdAt(5000, 3 * SEC);
		expect(c.positionAt(5000)).toBeCloseTo(3 * SEC, 0);
		// ...and it carries on from there rather than snapping forward.
		expect(c.positionAt(6000)).toBeCloseTo(4 * SEC, 0);
	});

	test("holdAt never drags the clock forward", () => {
		const c = new ReplayClock(100 * SEC, 0);
		c.play(0);
		c.holdAt(2000, 90 * SEC);
		expect(c.positionAt(2000)).toBeCloseTo(2 * SEC, 0);
	});

	test("a duration learned later takes effect", () => {
		const c = new ReplayClock(0, 0);
		c.play(0);
		expect(c.positionAt(5000)).toBe(0);
		c.setDuration(10 * SEC);
		expect(c.positionAt(5000)).toBeCloseTo(5 * SEC, 0);
	});

	test("state reports what the transport needs", () => {
		const c = new ReplayClock(10 * SEC, 0);
		c.setRate(0, 2);
		c.play(0);
		const s = c.state(1000);
		expect(s.playing).toBe(true);
		expect(s.rate).toBe(2);
		expect(s.durationNs).toBe(10 * SEC);
		expect(s.positionNs).toBeCloseTo(2 * SEC, 0);
	});
});
