/**
 * The mission lifecycle, driven through the real ingest.
 *
 * These tests publish messages into the subscription registry exactly as a
 * datasource does, so what is exercised is the production path — discovery
 * aside — rather than a model of it. That matters most for the one claim phase 3
 * makes: *stop a mission, open it again, get identical numbers.* Anything short
 * of driving the real store would be testing a rehearsal of that claim.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	getDatasourceSubscriptionRegistry,
	publishedHook,
	type ManagerAction,
	type SubscriptionManagerLike,
} from "@workspace/utils";
import {
	__resetEmiStoreForTests,
	acquireEmiIngest,
	getEmiSnapshot,
	resetEmiRun,
	setEmiSource,
	subscribeEmiStore,
} from "../../state/emi-store";
import {
	__resetMissionStoreForTests,
	closeMission,
	deleteMission,
	discardMission,
	getMissionSnapshot,
	openMission,
	refreshMissions,
	startMission,
	stopMission,
} from "../mission-store";
import { createMemoryStorage, type MissionStorage } from "../mission-db";
import { CHUNK_SAMPLES } from "../run-codec";
import type { EmiTopicBundle } from "../../state/emi-topics";
import type { EMIGnssMessage } from "../../msgs/emi-types";
import type { SelectedTopic } from "@workspace/ormi-core/datasources";

const DS = "test-source";
const TOPIC = "/teodora/emi/gnss";
/** Longer than the store's 100 ms publish interval. */
const COMMIT_MS = 160;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for the run store's next commit.
 *
 * Not a sleep. The store publishes on a 100 ms timer, and a fixed wait is a
 * guess about how promptly a loaded machine will run it — which is how these
 * tests pass alone and fail in the suite. Waiting for the event itself is both
 * faster and never flaky.
 */
function nextCommit(timeoutMs = 5000): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			off();
			reject(new Error("the run store never committed"));
		}, timeoutMs);
		const off = subscribeEmiStore(() => {
			clearTimeout(timer);
			off();
			resolve();
		});
	});
}

/**
 * Wait until something becomes true.
 *
 * For state that lands a few awaits after a commit — a spill finishing, a
 * failure being recorded — where there is no single event to wait on.
 */
async function until(
	what: string,
	pred: () => boolean,
	timeoutMs = 5000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!pred()) {
		if (Date.now() > deadline)
			throw new Error(`timed out waiting for ${what}`);
		await sleep(10);
	}
}

/** The four methods the registry needs, and a way to publish into it. */
function fakeManager() {
	const actions = new Map<string, ManagerAction[]>();
	const manager: SubscriptionManagerLike = {
		addAction(name, action) {
			const list = actions.get(name) ?? [];
			actions.set(
				name,
				[...list.filter((a) => a.id !== action.id), action].sort(
					(a, b) => a.priority - b.priority,
				),
			);
		},
		removeAction(id) {
			for (const [name, list] of actions) {
				actions.set(
					name,
					list.filter((a) => a.id !== id),
				);
			}
		},
		doAction(name, ...args) {
			const list = actions.get(name);
			if (!list || list.length === 0) return false;
			for (const a of list) a.action(...args);
			return true;
		},
		async applyFilterAsync<T>(_name: string, value: T) {
			return value;
		},
	};
	return {
		manager,
		publish(value: unknown) {
			manager.doAction(publishedHook(DS, TOPIC), value, Date.now(), "");
		},
	};
}

/** A bundle naming one topic on one datasource. */
function bundle(): EmiTopicBundle {
	const primary = {
		source: { id: DS, title: "Test robot" },
		datasource_id: "foxglove",
		topic: TOPIC,
		type: "emi",
		rawType: "emi_msgs/msg/EMIGnss",
		property: "",
	} as unknown as SelectedTopic;
	return {
		datasourceId: DS,
		datasourceTitle: "Test robot",
		isReplay: false,
		recording: "",
		primary,
		targets: [],
	};
}

