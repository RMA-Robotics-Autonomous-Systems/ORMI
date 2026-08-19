/**
 * The export is the only artefact that leaves the browser, and the only one
 * nobody can check against the source once it has.
 *
 * Two failures here are silent and expensive: coordinates in the wrong order
 * (QGIS happily draws Belgium in Somalia), and the robot's targets merged with
 * the replay's into one authoritative-looking layer. Both are pinned below.
 */

import { describe, expect, it } from "bun:test";
import {
	DEFAULT_LAYERS,
	buildEmiGeoJson,
	exportKey,
	exportTargetKey,
	countLayers,
	geoJsonFilename,
	type GeoJsonLayers,
} from "../geojson";
import { createEmiRun, type EmiRun } from "../../detector/run-types";
import { toEnu } from "../../detector/georeference";
import { PROPOSED_PARAMS } from "../../detector/params";
import type { GeoDetection, Target } from "../../detector/detector-types";
import type { ReplayResult } from "../../detector/replay";

const LAT0 = 50.8;
const LON0 = 4.39;

/** A run that walks due east at ~1 m/s for `n` samples. */
function makeRun(n: number, ncoil = 2): EmiRun {
	const run = createEmiRun(
		{
			id: "run-7",
			source: "mission",
			label: "Field 3",
			coilIds: new Uint8Array(
				Array.from({ length: ncoil }, (_, c) => c + 1),
			),
			offsets: new Float32Array(ncoil * 3),
			originLat: LAT0,
			originLon: LON0,
			sampleRateHz: 32,
		},
		Math.max(1, n),
	);
	for (let i = 0; i < n; i++) {
		const x = i * (1 / 32);
		run.t[i] = i / 32;
		run.sx[i] = x;
		run.sy[i] = 0;
		const [lat, lon] = [LAT0, LON0 + x / 70_000];
		run.fixLat[i] = lat;
		run.fixLon[i] = lon;
		run.sigma[i] = 0.02;
		run.yaw[i] = 0;
		for (let c = 0; c < ncoil; c++) {
			run.coilLat[i * ncoil + c] = lat + c * 1e-6;
			run.coilLon[i * ncoil + c] = lon;
		}
	}
	run.n = n;
	return run;
}

/** A georeferenced detection at a local position. */
function det(
	x: number,
	y: number,
	over: Partial<GeoDetection> = {},
): GeoDetection {
	return {
		iPeak: 0,
		iRel: 1,
		iPub: 0,
		coil: 2,
		ci: 1,
		amp: 9000,
		thr: 5200,
		borrowed: false,
		t: 1.25,
		x,
		y,
		sigma: 0.02,
		targetId: 0,
		...over,
	};
}

/** A replay target built from one detection. */
function target(over: Partial<Target> = {}): Target {
	const member = det(10, 4);
	return {
		id: 0,
		members: [member],
		cx: 10,
		cy: 4,
		bx: 10.5,
		by: 4.5,
		bestAmp: 9000,
		bestCoil: 2,
		coils: new Set([2]),
		firstSeen: 1.2,
		lastSeen: 1.4,
		gateUsed: 0.6,
		sigma: 0.02,
		degraded: false,
		spread: 0.11,
		confirmed: false,
		nearest: NaN,
		...over,
	};
}

/** Only the fields the exporter reads. */
function result(over: Partial<ReplayResult> = {}): ReplayResult {
	return {
		value: new Int32Array(0),
		detsNew: [],
		detsOld: [],
		geoNew: [det(10, 4)],
		geoConfig: { mode: "schmitt", yawAt: "peak", frame: "xsens_link" },
		geoOld: [],
		targets: [target()],
		pairs: [],
		mad: null,
		speed: new Float32Array(0),
		turn: new Float32Array(0),
		ms: 1,
		...over,
	};
}

