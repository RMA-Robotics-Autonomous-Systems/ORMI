/**
 * The claim the whole mission format rests on: a survey written down and read
 * back is the *same survey*.
 *
 * "Reopen the recorded mission and get identical numbers" is the acceptance
 * test for phase 3, and it is a property of this file. If a column comes back
 * shifted by one, or a chunk boundary loses a sample, nothing downstream fails —
 * every panel draws a slightly different survey, confidently.
 */

import { describe, expect, it } from "bun:test";
import {
	CHUNK_SAMPLES,
	MISSION_FORMAT,
	chunkFromRun,
	headerFromRun,
	missionBytes,
	runFromMission,
	type MissionChunk,
} from "../run-codec";
import { createEmiRun, type EmiRun } from "../../detector/run-types";

/** A run whose every cell is distinguishable from every other. */
function makeRun(n: number, ncoil = 5, hasPre = true): EmiRun {
	const run = createEmiRun(
		{
			id: "run-under-test",
			source: "mission",
			label: "live robot",
			coilIds: new Uint8Array(
				Array.from({ length: ncoil }, (_, c) => c + 1),
			),
			offsets: new Float32Array(
				Array.from({ length: ncoil * 3 }, (_, i) => i * 0.1),
			),
			originLat: 50.8,
			originLon: 4.39,
			sampleRateHz: 32,
		},
		n,
	);
	run.hasPre = hasPre;
	for (let i = 0; i < n; i++) {
		run.t[i] = i / 32;
		run.fixLat[i] = 50.8 + i * 1e-7;
		run.fixLon[i] = 4.39 + i * 2e-7;
		run.sx[i] = i * 0.03;
		run.sy[i] = i * 0.01;
		run.sigma[i] = 0.02 + (i % 7) * 0.001;
		run.yaw[i] = (i % 360) * 0.01;
		run.recorded.atrThreshold[i] = 5000 + (i % 3);
		for (let c = 0; c < ncoil; c++) {
			const k = i * ncoil + c;
			run.coilLat[k] = 50.8 + i * 1e-7 + c * 1e-8;
			run.coilLon[k] = 4.39 + i * 2e-7 + c * 1e-8;
			run.raw1[k] = i * 100 + c;
			run.raw2[k] = -(i * 100 + c);
			if (hasPre) {
				run.pre1[k] = i * 100 + c + 50_000;
				run.pre2[k] = i * 100 + c + 60_000;
			}
		}
	}
	run.n = n;
	run.recorded.alerts = [
		{
			coil: 2,
			t: 1.5,
			latitude: 50.8,
			longitude: 4.39,
			amp: 9000,
			thr: 5000,
		},
		{
			coil: 3,
			t: 9e9,
			latitude: 50.8,
			longitude: 4.39,
			amp: 8000,
			thr: 5000,
		},
	];
	run.recorded.targets = [
		{
			id: 1,
			source: "fixed+gate",
			latitude: 50.8,
			longitude: 4.39,
			centroidLatitude: 50.8,
			centroidLongitude: 4.39,
			bestAmplitude: 9000,
			bestCoil: 2,
			atrThreshold: 5000,
			firstSeen: 1.4,
			lastSeen: 1.9,
			nDetections: 3,
			coils: [2, 3],
			spread: 0.3,
			gateUsed: 0.6,
			sigmaAtCreation: 0.02,
			degradedFix: false,
		},
	];
	return run;
}

/** Chunk a whole run the way the mission store does. */
function cut(run: EmiRun, id = "m1"): MissionChunk[] {
	const chunks: MissionChunk[] = [];
	let from = 0;
	let seq = 0;
	while (from < run.n) {
		const count = Math.min(CHUNK_SAMPLES, run.n - from);
		const chunk = chunkFromRun(run, id, seq, from, count);
		if (!chunk) break;
		chunks.push(chunk);
		from += count;
		seq += 1;
	}
	return chunks;
}