/** One EMI sample, five coils, walking east. */
function sample(i: number): EMIGnssMessage {
	const t = i / 32;
	const sec = 1_700_000_000 + Math.floor(t);
	const nanosec = Math.round((t % 1) * 1e9);
	const lat = 50.8;
	const lon = 4.39 + i * 2e-7;
	return {
		header: { stamp: { sec, nanosec }, frame_id: "emi_gnss_frame" },
		atr_threshold: 5000,
		emi_array: Array.from({ length: 5 }, (_, c) => ({
			id: c + 1,
			gnss: {
				header: {
					stamp: { sec, nanosec },
					frame_id: `coil${c + 1}_link`,
				},
				status: { status: 0, service: 0 },
				latitude: lat + c * 1e-7,
				longitude: lon,
				altitude: 100,
				position_covariance: new Float64Array([
					0.04, 0, 0, 0, 0.04, 0, 0, 0, 0.04,
				]),
				position_covariance_type: 2,
			},
			alert: false,
			raw1: i * 10 + c,
			raw2: -(i * 10 + c),
			yaw: 0,
		})),
	} as unknown as EMIGnssMessage;
}

let storage: MissionStorage;
let bus: ReturnType<typeof fakeManager>;
let release: () => void;

/** Wire the ingest up to a fake datasource and let one commit through. */
async function wire(): Promise<void> {
	__resetEmiStoreForTests();
	storage = createMemoryStorage();
	__resetMissionStoreForTests(storage);
	bus = fakeManager();
	release = acquireEmiIngest();
	setEmiSource(bus.manager, bundle());
	// Touch the registry so the published action exists before anything is sent.
	getDatasourceSubscriptionRegistry(bus.manager);
}

/** Publish `count` samples starting at `from`, and let a commit land. */
async function drive(from: number, count: number): Promise<void> {
	const landed = nextCommit();
	for (let i = from; i < from + count; i++) bus.publish(sample(i));
	await landed;
}

beforeEach(async () => {
	release?.();
	await wire();
});

describe("recording", () => {
	it("does not start without a source", async () => {
		__resetEmiStoreForTests();
		__resetMissionStoreForTests(createMemoryStorage());
		expect(startMission("nowhere")).toBeNull();
		expect(getMissionSnapshot().error).toContain("No EMI source");
	});

	it("begins at the press, not at whatever the panels had accumulated", async () => {
		await drive(0, 50);
		expect(getEmiSnapshot().n).toBe(50);

		startMission("field 3");
		expect(getMissionSnapshot().phase).toBe("recording");
		// The 50 samples the page had already collected are not part of the
		// mission — the operator drew the boundary, and it means what it says.
		expect(getEmiSnapshot().n).toBe(0);

		await drive(0, 20);
		expect(getMissionSnapshot().samples).toBe(20);
	});

	it("writes a header at the first commit, so an early crash is recoverable", async () => {
		await drive(0, 10);
		startMission("early");
		await drive(0, 5);

		const headers = await storage.listHeaders();
		expect(headers).toHaveLength(1);
		expect(headers[0]!.name).toBe("early");
		// Null is the recovery signal: this mission was never stopped.
		expect(headers[0]!.endedAt).toBeNull();
		expect(headers[0]!.ncoil).toBe(5);
	});

	it("spills whole blocks as they fill, and the remainder only at the end", async () => {
		await drive(0, 10);
		startMission("long");
		await drive(0, 1);

		await drive(1, CHUNK_SAMPLES + 99);
		// One commit past the block boundary writes exactly one block; the 100
		// samples past it stay in memory until the mission ends.
		await until(
			"the block to be spilled",
			() => getMissionSnapshot().spilled > 0,
		);
		expect(getMissionSnapshot().spilled).toBe(CHUNK_SAMPLES);
		expect(getMissionSnapshot().samples).toBe(CHUNK_SAMPLES + 100);

		await stopMission();
		expect(getMissionSnapshot().spilled).toBe(CHUNK_SAMPLES + 100);
		expect(getMissionSnapshot().phase).toBe("stopped");
		const chunks = await storage.loadChunks(getMissionSnapshot().id!);
		expect(chunks).toHaveLength(2);
		expect(chunks.map((c) => c.count).sort((a, b) => a - b)).toEqual([
			100,
			CHUNK_SAMPLES,
		]);
	});

	it("finalises the header with the samples it actually holds", async () => {
		await drive(0, 5);
		const id = startMission("short")!;
		await drive(0, 40);
		await stopMission();

		const header = await storage.getHeader(id);
		expect(header!.n).toBe(40);
		expect(header!.endedAt).not.toBeNull();
		// The tuning in force is written down, because an export or a re-read is
		// a reading of the survey and the reading is the parameters.
		expect(header!.params).not.toBeNull();
	});
});