/** A recorded target as one of the robot's trackers publishes it. */
function recordedTarget(source: string) {
	return {
		id: 4,
		source,
		latitude: LAT0 + 1e-5,
		longitude: LON0 + 2e-5,
		centroidLatitude: LAT0 + 1e-5,
		centroidLongitude: LON0 + 2e-5,
		bestAmplitude: 12_000,
		bestCoil: 3,
		atrThreshold: 5000,
		firstSeen: 2,
		lastSeen: 2.4,
		nDetections: 5,
		coils: [3, 4],
		spread: 0.4,
		gateUsed: 0.6,
		sigmaAtCreation: 0.03,
		degradedFix: false,
	};
}

const build = (
	run: EmiRun,
	layers: Partial<GeoJsonLayers> = {},
	r = result(),
) =>
	buildEmiGeoJson({
		run,
		result: r,
		params: PROPOSED_PARAMS,
		layers: { ...DEFAULT_LAYERS, ...layers },
		startedAt: 1_700_000_000_000,
		generatedAt: 1_700_000_500_000,
	});

describe("the document", () => {
	it("is a FeatureCollection carrying the tuning it was read at", () => {
		const doc = build(makeRun(200));
		expect(doc.type).toBe("FeatureCollection");
		// The parameters are the difference between two honest, different maps of
		// the same ground. An export that cannot state which one it is cannot be
		// reproduced or defended.
		expect(doc.properties.params).toEqual({ ...PROPOSED_PARAMS });
		expect(doc.properties.run_id).toBe("run-7");
		expect(doc.properties.run_label).toBe("Field 3");
		expect(doc.properties.run_source).toBe("mission");
		expect(doc.properties.samples).toBe(200);
		expect(doc.properties.generated_at).toBe("2023-11-14T22:21:40.000Z");
		expect(doc.properties.started_at).toBe("2023-11-14T22:13:20.000Z");
	});

	it("copies the parameters rather than referencing them", () => {
		const params = { ...PROPOSED_PARAMS };
		const doc = buildEmiGeoJson({
			run: makeRun(10),
			result: result(),
			params,
			layers: DEFAULT_LAYERS,
		});
		params.threshold = 1;
		expect((doc.properties.params as typeof params).threshold).toBe(
			PROPOSED_PARAMS.threshold,
		);
	});
});

describe("targets", () => {
	it("keeps the replay's and the robot's apart by source", () => {
		const run = makeRun(100);
		run.recorded.targets = [
			recordedTarget("fixed+gate"),
			recordedTarget("fixed+chain"),
		];
		const doc = build(run);
		const targets = doc.features.filter(
			(f) => f.properties.layer === "target",
		);
		expect(targets.map((f) => f.properties.source).sort()).toEqual([
			"fixed+chain",
			"fixed+gate",
			"replay",
		]);
	});

	it("writes longitude first, and places the peak where the run says", () => {
		const doc = build(makeRun(100));
		const t = doc.features.find((f) => f.properties.source === "replay")!;
		expect(t.geometry.type).toBe("Point");
		const [lon, lat] = t.geometry.coordinates as [number, number];
		// RFC 7946 is [lon, lat]. Swapping them is the classic silent export bug:
		// the file opens, the layer draws, and the survey is somewhere else.
		// Three decimals is ~100 m — loose enough for a target ten metres from
		// the origin, and nowhere near loose enough to let 50.8 and 4.39 trade
		// places.
		expect(lat).toBeCloseTo(LAT0, 3);
		expect(lon).toBeCloseTo(LON0, 3);
		// And it is the peak, not the centroid — the strongest detection is the
		// coil that passed closest.
		const [ex, ey] = toEnu(lat, lon, LAT0, LON0);
		expect(ex).toBeCloseTo(10.5, 3);
		expect(ey).toBeCloseTo(4.5, 3);
	});

	it("carries every field the contract names", () => {
		const doc = build(makeRun(100));
		const p = doc.features.find(
			(f) => f.properties.source === "replay",
		)!.properties;
		for (const key of [
			"id",
			"source",
			"best_amplitude",
			"best_coil",
			"n_detections",
			"coils",
			"spread",
			"first_seen",
			"last_seen",
			"atr_threshold",
			"gate_used",
			"sigma_at_creation",
			"degraded_fix",
		]) {
			expect(p).toHaveProperty(key);
		}
		expect(p.n_detections).toBe(1);
		expect(p.coils).toEqual([2]);
		// The arm threshold of the strongest member — the one that actually
		// decided the target, whichever detector was running.
		expect(p.atr_threshold).toBe(5200);
		expect(p.gate_used).toBe(0.6);
	});

	it("reports a chain target's absent gate as null, not as zero", () => {
		const doc = build(
			makeRun(100),
			{},
			result({ targets: [target({ gateUsed: null })] }),
		);
		const p = doc.features.find(
			(f) => f.properties.source === "replay",
		)!.properties;
		// Chain association consults no gate at all. Zero would read as "a gate of
		// zero metres", which is a different and false statement.
		expect(p.gate_used).toBeNull();
	});

	it("turns a non-finite measure into null rather than NaN", () => {
		const doc = build(
			makeRun(100),
			{},
			result({ targets: [target({ spread: NaN, sigma: NaN })] }),
		);
		const p = doc.features.find(
			(f) => f.properties.source === "replay",
		)!.properties;
		// JSON has no NaN — `JSON.stringify` writes `null` anyway, but going
		// through it deliberately keeps the document valid before it is
		// serialised, and lets a reader tell "unknown" from "zero".
		expect(p.spread).toBeNull();
		expect(p.sigma_at_creation).toBeNull();
		expect(JSON.parse(JSON.stringify(doc))).toBeTruthy();
	});
});