describe("round trip", () => {
	it("returns every column bit for bit, across several chunks", () => {
		const n = CHUNK_SAMPLES * 2 + 137;
		const run = makeRun(n);
		const header = headerFromRun(run, {
			id: "m1",
			name: "field 3",
			startedAt: 1_700_000_000_000,
			endedAt: 1_700_000_100_000,
		});
		const back = runFromMission(header, cut(run))!;

		expect(back.missing).toBe(0);
		expect(back.truncated).toBe(false);
		expect(back.n).toBe(n);

		const r = back.run;
		expect(r.n).toBe(n);
		expect(r.ncoil).toBe(run.ncoil);
		expect([...r.coilIds]).toEqual([...run.coilIds]);
		expect(r.originLat).toBe(run.originLat);
		expect(r.originLon).toBe(run.originLon);
		expect(r.sampleRateHz).toBe(run.sampleRateHz);
		expect(r.hasPre).toBe(true);

		// The columns, not a sample of them: a boundary bug shows at exactly one
		// index and a spot check is precisely what misses it.
		for (const key of [
			"t",
			"fixLat",
			"fixLon",
			"sx",
			"sy",
			"sigma",
			"yaw",
		] as const) {
			expect([...r[key].subarray(0, n)]).toEqual([
				...run[key].subarray(0, n),
			]);
		}
		for (const key of [
			"coilLat",
			"coilLon",
			"raw1",
			"raw2",
			"pre1",
			"pre2",
		] as const) {
			expect([...r[key].subarray(0, n * run.ncoil)]).toEqual([
				...run[key].subarray(0, n * run.ncoil),
			]);
		}
		expect([...r.recorded.atrThreshold.subarray(0, n)]).toEqual([
			...run.recorded.atrThreshold.subarray(0, n),
		]);
	});

	it("carries the targets and drops alerts that fall past the samples", () => {
		const run = makeRun(64);
		const header = headerFromRun(run, {
			id: "m1",
			name: "",
			startedAt: 0,
		});
		const back = runFromMission(header, cut(run))!;

		expect(back.run.recorded.targets).toHaveLength(1);
		expect(back.run.recorded.targets[0]!.source).toBe("fixed+gate");
		// The second alert is stamped past the end of the run: an alert pointing
		// beyond the last sample cannot be drawn and is not a detection anyone
		// made, so it does not come back.
		expect(back.run.recorded.alerts).toHaveLength(1);
		expect(back.run.recorded.alerts[0]!.coil).toBe(2);
	});

	it("does not alias the run's buffers into the header", () => {
		const run = makeRun(8);
		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 0 });
		run.coilIds[0] = 99;
		run.offsets[0] = -1;
		run.recorded.targets[0]!.bestAmplitude = 1;
		expect(header.coilIds[0]).toBe(1);
		expect(header.offsets[0]).toBe(0);
		expect(header.targets[0]!.bestAmplitude).toBe(9000);
	});

	it("does not alias the run's columns into a chunk", () => {
		const run = makeRun(16);
		const chunk = chunkFromRun(run, "m1", 0, 0, 16)!;
		run.raw1[0] = -12345;
		expect(chunk.raw1[0]).toBe(0);
	});
});

