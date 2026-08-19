/**
 * The virtual clock a recording is replayed against.
 *
 * Pure arithmetic — no timers, no worker, no DOM — so the awkward parts (rate
 * changes mid-playback, seeking while paused, falling behind) are unit-testable
 * without a running replay.
 *
 * Times are **nanoseconds relative to the first message in the recording**,
 * matching what the bag's own `timestamp` column gives after subtracting the
 * start. Wall time is supplied by the caller rather than read here, so a test
 * can drive a whole survey in a millisecond.
 */

/** A clock's observable state. */
export interface ClockState {
	playing: boolean;
	/** Playback rate; 1 is real time. */
	rate: number;
	/** Current position, nanoseconds from the start of the recording. */
	positionNs: number;
	/** Length of the recording, nanoseconds. */
	durationNs: number;
}

export class ReplayClock {
	private playing = false;
	private rate = 1;
	/** Position as of {@link anchorWallMs}. */
	private anchorNs = 0;
	private anchorWallMs = 0;
	private durationNs: number;

	/**
	 * @param durationNs - Length of the recording in nanoseconds.
	 * @param nowMs - Current wall time.
	 */
	constructor(durationNs: number, nowMs: number) {
		this.durationNs = Math.max(0, durationNs);
		this.anchorWallMs = nowMs;
	}

	/**
	 * Position at a given wall time.
	 *
	 * @param nowMs - Current wall time.
	 * @returns Position in nanoseconds, clamped to the recording.
	 */
	positionAt(nowMs: number): number {
		if (!this.playing) return this.anchorNs;
		const elapsedMs = Math.max(0, nowMs - this.anchorWallMs);
		const advanced = this.anchorNs + elapsedMs * 1e6 * this.rate;
		return Math.min(this.durationNs, advanced);
	}

	/** True once the position has reached the end of the recording. */
	atEnd(nowMs: number): boolean {
		return this.durationNs > 0 && this.positionAt(nowMs) >= this.durationNs;
	}

	/**
	 * Re-anchor so the current position is preserved across a state change.
	 *
	 * Every mutator goes through this: without it, changing the rate mid-play
	 * would recompute the whole elapsed span at the new rate and jump.
	 *
	 * @param nowMs - Current wall time.
	 */
	private reanchor(nowMs: number): void {
		this.anchorNs = this.positionAt(nowMs);
		this.anchorWallMs = nowMs;
	}

	/** Start playing from the current position. */
	play(nowMs: number): void {
		this.reanchor(nowMs);
		this.playing = true;
	}

	/** Stop, holding the current position. */
	pause(nowMs: number): void {
		this.reanchor(nowMs);
		this.playing = false;
	}

	/**
	 * Jump to a position, clamped to the recording. Does not change play state.
	 *
	 * @param nowMs - Current wall time.
	 * @param positionNs - Target position.
	 */
	seek(nowMs: number, positionNs: number): void {
		this.anchorNs = Math.min(
			this.durationNs,
			Math.max(0, Number.isFinite(positionNs) ? positionNs : 0),
		);
		this.anchorWallMs = nowMs;
	}

	/**
	 * Change the playback rate, preserving the current position.
	 *
	 * @param nowMs - Current wall time.
	 * @param rate - New rate; non-finite or non-positive values are ignored.
	 */
	setRate(nowMs: number, rate: number): void {
		if (!Number.isFinite(rate) || rate <= 0) return;
		this.reanchor(nowMs);
		this.rate = rate;
	}

	/**
	 * Hold the clock back to a position already reached.
	 *
	 * Used when a tick could not publish everything that was due: playback slows
	 * instead of skipping messages, which is the right trade for an analysis
	 * tool — a detector that never sees a sample is wrong, whereas a replay that
	 * runs at 0.8× is merely slow.
	 *
	 * Only ever moves the clock backwards.
	 *
	 * @param nowMs - Current wall time.
	 * @param positionNs - The last position actually published.
	 */
	holdAt(nowMs: number, positionNs: number): void {
		if (positionNs >= this.positionAt(nowMs)) return;
		this.anchorNs = Math.max(0, positionNs);
		this.anchorWallMs = nowMs;
	}

	/** Change the known duration, e.g. once the recording has been scanned. */
	setDuration(durationNs: number): void {
		this.durationNs = Math.max(0, durationNs);
	}

	/** A snapshot for reporting. */
	state(nowMs: number): ClockState {
		return {
			playing: this.playing,
			rate: this.rate,
			positionNs: this.positionAt(nowMs),
			durationNs: this.durationNs,
		};
	}
}