describe("layers", () => {
	it("includes only what was asked for", () => {
		const run = makeRun(200);
		run.recorded.targets = [recordedTarget("fixed+gate")];
		const only = build(run, {
			targets: false,
			recordedTargets: false,
			detections: true,
			track: false,
			coilTracks: false,
		});
		expect(only.features).toHaveLength(1);
		expect(only.features[0]!.properties.layer).toBe("detection");
		expect(only.properties.layers).toEqual({
			targets: false,
			recordedTargets: false,
			detections: true,
			track: false,
			coilTracks: false,
		});
	});

	it("draws one line per coil when asked", () => {
		const doc = build(makeRun(400, 3), { coilTracks: true });
		const coilLines = doc.features.filter(
			(f) => f.properties.layer === "coil_track",
		);
		expect(coilLines).toHaveLength(3);
		expect(coilLines.map((f) => f.properties.coil)).toEqual([1, 2, 3]);
	});

	it("counts what each layer would contribute", () => {
		const run = makeRun(100, 4);
		run.recorded.targets = [recordedTarget("fixed+gate")];
		expect(countLayers(run, result())).toEqual({
			targets: 1,
			recordedTargets: 1,
			detections: 1,
			track: 1,
			coilTracks: 4,
		});
	});

	it("has nothing to compute without a replay", () => {
		const run = makeRun(100);
		const doc = buildEmiGeoJson({
			run,
			result: null,
			params: PROPOSED_PARAMS,
			layers: DEFAULT_LAYERS,
		});
		expect(
			doc.features.filter((f) => f.properties.layer === "target"),
		).toHaveLength(0);
		expect(countLayers(run, null).targets).toBe(0);
	});
});