describe("a mission that was interrupted", () => {
	it("stops at the hole rather than filling it with zeros", () => {
		const n = CHUNK_SAMPLES * 3;
		const run = makeRun(n);
		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 0 });
		const chunks = cut(run);
		// The middle write never landed. Copying the third chunk in at its own
		// offset would leave a chunk-wide band of zeros — flat signal at latitude
		// zero — in the middle of the survey, which reads as data.
		const holed = [chunks[0]!, chunks[2]!];
		const back = runFromMission(header, holed)!;

		expect(back.truncated).toBe(true);
		expect(back.n).toBe(CHUNK_SAMPLES);
		expect(back.missing).toBe(CHUNK_SAMPLES * 2);
		expect(back.run.n).toBe(CHUNK_SAMPLES);
		expect(back.run.raw1[(CHUNK_SAMPLES - 1) * 5]).toBe(
			run.raw1[(CHUNK_SAMPLES - 1) * 5],
		);
	});

	it("reassembles chunks that come back out of order", () => {
		const run = makeRun(CHUNK_SAMPLES + 10);
		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 0 });
		const chunks = cut(run).reverse();
		const back = runFromMission(header, chunks)!;
		expect(back.n).toBe(CHUNK_SAMPLES + 10);
		expect(back.truncated).toBe(false);
		expect([...back.run.t.subarray(0, back.n)]).toEqual([
			...run.t.subarray(0, back.n),
		]);
	});

	it("ignores a chunk that was written twice", () => {
		const run = makeRun(300);
		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 0 });
		const chunks = cut(run);
		const back = runFromMission(header, [...chunks, chunks[0]!])!;
		expect(back.n).toBe(300);
	});

	it("restores nothing, and says so, when no chunk landed at all", () => {
		const run = makeRun(500);
		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 0 });
		const back = runFromMission(header, [])!;
		expect(back.n).toBe(0);
		expect(back.missing).toBe(500);
		expect(back.run.recorded.alerts).toHaveLength(0);
	});

	it("marks a header that was never stopped", () => {
		const run = makeRun(8);
		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 1 });
		// The one signal that separates "the operator finished" from "the browser
		// went away", and the reason the list can offer recovery at all.
		expect(header.endedAt).toBeNull();
		expect(
			headerFromRun(run, { id: "m1", name: "", startedAt: 1, endedAt: 2 })
				.endedAt,
		).toBe(2);
	});
});

describe("bounds and formats", () => {
	it("refuses a range that runs past the samples", () => {
		const run = makeRun(100);
		expect(chunkFromRun(run, "m1", 0, 90, 20)).toBeNull();
		expect(chunkFromRun(run, "m1", 0, 0, 0)).toBeNull();
		expect(chunkFromRun(run, "m1", 0, -1, 5)).toBeNull();
	});

	it("refuses a mission written by a newer plugin", () => {
		const run = makeRun(8);
		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 0 });
		header.version = MISSION_FORMAT + 1;
		expect(runFromMission(header, cut(run))).toBeNull();
	});

	it("omits the pre-removal columns when the source never carried them", () => {
		const run = makeRun(64, 5, false);
		const chunk = chunkFromRun(run, "m1", 0, 0, 64)!;
		expect(chunk.pre1).toHaveLength(0);
		expect(chunk.pre2).toHaveLength(0);

		const header = headerFromRun(run, { id: "m1", name: "", startedAt: 0 });
		expect(header.hasPre).toBe(false);
		const back = runFromMission(header, [chunk])!;
		expect(back.run.hasPre).toBe(false);
		expect(back.n).toBe(64);
	});

	it("prefers the operator's name over the datasource title", () => {
		const run = makeRun(8);
		const named = runFromMission(
			headerFromRun(run, { id: "m1", name: "field 3", startedAt: 0 }),
			cut(run),
		)!;
		expect(named.run.label).toBe("field 3");
		const unnamed = runFromMission(
			headerFromRun(run, { id: "m1", name: "", startedAt: 0 }),
			cut(run),
		)!;
		expect(unnamed.run.label).toBe("live robot");
	});

	it("sizes a mission by its columns", () => {
		const run = makeRun(1000);
		const withPre = headerFromRun(run, {
			id: "m1",
			name: "",
			startedAt: 0,
		});
		const withoutPre = headerFromRun(makeRun(1000, 5, false), {
			id: "m2",
			name: "",
			startedAt: 0,
		});
		expect(missionBytes(withPre)).toBeGreaterThan(missionBytes(withoutPre));
		// Roughly a megabyte per thousand samples on a five-coil rake; the point
		// is the order of magnitude the widget reports, not the byte.
		expect(missionBytes(withPre)).toBeGreaterThan(100_000);
		expect(missionBytes(withPre)).toBeLessThan(1_000_000);
	});
});
