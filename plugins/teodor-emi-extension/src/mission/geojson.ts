/**
 * The survey, in a format something else can read.
 *
 * GeoJSON because the destination is QGIS: an operator finishes a sweep, opens
 * the export beside an ortho or a cadastral layer, and decides where to dig.
 * Nothing in this file is ORMI-specific — that is the point of exporting.
 *
 * ## Everything an export claims, it can support
 *
 * The parameters ride in the collection's foreign `properties`. A detection
 * list is a *function of its tuning*: the same recording under a MAD factor of
 * 8 and of 20 is two different maps, both honest. An export that does not state
 * which one it is cannot be checked, cannot be reproduced, and — six months
 * later, in a report — cannot be defended. So the whole {@link EmiParams} goes
 * in, along with the run's identity and span.
 *
 * ## Three kinds of target, kept apart
 *
 * The robot's two trackers each publish targets, and the replay computes its
 * own. They routinely disagree, and that disagreement is often the finding.
 * `source` distinguishes them (`fixed+gate`, `fixed+chain`, `replay`) so they
 * can be styled apart rather than merged into one authoritative-looking layer.
 */

import { fromEnu, toEnu } from "../detector/georeference";
import type { ReplayResult } from "../detector/replay";
import type { EmiParams } from "../detector/params";
import type { EmiRun } from "../detector/run-types";

/** A GeoJSON position, `[longitude, latitude]` — RFC 7946 order. */
export type Position = [number, number];

/** A feature carrying a point or a line. */
export interface EmiFeature {
	type: "Feature";
	geometry:
		| { type: "Point"; coordinates: Position }
		| { type: "LineString"; coordinates: Position[] };
	properties: Record<string, unknown>;
}

/** The exported document. */
export interface EmiFeatureCollection {
	type: "FeatureCollection";
	/**
	 * Foreign member. RFC 7946 §6 permits it and QGIS ignores it, which is the
	 * right trade: a reader that cares can recover the tuning, and one that does
	 * not still opens the file.
	 */
	properties: Record<string, unknown>;
	features: EmiFeature[];
}

/** Which layers an export carries. */
export interface GeoJsonLayers {
	/** Targets the current parameters produce. */
	targets: boolean;
	/** Targets the robot's trackers published on the day. */
	recordedTargets: boolean;
	/** One point per detection, before association. */
	detections: boolean;
	/** The robot's track. */
	track: boolean;
	/** One track per coil — five lines 0.4 m apart. */
	coilTracks: boolean;
}

/**
 * What the dialog opens with.
 *
 * Not everything: the two per-crossing layers are off. A survey's detections and
 * its five coil tracks are each an order of magnitude more geometry than the
 * targets, and the common export is "here is what we found", not "here is every
 * sample". Both are one click away.
 */
export const DEFAULT_LAYERS: GeoJsonLayers = {
	targets: true,
	recordedTargets: true,
	detections: false,
	track: true,
	coilTracks: false,
};

/**
 * Minimum movement between kept track vertices, metres.
 *
 * A survey samples at ~32 Hz while the robot walks; consecutive fixes are
 * centimetres apart and most of that is GNSS noise, not travel. Writing every
 * one of them makes a file that is mostly a jitter trace of a stationary
 * antenna. A quarter of a metre is well below the rake's own 0.4 m row spacing,
 * so no manoeuvre the geometry can resolve is lost.
 */
const TRACK_MIN_M = 0.25;

/**
 * Gap in the fix, in seconds, that ends a track segment.
 *
 * A dropout skipped silently is bridged by a straight segment between the fixes
 * either side of it — which is the same lie the mission state machine refuses to
 * tell by having no `paused` state: unswept ground drawn as swept. Half a second
 * is sixteen samples, well past ordinary jitter and well short of a manoeuvre.
 */
const GAP_S = 0.5;