describe("the track", () => {
	it("thins vertices that are noise rather than travel", () => {
		// 3200 samples at a metre a second is 100 m of travel. At a quarter-metre
		// floor that is about 400 vertices, not 3200 — the rest is the antenna
		// jittering while the robot walks.
		const doc = build(makeRun(3200), { track: true });
		const track = doc.features.find((f) => f.properties.layer === "track")!;
		const line = track.geometry.coordinates as [number, number][];
		expect(track.properties.samples).toBe(3200);
		expect(line.length).toBeGreaterThan(300);
		expect(line.length).toBeLessThan(450);
		expect(track.properties.vertices).toBe(line.length);
	});

	it("collapses a stationary run instead of drawing its jitter", () => {
		const run = makeRun(500);
		for (let i = 0; i < run.n; i++) {
			run.sx[i] = 0;
			run.fixLon[i] = LON0;
		}
		const doc = build(run, { track: true });
		// One vertex is not a LineString, so the layer is omitted rather than
		// emitting a degenerate geometry.
		expect(
			doc.features.filter((f) => f.properties.layer === "track"),
		).toHaveLength(0);
	});

	it("skips samples with no fix", () => {
		const run = makeRun(1000);
		for (let i = 100; i < 200; i++) run.fixLat[i] = NaN;
		const doc = build(run, { track: true });
		const line = (
			doc.features.find((f) => f.properties.layer === "track")!.geometry
				.coordinates as [number, number][]
		).flat();
		expect(line.every((v) => Number.isFinite(v))).toBe(true);
	});

	it("has no track at all for an empty run", () => {
		const doc = build(makeRun(0), { track: true });
		expect(
			doc.features.filter((f) => f.properties.layer === "track"),
		).toHaveLength(0);
		// Null, not zero: a reader must be able to tell a run that lasted no time
		// from one that has no samples at all.
		expect(doc.properties.duration_s).toBeNull();
		expect(doc.properties.t_start).toBeNull();
		expect(doc.properties.t_end).toBeNull();
	});

	it("cuts the line where the fix went away", () => {
		const run = makeRun(3200);
		// Four seconds with no fix, a third of the way through.
		for (let i = 1000; i < 1128; i++) {
			run.fixLat[i] = NaN;
			run.fixLon[i] = NaN;
		}
		const doc = build(run, { track: true });
		const tracks = doc.features.filter(
			(f) => f.properties.layer === "track",
		);
		// Two features, not one line bridging the gap. A single line would draw
		// the robot straight across ground it never swept — the same lie the
		// mission state machine refuses to tell by having no `paused` state.
		expect(tracks).toHaveLength(2);
		expect(tracks[0]!.properties.segments).toBe(2);
		expect(tracks.map((f) => f.properties.segment)).toEqual([0, 1]);
	});

	it("does not cut the line merely because the robot stopped", () => {
		const run = makeRun(3200);
		// Ten seconds parked in the middle: valid fixes throughout, no travel.
		for (let i = 1000; i < 1320; i++) {
			run.sx[i] = run.sx[999]!;
			run.fixLon[i] = run.fixLon[999]!;
		}
		for (let i = 1320; i < run.n; i++) {
			run.sx[i] = run.sx[999]! + (i - 1320) / 32;
			run.fixLon[i] = LON0 + run.sx[i]! / 70_000;
		}
		const doc = build(run, { track: true });
		// A pause is not a dropout. The ground under it was covered — the robot
		// was standing on it.
		expect(
			doc.features.filter((f) => f.properties.layer === "track"),
		).toHaveLength(1);
	});

	it("thins a coil track against the coil's own travel, not the body's", () => {
		// A pivot: the body barely moves while a coil a metre out sweeps an arc.
		const n = 640;
		const run = makeRun(n, 2);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI;
			run.sx[i] = 0;
			run.sy[i] = 0;
			run.fixLat[i] = LAT0;
			run.fixLon[i] = LON0;
			// Coil 2 rides 1 m from the centre and traverses a half-circle.
			run.coilLat[i * 2] = LAT0;
			run.coilLon[i * 2] = LON0;
			run.coilLat[i * 2 + 1] = LAT0 + Math.sin(a) / 111_320;
			run.coilLon[i * 2 + 1] = LON0 + Math.cos(a) / 70_000;
		}
		const doc = build(run, { coilTracks: true, track: false });
		const arc = doc.features.find(
			(f) =>
				f.properties.layer === "coil_track" && f.properties.coil === 2,
		)!;
		// Decimating on the body would have kept two vertices and chorded across
		// a metre of swept ground, in the one layer whose purpose is what was
		// actually swept. A π-metre arc at a 0.25 m floor is about a dozen.
		expect(arc.properties.vertices as number).toBeGreaterThan(8);
	});
});