describe("reopening", () => {
	it("gives back the very samples that were recorded", async () => {
		await drive(0, 5);
		const id = startMission("round trip")!;
		await drive(0, 700);
		const before = getEmiSnapshot().run!;
		const expectedRaw = [...before.raw1.subarray(0, before.n * 5)];
		const expectedT = [...before.t.subarray(0, before.n)];
		const n = before.n;
		await stopMission();

		// Stopping the mission is not disconnecting: the source keeps streaming
		// into the run, which is now longer than the mission it contains.
		await drive(9000, 30);
		expect(getEmiSnapshot().n).toBe(n + 30);

		expect(await openMission(id)).toBe(true);
		const after = getEmiSnapshot().run!;
		expect(after.n).toBe(n);
		expect([...after.raw1.subarray(0, n * 5)]).toEqual(expectedRaw);
		expect([...after.t.subarray(0, n)]).toEqual(expectedT);
		expect(getEmiSnapshot().adopted).toBe(true);
	});

	it("stops reading the robot while a mission is open, and resumes on close", async () => {
		await drive(0, 5);
		const id = startMission("pause")!;
		await drive(0, 40);
		await stopMission();
		await openMission(id);

		expect(getEmiSnapshot().ingesting).toBe(false);
		const held = getEmiSnapshot().n;
		expect(held).toBe(40);

		// Published directly rather than through `drive`: a commit is exactly
		// what must NOT happen here, so waiting for one would hang. Nothing is
		// subscribed, so these twenty messages reach nobody.
		for (let i = 500; i < 520; i++) bus.publish(sample(i));
		await sleep(COMMIT_MS);
		expect(getEmiSnapshot().n).toBe(held);

		closeMission();
		expect(getEmiSnapshot().adopted).toBe(false);
		expect(getEmiSnapshot().ingesting).toBe(true);
	});

	it("keeps the run it replaces, so two passes can be compared", async () => {
		await drive(0, 5);
		const id = startMission("pass one")!;
		await drive(0, 40);
		await stopMission();
		await openMission(id);
		expect(getEmiSnapshot().library.length).toBeGreaterThanOrEqual(1);

		// Re-opening the same mission must not stack two copies of it.
		closeMission();
		await openMission(id);
		const ids = getEmiSnapshot().library.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("refuses to open while a mission is recording", async () => {
		await drive(0, 5);
		const id = startMission("first")!;
		await drive(0, 30);
		await stopMission();

		startMission("second");
		expect(await openMission(id)).toBe(false);
		expect(getMissionSnapshot().error).toContain("Stop the mission");
	});

	it("keeps nothing when nothing arrived between the two presses", async () => {
		await drive(0, 5);
		const id = startMission("empty")!;
		await stopMission();

		// No survey, so no mission: offering a "stopped" recording that cannot be
		// opened would be worse than saying plainly that none was made.
		expect(getMissionSnapshot().phase).toBe("idle");
		expect(getMissionSnapshot().error).toContain("Nothing was recorded");
		expect(await storage.getHeader(id)).toBeUndefined();
		expect(getMissionSnapshot().missions).toHaveLength(0);
	});

	it("recovers a mission the browser was closed on", async () => {
		await drive(0, 5);
		const id = startMission("interrupted")!;
		await drive(0, 1);
		await drive(1, CHUNK_SAMPLES + 99);
		await until(
			"the block to be spilled",
			() => getMissionSnapshot().spilled > 0,
		);
		expect(getMissionSnapshot().spilled).toBe(CHUNK_SAMPLES);

		// The tab goes away mid-survey: the mission state is gone, the database
		// is not. This is the whole reason the samples are spilled in blocks.
		__resetMissionStoreForTests(storage);
		await refreshMissions();

		const found = getMissionSnapshot().missions.find((m) => m.id === id);
		expect(found).toBeDefined();
		// Marked as interrupted rather than quietly tidied away — most of a
		// survey is still most of a survey.
		expect(found!.endedAt).toBeNull();

		expect(await openMission(id)).toBe(true);
		expect(getEmiSnapshot().n).toBe(CHUNK_SAMPLES);
		// What was lost is stated, not rounded off.
		expect(getMissionSnapshot().error).toContain(
			`of ${CHUNK_SAMPLES + 100}`,
		);
	});

	it("says so when the mission is gone", async () => {
		expect(await openMission("mission-does-not-exist")).toBe(false);
		expect(getMissionSnapshot().error).toContain("no longer stored");
	});
});

describe("discarding and deleting", () => {
	it("removes a discarded mission from storage", async () => {
		await drive(0, 5);
		const id = startMission("regret")!;
		await drive(0, 40);
		await stopMission();
		expect(await storage.getHeader(id)).toBeDefined();

		await discardMission();
		expect(await storage.getHeader(id)).toBeUndefined();
		expect(getMissionSnapshot().phase).toBe("idle");
	});

	it("will not delete the mission that is still recording", async () => {
		await drive(0, 5);
		const id = startMission("live")!;
		await drive(0, 40);
		await deleteMission(id);
		expect(getMissionSnapshot().error).toContain("still recording");
		expect(await storage.getHeader(id)).toBeDefined();
	});

	it("closes a mission that is deleted while open", async () => {
		await drive(0, 5);
		const id = startMission("doomed")!;
		await drive(0, 40);
		await stopMission();
		await openMission(id);
		expect(getEmiSnapshot().adopted).toBe(true);

		await deleteMission(id);
		expect(getEmiSnapshot().adopted).toBe(false);
		expect(getMissionSnapshot().missions.map((m) => m.id)).not.toContain(
			id,
		);
	});
});

/** A storage whose chunk writes take `ms`, so a spill can be caught in flight. */
function slowStorage(ms: number): MissionStorage {
	const inner = createMemoryStorage();
	return {
		...inner,
		putChunk: async (c) => {
			await sleep(ms);
			return inner.putChunk(c);
		},
	};
}

/** Wire the ingest to a fresh bus against a given storage. */
async function wireWith(store: MissionStorage): Promise<void> {
	__resetEmiStoreForTests();
	__resetMissionStoreForTests(store);
	storage = store;
	bus = fakeManager();
	release = acquireEmiIngest();
	setEmiSource(bus.manager, bundle());
}

describe("when storage is slow", () => {
	it("still writes the tail when stop lands mid-write", async () => {
		const slow = slowStorage(400);
		await wireWith(slow);

		await drive(0, 5);
		const id = startMission("slow disk")!;
		await drive(0, 1);
		const landed = nextCommit();
		for (let i = 1; i <= CHUNK_SAMPLES + 99; i++) bus.publish(sample(i));
		await landed;
		// The block spill started on that commit and will run for another 400 ms.

		await stopMission();
		// Returning early because a write happened to be in flight is how a
		// survey loses its last minute at the moment stop was pressed.
		expect(getMissionSnapshot().spilled).toBe(CHUNK_SAMPLES + 100);
		const chunks = await slow.loadChunks(id);
		expect(chunks.reduce((sum, c) => sum + c.count, 0)).toBe(
			CHUNK_SAMPLES + 100,
		);
		const header = await slow.getHeader(id);
		expect(header!.n).toBe(CHUNK_SAMPLES + 100);
		expect(header!.endedAt).not.toBeNull();
	}, 15_000);

	it("does not let a spill from the last mission bleed into the next", async () => {
		const slow = slowStorage(500);
		await wireWith(slow);

		await drive(0, 5);
		const first = startMission("first")!;
		await drive(0, 1);
		const landed = nextCommit();
		for (let i = 1; i <= CHUNK_SAMPLES + 50; i++) bus.publish(sample(i));
		await landed;
		// A block write for the first mission is now in flight.

		// Discard does not wait for it — that is the point. Without a generation
		// token the loop would carry on and write its chunks under whatever
		// mission came next.
		await discardMission();
		const second = startMission("second")!;
		expect(second).not.toBe(first);
		await drive(5000, 1);
		await drive(5001, 40);
		// Long enough for the abandoned write to land, if it were going to.
		await sleep(700);
		await stopMission();

		// The in-flight loop must not have carried on under the new mission's id.
		// If it had, the second mission would hold a chunk starting at 2048 with
		// nothing at 0, and would recover as empty.
		const chunks = await slow.loadChunks(second);
		expect(chunks.every((c) => c.missionId === second)).toBe(true);
		expect(chunks[0]!.from).toBe(0);
		expect(chunks.reduce((sum, c) => sum + c.count, 0)).toBe(41);

		expect(await openMission(second)).toBe(true);
		expect(getEmiSnapshot().n).toBe(41);
	}, 20_000);
});

describe("when the source moves under a mission", () => {
	it("stops the mission rather than splicing two timebases into it", async () => {
		await drive(0, 5);
		startMission("spliced");
		await drive(0, 40);
		expect(getMissionSnapshot().phase).toBe("recording");

		// A backwards seek rebuilds the run under the *same id*, so only the
		// object identity can tell the two apart — and the check has to live at
		// the commit, not inside the spill, or by the time a whole block has
		// accumulated the evidence is gone.
		resetEmiRun();
		await drive(0, 20);

		expect(getMissionSnapshot().phase).toBe("stopped");
		expect(getMissionSnapshot().error).toContain("datasource changed");
	});
});

describe("when storage refuses", () => {
	it("keeps recording, and says the survey is not being written down", async () => {
		await wireWith({
			...createMemoryStorage(),
			putHeader: () => Promise.reject(new Error("QuotaExceededError")),
		});

		await drive(0, 5);
		startMission("no disk");
		await drive(0, 40);
		await until(
			"the failed write to be reported",
			() => getMissionSnapshot().writeFailed,
		);

		// The run in memory is complete and still worth having; what must not
		// happen is that the operator finds out at the end of the day.
		expect(getMissionSnapshot().phase).toBe("recording");
		expect(getEmiSnapshot().n).toBe(40);
		expect(getMissionSnapshot().writeFailed).toBe(true);
		expect(getMissionSnapshot().error).toContain("QuotaExceededError");
	});

	it("keeps saying so — the warning is a state, not a passing message", async () => {
		await wireWith({
			...createMemoryStorage(),
			putHeader: () => Promise.reject(new Error("QuotaExceededError")),
		});

		await drive(0, 5);
		startMission("no disk");
		await drive(0, 40);
		await until(
			"the failed write to be reported",
			() => getMissionSnapshot().writeFailed,
		);
		expect(getMissionSnapshot().writeFailed).toBe(true);

		// The mission list is re-read whenever the widget mounts or any other
		// mission is deleted. Clearing the warning there would remove it
		// permanently while no spill is even being attempted — the operator would
		// believe the survey was safe.
		await refreshMissions();
		expect(getMissionSnapshot().writeFailed).toBe(true);
		expect(getMissionSnapshot().error).toContain("QuotaExceededError");
	});
});
