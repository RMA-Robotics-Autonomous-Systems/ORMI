export class RingPointBuffer {
	private positions: Float32Array;
	private colors: Float32Array;
	private intensities: Float32Array;
	private timestamps: Float32Array;
	private capacity: number;
	private writeIndex: number = 0;

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

	shiftTimestamps(deltaSeconds: number): void {
		for (let i = 0; i < this.timestamps.length; i++) {
			this.timestamps[i] = this.timestamps[i]! - deltaSeconds;
		}
	}
}
