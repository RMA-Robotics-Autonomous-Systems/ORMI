/** A contiguous run of ring slots written since the last drain (in points, not array elements). */
export interface RingWriteSpan {
	/** First written slot index. */
	start: number;
	/** Number of written slots. */
	count: number;
}

export class RingPointBuffer {
	private positions: Float32Array;
	private colors: Float32Array;
	private intensities: Float32Array;
	private timestamps: Float32Array;
	private capacity: number;
	private writeIndex: number = 0;
	private filled: number = 0;
	private pendingSpans: RingWriteSpan[] = [];
	private pendingCovered: number = 0;

	constructor(capacity: number) {
		this.capacity = capacity;
		this.positions = new Float32Array(capacity * 3);
		this.colors = new Float32Array(capacity * 3);
		this.intensities = new Float32Array(capacity);
		this.timestamps = new Float32Array(capacity);
		this.timestamps.fill(0);
	}

	push(
		positions: Float32Array,
		colors: Float32Array,
		intensities: Float32Array,
		count: number,
		currentTime: number,
	): void {
		if (count <= 0) return;

		const spanStart = this.writeIndex;

		for (let i = 0; i < count; i++) {
			const srcIdx3 = i * 3;
			const dstIdx = this.writeIndex;
			const dstIdx3 = dstIdx * 3;

			this.positions[dstIdx3] = positions[srcIdx3]!;
			this.positions[dstIdx3 + 1] = positions[srcIdx3 + 1]!;
			this.positions[dstIdx3 + 2] = positions[srcIdx3 + 2]!;
			this.colors[dstIdx3] = colors[srcIdx3]!;
			this.colors[dstIdx3 + 1] = colors[srcIdx3 + 1]!;
			this.colors[dstIdx3 + 2] = colors[srcIdx3 + 2]!;
			this.intensities[dstIdx] = intensities[i]!;
			this.timestamps[dstIdx] = currentTime;

			this.writeIndex = (this.writeIndex + 1) % this.capacity;
		}

		this.filled = Math.min(this.capacity, this.filled + count);
		this.addPendingSpan(spanStart, count);
	}

	getData(): {
		positions: Float32Array;
		colors: Float32Array;
		intensities: Float32Array;
		timestamps: Float32Array;
	} {
		return {
			positions: this.positions,
			colors: this.colors,
			intensities: this.intensities,
			timestamps: this.timestamps,
		};
	}

	getCapacity(): number {
		return this.capacity;
	}

	/**
	 * Number of slots that hold real points (monotonic up to capacity). Use as the
	 * geometry draw range so never-written slots are not rendered.
	 */
	getFillCount(): number {
		return this.filled;
	}

	/**
	 * Return the slot spans written since the last drain and reset the pending set.
	 * Spans are expressed in points; a wrapping write yields two spans. When the
	 * accumulated writes cover the whole buffer, a single full-capacity span is
	 * returned. Intended for partial GPU uploads (`BufferAttribute.addUpdateRange`).
	 */
	drainWriteSpans(): RingWriteSpan[] {
		const spans = this.pendingSpans;
		this.pendingSpans = [];
		this.pendingCovered = 0;
		return spans;
	}

	shiftTimestamps(deltaSeconds: number): void {
		for (let i = 0; i < this.timestamps.length; i++) {
			this.timestamps[i] = this.timestamps[i]! - deltaSeconds;
		}
		// Every slot changed; consumers must re-upload the full buffer.
		this.markAllPending();
	}

	/** Record a write of `count` slots starting at `start` (wrap-aware, coalesces to full). */
	private addPendingSpan(start: number, count: number): void {
		if (
			this.pendingCovered + count >= this.capacity ||
			count >= this.capacity
		) {
			this.markAllPending();
			return;
		}
		this.pendingCovered += count;
		const end = start + count;
		if (end <= this.capacity) {
			this.pendingSpans.push({ start, count });
		} else {
			// Wrapped write: tail segment + head segment.
			this.pendingSpans.push({ start, count: this.capacity - start });
			this.pendingSpans.push({ start: 0, count: end - this.capacity });
		}
	}

	/** Collapse pending spans to a single full-capacity span. */
	private markAllPending(): void {
		this.pendingSpans = [{ start: 0, count: this.capacity }];
		this.pendingCovered = this.capacity;
	}
}