describe("what cannot be placed", () => {
	it("drops a robot target with no position rather than writing null coordinates", () => {
		const run = makeRun(100);
		run.recorded.targets = [
			recordedTarget("fixed+gate"),
			{
				...recordedTarget("fixed+gate"),
				id: 9,
				latitude: NaN,
				longitude: NaN,
			},
		];
		const doc = build(run, { targets: false });
		const targets = doc.features.filter(
			(f) => f.properties.layer === "target",
		);
		expect(targets).toHaveLength(1);
		expect(doc.properties.unplaceable).toBe(1);
		// `JSON.stringify` turns NaN into null, and `[null, null]` is not a
		// position — one such feature makes the whole document fail to load.
		const text = JSON.stringify(doc);
		expect(text).not.toContain("[null,null]");
	});

	it("drops a detection georeferenced from a sample with no fix", () => {
		const doc = build(
			makeRun(100),
			{
				detections: true,
				targets: false,
				recordedTargets: false,
				track: false,
			},
			result({ geoNew: [det(10, 4), det(NaN, NaN)] }),
		);
		expect(
			doc.features.filter((f) => f.properties.layer === "detection"),
		).toHaveLength(1);
		expect(doc.properties.unplaceable).toBe(1);
	});

	it("marks detections as the replay's, so they cannot read as the robot's", () => {
		const doc = build(makeRun(100), { detections: true });
		const d = doc.features.find((f) => f.properties.layer === "detection")!;
		expect(d.properties.source).toBe("replay");
	});
});

describe("provenance", () => {
	it("names the stored mission an export came from", () => {
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: result(),
			params: PROPOSED_PARAMS,
			layers: DEFAULT_LAYERS,
			missionId: "mission-123-1",
			missionName: "Field 3, pass 2",
			startedAt: 1_700_000_000_000,
		});
		// A live run's id is the datasource instance and its label the datasource
		// title; neither ties the file back to the survey it came from.
		expect(doc.properties.mission_id).toBe("mission-123-1");
		expect(doc.properties.mission_name).toBe("Field 3, pass 2");
		expect(doc.properties.started_at).toBe("2023-11-14T22:13:20.000Z");
	});

	it("says so plainly when there is no mission behind the run", () => {
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: result(),
			params: PROPOSED_PARAMS,
			layers: DEFAULT_LAYERS,
		});
		expect(doc.properties.mission_id).toBeNull();
		expect(doc.properties.started_at).toBeNull();
	});
});

describe("geoJsonFilename", () => {
	it("names the file after the run and when it left", () => {
		const name = geoJsonFilename(makeRun(10), 1_700_000_500_000);
		expect(name).toBe("emi-field-3-2023-11-14T22-21-40.geojson");
	});

	it("survives a label with nothing usable in it", () => {
		const run = makeRun(10);
		const named = { ...run, label: "///" } as EmiRun;
		expect(geoJsonFilename(named, 0)).toMatch(/^emi-run-.*\.geojson$/);
	});
});

