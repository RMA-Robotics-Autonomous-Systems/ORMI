import { describe, test, expect } from "bun:test";
import type { TransformEdge, TransformTable } from "@workspace/ormi-core/types";
import {
	createThrottledTransformStore,
	type ThrottleTimers,
	type TransformSource,
} from "../throttled-transforms";

/** Deterministic clock + timer queue for the throttle under test. */
class FakeClock implements ThrottleTimers {
	private t = 0;
	private nextId = 1;
	private timers: { id: number; at: number; cb: () => void }[] = [];

	now = (): number => this.t;

	setTimer = (cb: () => void, ms: number): ReturnType<typeof setTimeout> => {
		const id = this.nextId++;
		this.timers.push({ id, at: this.t + ms, cb });
		return id as unknown as ReturnType<typeof setTimeout>;
	};

	clearTimer = (handle: ReturnType<typeof setTimeout>): void => {
		const id = handle as unknown as number;
		this.timers = this.timers.filter((entry) => entry.id !== id);
	};

	/** Advance time, firing due timers in chronological order. */
	advance(ms: number): void {
		const target = this.t + ms;
		for (;;) {
			const due = this.timers
				.filter((entry) => entry.at <= target)
				.sort((a, b) => a.at - b.at)[0];
			if (!due) break;
			this.timers = this.timers.filter((entry) => entry.id !== due.id);
			this.t = due.at;
			due.cb();
		}
		this.t = target;
	}
}

function makeSource() {
	let table: TransformTable = new Map();
	const listeners = new Set<() => void>();
	const source: TransformSource = {
		subscribe: (cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		getSnapshot: () => table,
	};
	return {
		source,
		push: (next: TransformTable) => {
			table = next;
			for (const listener of listeners) listener();
		},
	};
}

/** A distinct table instance (identity is what the assertions track). */
function tableWith(id: string): TransformTable {
	return new Map<string, TransformEdge>([[id, { rawFrameId: id } as never]]);
}

const INTERVAL = 75;

describe("createThrottledTransformStore", () => {
	test("publishes the first change on the leading edge", () => {
		const { source, push } = makeSource();
		const clock = new FakeClock();
		const store = createThrottledTransformStore(source, INTERVAL, clock);

		const seen: TransformTable[] = [];
		store.subscribe(() => seen.push(store.getSnapshot()));

		const t1 = tableWith("a");
		push(t1);

		expect(store.getSnapshot()).toBe(t1);
		expect(seen).toEqual([t1]);
	});

	test("coalesces a burst to the LATEST table and never drops the final one", () => {
		const { source, push } = makeSource();
		const clock = new FakeClock();
		const store = createThrottledTransformStore(source, INTERVAL, clock);

		const published: TransformTable[] = [];
		store.subscribe(() => published.push(store.getSnapshot()));

		const t1 = tableWith("1");
		push(t1); // t=0 → leading publish
		expect(store.getSnapshot()).toBe(t1);

		clock.advance(10);
		const t2 = tableWith("2");
		push(t2); // within window → schedule trailing, not published yet

		clock.advance(20);
		const t3 = tableWith("3");
		push(t3); // still within window → coalesced into the pending trailing

		// Nothing new published mid-window: consumers still see the leading table.
		expect(store.getSnapshot()).toBe(t1);

		clock.advance(50); // crosses the trailing boundary at t=75
		// The trailing publish read the freshest table: t3, not the intermediate t2.
		expect(store.getSnapshot()).toBe(t3);
		expect(published).toEqual([t1, t3]);
		expect(published).not.toContain(t2);
	});

	test("keeps the snapshot identity stable between publishes", () => {
		const { source, push } = makeSource();
		const clock = new FakeClock();
		const store = createThrottledTransformStore(source, INTERVAL, clock);
		store.subscribe(() => {});

		const t1 = tableWith("x");
		push(t1);
		const first = store.getSnapshot();
		expect(store.getSnapshot()).toBe(first); // no change → same instance

		clock.advance(INTERVAL); // reopen the window
		const t2 = tableWith("y");
		push(t2);
		expect(store.getSnapshot()).toBe(t2);
		expect(store.getSnapshot()).not.toBe(first);
	});

	test("a lone trailing change still lands (latest never dropped when the stream stops)", () => {
		const { source, push } = makeSource();
		const clock = new FakeClock();
		const store = createThrottledTransformStore(source, INTERVAL, clock);
		store.subscribe(() => {});

		push(tableWith("lead")); // leading publish opens the window
		clock.advance(5);
		const final = tableWith("final");
		push(final); // schedules a trailing publish, then the stream goes quiet

		expect(store.getSnapshot()).not.toBe(final);
		clock.advance(INTERVAL); // trailing fires
		expect(store.getSnapshot()).toBe(final);
	});

	test("detaches from the source when the last listener unsubscribes", () => {
		const { source, push } = makeSource();
		const clock = new FakeClock();
		const store = createThrottledTransformStore(source, INTERVAL, clock);

		let notifications = 0;
		const unsub = store.subscribe(() => notifications++);
		push(tableWith("a"));
		expect(notifications).toBe(1);

		unsub();
		clock.advance(INTERVAL);
		push(tableWith("b")); // no live listener → no work, no publish
		expect(notifications).toBe(1);
	});
});