/** Squared metric distance, in the run's local frame. */
const dist2 = (ax: number, ay: number, bx: number, by: number): number =>
	(ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/** Round a coordinate to ~1 mm — beyond that the digits are noise, and bytes. */
const coord = (v: number): number => Math.round(v * 1e8) / 1e8;

/** A finite number, or null. JSON has no NaN, and `0` would be a lie. */
const orNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

/** One sample of a path: where it is on the ground, and where in local metres. */
interface PathSample {
	lat: number;
	lon: number;
	x: number;
	y: number;
	t: number;
}

/**
 * Thin a path, and cut it wherever the fix went away.
 *
 * Decimation and gap-splitting belong together because both decide *which
 * vertices exist*, and separating them is how a dropout ends up bridged: the
 * decimator sees the sample after the gap as simply "far enough to keep".
 *
 * @param n - Samples to walk.
 * @param at - Reads one sample, or returns null when it has no usable fix.
 * @returns One vertex list per continuous segment; segments of one vertex are
 * dropped, since a `LineString` needs two.
 */
function segments(
	n: number,
	at: (i: number) => PathSample | null,
): Position[][] {
	const out: Position[][] = [];
	let line: Position[] = [];
	let lx = NaN;
	let ly = NaN;
	// The last sample that had a fix — not the last vertex kept. Keying the gap
	// test on the vertex would cut the line every time the robot stood still
	// longer than the gap, which is a pause, not a dropout.
	let lastSeen = NaN;

	const close = () => {
		if (line.length >= 2) out.push(line);
		line = [];
		lx = NaN;
		ly = NaN;
	};

	for (let i = 0; i < n; i++) {
		const s = at(i);
		if (!s) continue;
		if (line.length > 0 && s.t - lastSeen > GAP_S) close();
		lastSeen = s.t;
		if (
			line.length > 0 &&
			dist2(s.x, s.y, lx, ly) < TRACK_MIN_M * TRACK_MIN_M
		) {
			continue;
		}
		line.push([coord(s.lon), coord(s.lat)]);
		lx = s.x;
		ly = s.y;
	}
	close();
	return out;
}

/** Absolute time of a run-relative second, when the wall clock is known. */
function utc(startedAt: number | undefined, t: number): string | null {
	if (!startedAt || !Number.isFinite(t)) return null;
	return new Date(startedAt + t * 1000).toISOString();
}

/** Inputs to an export. */
export interface GeoJsonOptions {
	run: EmiRun;
	/** The replay at the exported parameters; null exports no computed layers. */
	result: ReplayResult | null;
	params: EmiParams;
	layers: GeoJsonLayers;
	/** Wall clock of the run's `t = 0`, epoch milliseconds, when known. */
	startedAt?: number;
	/** Wall clock of the export itself; defaults to now. */
	generatedAt?: number;
	/** Stored mission this run came from, when it came from one. */
	missionId?: string | null;
	/** That mission's operator-given name. */
	missionName?: string | null;
	/**
	 * Export exactly these marks — nothing implied, in either direction.
	 *
	 * Two kinds of key, both from `state/atoms.ts`: `coil:iPeak` for a detection
	 * and `t:<id>` for a target. A selected target does **not** drag in the
	 * detections it averages, and a selected detection does not drag in its
	 * target. A barycentre is its own exportable object — an operator who picks
	 * the averaged position wants that position, and the members are one click
	 * each when they are what is wanted.
	 *
	 * Undefined or empty means everything, because a selection tool whose empty
	 * state exports an empty file is a foot-gun: the operator who has not picked
	 * anything wants the survey, not a document with no features in it.
	 *
	 * Keys that match nothing in the current replay are **counted and reported**
	 * in the collection's properties rather than dropped quietly. A detection key
	 * stops matching when a parameter change means that peak is no longer a
	 * detection; a target key stops matching sooner, because a target id is a
	 * position in the associator's output and the next parameter change
	 * renumbers it. An operator who selected forty marks and exported thirty-one
	 * should be told which of those two numbers the file holds.
	 */
	selection?: ReadonlySet<string> | null;
}

/**
 * The key a detection is remembered by, duplicated from `state/atoms.ts`.
 *
 * Duplicated on purpose: this module is pure and has no React, no Jotai and no
 * store, which is what lets the export be tested over a fixture instead of a
 * rendered page. `geojson.test.ts` asserts the two agree.
 *
 * @param d - Anything carrying a coil id and a peak sample index.
 * @returns The stable key.
 */
export const exportKey = (d: { coil: number; iPeak: number }): string =>
	`${d.coil}:${d.iPeak}`;

/**
 * The key a target is remembered by, duplicated from `state/atoms.ts` for the
 * same reason as {@link exportKey}.
 *
 * @param id - The target's id within the current replay.
 * @returns The stable-for-this-association key.
 */
export const exportTargetKey = (id: number): string => `t:${id}`;

/**
 * Build the export.
 *
 * @param o - The run, the replay, the tuning and the layer choices.
 * @returns A `FeatureCollection` ready to be stringified.
 */
export function buildEmiGeoJson(o: GeoJsonOptions): EmiFeatureCollection {
	const { run, result, params, layers } = o;
	const features: EmiFeature[] = [];
	const n = run.n;

	// ── The hand-picked subset ────────────────────────────────────────────
	// Resolved once, up front, because two layers consult it and they must
	// agree about which keys matched.
	//
	// A centroid kept with no detections under it is not a defect here: it is a
	// barycentre exported as the averaged position it is, which is what picking
	// one means. What the file must never do is *invent* the relationship — so
	// nothing selects anything on another feature's behalf.
	const picked = o.selection && o.selection.size > 0 ? o.selection : null;
	const kept = picked
		? (result?.geoNew ?? []).filter((d) => picked.has(exportKey(d)))
		: (result?.geoNew ?? []);
	/** Targets picked in their own right, or null when nothing is picked. */
	const keptTargets = picked
		? new Set(
				(result?.targets ?? [])
					.filter((t) => picked.has(exportTargetKey(t.id)))
					.map((t) => t.id),
			)
		: null;
	/** Selected keys the current parameters no longer produce. */
	const missing = picked
		? picked.size -
			new Set(kept.map(exportKey)).size -
			(keptTargets?.size ?? 0)
		: 0;
	/**
	 * A local-metre position on the ground, or null when it is not a position.
	 *
	 * `NaN` reaches here by two ordinary routes — a robot target published with
	 * no fix sub-message, and a detection georeferenced from a sample whose fix
	 * was missing — and `JSON.stringify` writes it as `[null, null]`, which is
	 * not valid GeoJSON. One such feature makes the *whole document* fail to
	 * load. A feature that cannot be placed is dropped instead.
	 */
	const place = (x: number, y: number): Position | null => {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
		const [lat, lon] = fromEnu(x, y, run.originLat, run.originLon);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
		return [coord(lon), coord(lat)];
	};
	/** Samples dropped for want of a position, reported rather than hidden. */
	let unplaceable = 0;

	// ── Targets the current parameters produce ────────────────────────────
	if (layers.targets && result) {
		for (const t of result.targets) {
			// Under a selection, only targets picked in their own right.
			if (keptTargets && !keptTargets.has(t.id)) continue;
			// The strongest member is the one whose coil passed closest — EMI falls
			// off as roughly 1/r⁶ — so its arm threshold is the one that actually
			// decided this target, whichever detector was running.
			const best = t.members.reduce(
				(a, b) => (b.amp > a.amp ? b : a),
				t.members[0]!,
			);
			const at = place(t.bx, t.by);
			if (!at) {
				unplaceable++;
				continue;
			}
			features.push({
				type: "Feature",
				geometry: { type: "Point", coordinates: at },
				properties: {
					layer: "target",
					id: t.id,
					source: "replay",
					best_amplitude: t.bestAmp,
					best_coil: t.bestCoil,
					n_detections: t.members.length,
					coils: [...t.coils].sort((a, b) => a - b),
					confirmed: t.confirmed,
					spread: orNull(t.spread),
					first_seen: orNull(t.firstSeen),
					last_seen: orNull(t.lastSeen),
					first_seen_utc: utc(o.startedAt, t.firstSeen),
					last_seen_utc: utc(o.startedAt, t.lastSeen),
					atr_threshold: orNull(best?.thr ?? NaN),
					gate_used: t.gateUsed,
					sigma_at_creation: orNull(t.sigma),
					degraded_fix: t.degraded,
					// The centroid as well as the peak: they separate when a target
					// was built from coils that passed at different distances, and
					// that separation is a quality signal worth carrying.
					centroid: place(t.cx, t.cy) ?? null,
				},
			});
		}
	}

	// ── Targets the robot published ───────────────────────────────────────
	if (layers.recordedTargets) {
		for (const t of run.recorded.targets) {
			// A tracker can publish a target whose fix sub-message was absent; the
			// run builder records that as NaN rather than inventing a position.
			if (!Number.isFinite(t.latitude) || !Number.isFinite(t.longitude)) {
				unplaceable++;
				continue;
			}
			features.push({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [coord(t.longitude), coord(t.latitude)],
				},
				properties: {
					layer: "target",
					id: t.id,
					source: t.source,
					best_amplitude: t.bestAmplitude,
					best_coil: t.bestCoil,
					n_detections: t.nDetections,
					coils: [...t.coils].sort((a, b) => a - b),
					confirmed: t.coils.length > 1,
					spread: orNull(t.spread),
					first_seen: orNull(t.firstSeen),
					last_seen: orNull(t.lastSeen),
					first_seen_utc: utc(o.startedAt, t.firstSeen),
					last_seen_utc: utc(o.startedAt, t.lastSeen),
					atr_threshold: orNull(t.atrThreshold),
					gate_used: orNull(t.gateUsed),
					sigma_at_creation: orNull(t.sigmaAtCreation),
					degraded_fix: t.degradedFix,
					centroid: [
						coord(t.centroidLongitude),
						coord(t.centroidLatitude),
					],
				},
			});
		}
	}

	// ── Detections, before association ────────────────────────────────────
	if (layers.detections && result) {
		for (const d of kept) {
			const at = place(d.x, d.y);
			if (!at) {
				unplaceable++;
				continue;
			}
			features.push({
				type: "Feature",
				geometry: { type: "Point", coordinates: at },
				properties: {
					layer: "detection",
					// These are the replay's detections, never the robot's alerts.
					// Without this a `detection` point in QGIS is indistinguishable
					// from something the robot published — the exact merge the
					// `source` field on targets exists to prevent.
					source: "replay",
					coil: d.coil,
					amplitude: d.amp,
					threshold: orNull(d.thr),
					t: orNull(d.t),
					t_utc: utc(o.startedAt, d.t),
					sigma: orNull(d.sigma),
					target: d.targetId >= 0 ? d.targetId : null,
					// True when the message stamp was not this coil's own peak
					// time — the legacy publisher shares one stamp per cycle, and a
					// borrowed stamp means this point was placed from a fix taken
					// slightly after the coil actually passed.
					borrowed_stamp: d.borrowed,
				},
			});
		}
	}

	// ── The robot's track ─────────────────────────────────────────────────
	if (layers.track) {
		const lines = segments(n, (i) => {
			const lat = run.fixLat[i]!;
			const lon = run.fixLon[i]!;
			if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
			return { lat, lon, x: run.sx[i]!, y: run.sy[i]!, t: run.t[i]! };
		});
		lines.forEach((line, seg) => {
			features.push({
				type: "Feature",
				geometry: { type: "LineString", coordinates: line },
				properties: {
					layer: "track",
					what: "robot",
					// One feature per continuous stretch. More than one means the
					// fix went away in between, and the ground under the break was
					// not surveyed — a single line across it would say it was.
					segment: seg,
					segments: lines.length,
					vertices: line.length,
					samples: n,
				},
			});
		});
	}

	// ── One track per coil ────────────────────────────────────────────────
	if (layers.coilTracks) {
		const nc = run.ncoil;
		for (let c = 0; c < nc; c++) {
			const lines = segments(n, (i) => {
				const lat = run.coilLat[i * nc + c]!;
				const lon = run.coilLon[i * nc + c]!;
				if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
				// Thinned against the *coil's own* travel, not the robot's. A
				// pivot moves the body a few centimetres while a coil 0.4 m out
				// sweeps an arc — decimating on the body would drop every vertex
				// of that arc and chord across the ground the coil actually
				// covered, in the one layer whose whole point is what was swept.
				const [x, y] = toEnu(lat, lon, run.originLat, run.originLon);
				return { lat, lon, x, y, t: run.t[i]! };
			});
			lines.forEach((line, seg) => {
				features.push({
					type: "Feature",
					geometry: { type: "LineString", coordinates: line },
					properties: {
						layer: "coil_track",
						what: "coil",
						coil: run.coilIds[c] ?? c + 1,
						segment: seg,
						segments: lines.length,
						vertices: line.length,
					},
				});
			});
		}
	}

	// Null, not zero: a reader must be able to tell a run with no samples from
	// one that lasted no time — the same rule `orNull` applies to every measure.
	const t0 = n > 0 ? run.t[0]! : null;
	const t1 = n > 0 ? run.t[n - 1]! : null;

	return {
		type: "FeatureCollection",
		properties: {
			generator: "ORMI teodor-emi",
			format_version: 1,
			generated_at: new Date(o.generatedAt ?? Date.now()).toISOString(),
			run_id: run.id,
			run_label: run.label,
			run_source: run.source,
			// Which stored mission this is, when the export was made from one.
			// `run.id` is the datasource instance for a live run and says nothing
			// about the survey, so without this an exported file cannot be tied
			// back to the recording it came from.
			mission_id: o.missionId ?? null,
			mission_name: o.missionName ?? null,
			samples: n,
			coils: [...run.coilIds],
			sample_rate_hz: run.sampleRateHz,
			t_start: t0,
			t_end: t1,
			duration_s: t0 === null || t1 === null ? null : orNull(t1 - t0),
			started_at: o.startedAt
				? new Date(o.startedAt).toISOString()
				: null,
			// Features the run could not place, so a count that looks short is
			// explained by the file rather than by guesswork.
			unplaceable,
			// Whether this file is the survey or a hand-picked subset of it, and
			// how many picks the current tuning no longer produces. A reader six
			// months later cannot otherwise tell a short export from a short day.
			selected: picked ? kept.length + (keptTargets?.size ?? 0) : null,
			selection_unmatched: picked ? missing : null,
			origin: [coord(run.originLon), coord(run.originLat)],
			// The whole tuning, verbatim. Spread rather than referenced: this
			// object is written into a file that outlives the session.
			params: { ...params },
			track_decimation_m: TRACK_MIN_M,
			layers: { ...layers },
		},
		features,
	};
}

/** A file name that sorts by run and says what it holds. */
export function geoJsonFilename(run: EmiRun, when = Date.now()): string {
	const stamp = new Date(when)
		.toISOString()
		.replace(/[:.]/g, "-")
		.slice(0, 19);
	const label = (run.label || run.id)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return `emi-${label || "run"}-${stamp}.geojson`;
}

/**
 * How many features each layer would contribute.
 *
 * Exact for the point layers. For the two line layers it is an **upper bound**:
 * a track is one feature per continuous stretch, and a stretch that decimates
 * below two vertices is omitted, neither of which is known without walking the
 * whole run — which is not worth doing on every render to label a checkbox.
 *
 * @param run - The run to be exported.
 * @param result - The replay, when there is one.
 * @returns Feature counts per layer.
 */
export function countLayers(
	run: EmiRun,
	result: ReplayResult | null,
): Record<keyof GeoJsonLayers, number> {
	return {
		targets: result?.targets.length ?? 0,
		recordedTargets: run.recorded.targets.length,
		detections: result?.geoNew.length ?? 0,
		track: run.n > 0 ? 1 : 0,
		coilTracks: run.n > 0 ? run.ncoil : 0,
	};
}