describe("a hand-picked selection", () => {
	/** Two detections on two coils, folded into two different targets. */
	const twoTargets = () =>
		result({
			geoNew: [
				det(10, 4, { coil: 2, iPeak: 100, targetId: 0 }),
				det(30, 8, { coil: 4, iPeak: 300, targetId: 1 }),
			],
			targets: [
				target({ id: 0, cx: 10, cy: 4 }),
				target({ id: 1, cx: 30, cy: 8 }),
			],
		});

	const allLayers = {
		detections: true,
		targets: true,
		recordedTargets: false,
		track: false,
		coilTracks: false,
	};

	it("keys on the coil and its peak sample, not on a list index", () => {
		// The key must survive a parameter change. An index into `geoNew` does
		// not: move the threshold, the list is rebuilt, and index 3 is now a
		// different detection — which would export marks nobody picked.
		expect(exportKey({ coil: 4, iPeak: 300 })).toBe("4:300");
		expect(exportKey({ coil: 2, iPeak: 100 })).not.toBe(
			exportKey({ coil: 2, iPeak: 101 }),
		);
	});

	it("exports only the picked detection", () => {
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: twoTargets(),
			params: PROPOSED_PARAMS,
			layers: allLayers,
			selection: new Set(["4:300"]),
		});
		const dets = doc.features.filter(
			(f) => f.properties.layer === "detection",
		);
		expect(dets).toHaveLength(1);
		expect(dets[0]!.properties.coil).toBe(4);
	});

	it("picking a detection does not drag in its target", () => {
		// Picking is manual. A click that quietly adds the barycentre as well is
		// the tool deciding what goes in the file, and the operator asked for
		// one detection.
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: twoTargets(),
			params: PROPOSED_PARAMS,
			layers: allLayers,
			selection: new Set(["4:300"]),
		});
		expect(
			doc.features.filter((f) => f.properties.layer === "target"),
		).toHaveLength(0);
	});

	it("picking a barycentre exports the barycentre, not its members", () => {
		// The whole point of picking one: it is the averaged position of several
		// passes, and an operator who wants that wants that. The members are one
		// click each when they are what is wanted.
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: twoTargets(),
			params: PROPOSED_PARAMS,
			layers: allLayers,
			selection: new Set([exportTargetKey(1)]),
		});
		const targets = doc.features.filter(
			(f) => f.properties.layer === "target",
		);
		expect(targets).toHaveLength(1);
		expect(targets[0]!.properties.id).toBe(1);
		expect(
			doc.features.filter((f) => f.properties.layer === "detection"),
		).toHaveLength(0);
		// And it counts as one picked thing, not zero.
		expect(doc.properties.selected).toBe(1);
	});

	it("a target key cannot collide with a detection key", () => {
		// One set holds both kinds. A detection key is always `<digits>:<digits>`
		// and a target key is always `t:<digits>`, so the two spaces are
		// disjoint by construction rather than by convention.
		expect(exportTargetKey(300)).not.toBe(
			exportKey({ coil: 4, iPeak: 300 }),
		);
		expect(exportTargetKey(4)).toBe("t:4");
	});

	it("mixes both kinds of pick in one export", () => {
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: twoTargets(),
			params: PROPOSED_PARAMS,
			layers: allLayers,
			selection: new Set(["2:100", exportTargetKey(1)]),
		});
		expect(
			doc.features.filter((f) => f.properties.layer === "detection"),
		).toHaveLength(1);
		expect(
			doc.features.filter((f) => f.properties.layer === "target"),
		).toHaveLength(1);
		expect(doc.properties.selected).toBe(2);
		expect(doc.properties.selection_unmatched).toBe(0);
	});

	it("counts a barycentre the current association no longer produces", () => {
		// A target id is a position in the associator's output, so it survives a
		// parameter change less often than a detection key does. The file says
		// so rather than coming back short with no explanation.
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: twoTargets(),
			params: PROPOSED_PARAMS,
			layers: allLayers,
			selection: new Set([exportTargetKey(7)]),
		});
		expect(doc.properties.selected).toBe(0);
		expect(doc.properties.selection_unmatched).toBe(1);
	});

	it("exports everything when nothing is picked", () => {
		// The empty state must not mean "an empty file". Someone who never
		// clicked a mark wants the survey.
		for (const sel of [null, undefined, new Set<string>()]) {
			const doc = buildEmiGeoJson({
				run: makeRun(100),
				result: twoTargets(),
				params: PROPOSED_PARAMS,
				layers: allLayers,
				selection: sel,
			});
			expect(
				doc.features.filter((f) => f.properties.layer === "detection"),
			).toHaveLength(2);
			expect(doc.properties.selected).toBeNull();
		}
	});

	it("counts picks the current tuning no longer produces", () => {
		// Selected forty, exported thirty-one: the file says which number it is
		// rather than leaving a short export looking like a short day.
		const doc = buildEmiGeoJson({
			run: makeRun(100),
			result: twoTargets(),
			params: PROPOSED_PARAMS,
			layers: allLayers,
			selection: new Set(["4:300", "1:999", "5:12"]),
		});
		expect(doc.properties.selected).toBe(1);
		expect(doc.properties.selection_unmatched).toBe(2);
	});
});
