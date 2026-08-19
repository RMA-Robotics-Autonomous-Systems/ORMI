"use client";

/**
 * W4 — the EMI layers on the standard map widget.
 *
 * Four marker types, registered into `maps-box-viewer` through the same
 * `std-widgets-map-*` filters the existing `TeodorEMI` heat layer uses. The map
 * widget itself is untouched: it owns the basemap, the projection, the zoom and
 * pan, the layer toggles and the popups, and these contribute sources and layers
 * to it.
 *
 * ## Where the data comes from
 *
 * Not from the selected topic. These layers draw the **shared replay** — the
 * same detections, targets and poses every other EMI panel is showing — so
 * moving a slider in the parameter rail moves the marks on the map. The topic a
 * user selects when adding the layer only names it and scopes its toggle; the
 * EMI run is resolved from the datasource, once, by the store.
 *
 * That is deliberate. A map layer fed from the topic would show what the robot
 * decided, which is what the recorded layer already shows; the value of the
 * replayed layer is precisely that it answers to the rail.
 *
 * ## The cursor crosses the boundary in both directions
 *
 * The charts and the map are two pictures of one recording, so pointing at
 * either puts a playhead on the other. Both directions go through the same
 * shared cursor atom the time panels already use — which is what makes them
 * agree rather than approximately agree.
 *
 * The map's half is wired with maplibre's own layer-scoped listeners
 * (`map.on("mousemove", layerId, …)`) rather than react-map-gl's
 * `interactiveLayerIds`, because that prop lives on the `<Map>` element and the
 * `<Map>` element belongs to the standard map widget. Listening directly keeps
 * every line of this inside the plugin, which is the difference between a
 * feature and a change to `ormi-std-widgets`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";
import type { SelectedTopic } from "@workspace/ormi-core/datasources";
import { createTopicKey } from "@workspace/utils";
import { fromEnu, poseIndices } from "../detector/georeference";
import { drivenTrack } from "./driven-track";
import type { EmiRun } from "../detector/run-types";
import { useEmiReplay } from "../state/use-emi-run";
import {
	detectionKey,
	targetKey,
	toggleEmiSelection,
	useEmiCursor,
	useEmiSelection,
	writeEmiCursor,
} from "../state/atoms";

/** Marker type names contributed to the map widget. */
export const EMI_MAP_TYPES = {
	detections: "TeodorEMIDetections",
	targets: "TeodorEMITargets",
	ghosts: "TeodorEMIGhosts",
	track: "TeodorEMITrack",
} as const;

/** Colours, matching the panels: blue recorded, orange replayed, pink target. */
const RECORDED = "#2a78d6";
const REPLAYED = "#eb6834";
const TARGET = "#c2548f";
const GHOST = "#8d8b84";
/**
 * The driven track. Darker than the ghosts on purpose — the path is the ground
 * truth every mark is read against, and eighty faint rakes drawn along it must
 * not be mistaken for the line itself.
 */
const TRACK = "#5f5c57";
/** The playhead. Deliberately none of the four above: it is not a finding. */
const CURSOR = "#1f9d8f";
/** Hand-picked for export. The same colour the coil panels ring a pick in. */
const PICKED = "#1f9d8f";

/** Ghosts drawn before the layer starts thinning, to keep the map readable. */
const MAX_GHOSTS = 80;

/**
 * Radius of the invisible circle that catches the pointer, CSS pixels.
 *
 * maplibre's delegated listeners query a **single pixel**, so a 4-pixel mark
 * demands 4-pixel aim — which on a survey where two detections sit 30 cm apart
 * reads as "clicking sometimes works". A transparent circle on the same source
 * is still rendered, and `queryRenderedFeatures` ignores paint opacity, so it
 * catches the pointer while changing nothing on screen.
 *
 * Kept modest on purpose: much larger and two neighbouring marks overlap, and
 * the click picks whichever happens to be on top rather than the one aimed at.
 */
const HIT_RADIUS = 11;

/** Paint for a hit layer: present to the query, absent to the eye. */
const HIT_PAINT = {
	"circle-radius": HIT_RADIUS,
	"circle-color": "#000000",
	"circle-opacity": 0,
} as const;

/**
 * Props every EMI marker type receives from the map widget.
 *
 * `topic` is not read for data — these layers draw the shared replay — but it is
 * what identifies the layer instance. The map widget's control panel also
 * dereferences it for every entry, so it must still be selected.
 */
export interface EmiLayerProps {
	topic: SelectedTopic;
	name: string;
}

/**
 * Stable identity for one layer instance.
 *
 * Derived from the selected topic rather than from `name`, which is optional
 * free text: two entries with the same (or blank) name would otherwise share one
 * maplibre source, overwrite each other's data, and unmounting either would tear
 * down the other's layers. This is the key the std markers use, and the key the
 * map's control panel looks its buttons up under.
 */
const layerKey = (topic: SelectedTopic): string => createTopicKey(topic);

/** An empty collection, so a Source always has data. */
const EMPTY: GeoJSON.FeatureCollection = {
	type: "FeatureCollection",
	features: [],
};

/**
 * Visibility toggle in the map's button holder, matching the existing layer.
 *
 * @param key - Button key, unique per layer instance.
 * @param label - Tooltip text.
 * @returns Whether the layer should draw.
 */
function useLayerToggle(key: string, label: string): boolean {
	const { setButtonItem, removeButtonItem } = useButtonHolder();
	const [show, setShow] = useState(true);

	useEffect(() => {
		setButtonItem(
			key,
			<Button
				variant="ghost"
				title={label}
				onClick={() => setShow((s) => !s)}
			>
				{show ? (
					<EyeIcon className="h-4 w-4" />
				) : (
					<EyeClosedIcon className="h-4 w-4" />
				)}
			</Button>,
			1,
		);
		return () => removeButtonItem(key);
	}, [key, label, show, setButtonItem, removeButtonItem]);

	return show;
}

/** Local metres to `[lon, lat]`, the order GeoJSON wants. */
function toLngLat(run: EmiRun, x: number, y: number): [number, number] {
	const [lat, lon] = fromEnu(x, y, run.originLat, run.originLon);
	return [lon, lat];
}

// ── Map → panels: hovering a mark moves the shared playhead ──────────

/**
 * Put the shared cursor on whatever EMI feature the pointer is over.
 *
 * Layer-scoped maplibre listeners, so the handler only runs when the pointer is
 * actually over one of our marks — no hit-testing of our own, and no cost at
 * all while the pointer is anywhere else on the basemap.
 *
 * Clicking picks the feature for export, which is the same gesture the coil
 * signal panel uses and the reason both are here rather than only on the chart:
 * a survey is read on the map, and being made to go and find the same detection
 * in a time series to select it is the wrong way round.
 *
 * @param layerIds - Layers to listen on.
 * @param enabled - False while the layer is hidden or the run is empty.
 */
function useEmiMapHover(layerIds: string[], enabled: boolean): void {
	const { current: map } = useMap();
	const { result } = useEmiReplay();

	// A pick selects the mark that was clicked, and nothing else.
	//
	// `det` is the discriminator, not `target`: a replayed detection feature
	// carries **both** — its own index and the id of the target it was folded
	// into — so branching on `target` first made clicking a detection select its
	// whole chain, and clicking the barycentre select the chain rather than the
	// barycentre. A barycentre is its own exportable object: an operator who
	// wants the averaged position wants that, not the four detections it came
	// from, and the members are one click each if they are what is wanted.
	const onPick = useCallback(
		(target: number, det: number) => {
			if (!result) return;
			if (det >= 0) {
				const d = result.geoNew[det];
				if (d) toggleEmiSelection([detectionKey(d)]);
				return;
			}
			if (target >= 0) toggleEmiSelection([targetKey(target)]);
		},
		[result],
	);

	// `layerIds` is a fresh array each render; the joined string is the real
	// dependency, so the listeners are not torn down and rebuilt every frame.
	const idKey = layerIds.join("|");

	useEffect(() => {
		const m = map?.getMap();
		if (!m || !enabled) return;
		const ids = idKey.split("|").filter(Boolean);

		const move = (ev: maplibregl.MapLayerMouseEvent) => {
			const f = ev.features?.[0];
			if (!f) return;
			const p = f.properties ?? {};
			const t = Number(p.t);
			if (!Number.isFinite(t)) return;
			m.getCanvas().style.cursor = "pointer";
			writeEmiCursor({
				t,
				det: Number.isFinite(Number(p.det)) ? Number(p.det) : -1,
				target: Number.isFinite(Number(p.target))
					? Number(p.target)
					: -1,
			});
		};
		const leave = () => {
			m.getCanvas().style.cursor = "";
			writeEmiCursor(null);
		};
		const click = (ev: maplibregl.MapLayerMouseEvent) => {
			const p = ev.features?.[0]?.properties ?? {};
			onPick(
				Number.isFinite(Number(p.target)) ? Number(p.target) : -1,
				Number.isFinite(Number(p.det)) ? Number(p.det) : -1,
			);
		};

		// Bound unconditionally. maplibre's delegated listeners re-resolve their
		// layers on **every event** (`layers.filter(id => map.getLayer(id))`),
		// so binding before a layer exists costs nothing and starts working the
		// moment it does. Checking `getLayer` here instead made the binding
		// depend on whether this effect happened to run before or after
		// react-map-gl added the layer to the style — a race that silently
		// dropped the listener for good, which is what made picking work on one
		// load and not the next.
		for (const id of ids) {
			m.on("mousemove", id, move);
			m.on("mouseleave", id, leave);
			m.on("click", id, click);
		}
		return () => {
			for (const id of ids) {
				m.off("mousemove", id, move);
				m.off("mouseleave", id, leave);
				m.off("click", id, click);
			}
			// The pointer style is the map's, not ours — leaving it as a hand
			// after the layer is switched off makes the whole basemap look
			// clickable.
			m.getCanvas().style.cursor = "";
		};
	}, [map, enabled, idKey, onPick]);
}

// ── Panels → map: the robot, and the mark, at the playhead ───────────

/**
 * Where the robot was at a run-relative time.
 *
 * Nearest sample rather than an interpolation: the fix stream is the thing being
 * shown, and a position between two fixes is a position the robot was never
 * reported at.
 *
 * @param run - The run to look in.
 * @param t - Seconds from run start.
 * @returns `[lon, lat]`, or null when the run has no usable fix there.
 */
function fixAt(run: EmiRun, t: number): [number, number] | null {
	const n = run.n;
	if (n === 0) return null;
	// Binary search: `run.t` is monotonic by construction (it is the timebase),
	// and a survey is a hundred thousand samples that would otherwise be walked
	// on every pointer frame.
	let lo = 0;
	let hi = n - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (run.t[mid]! < t) lo = mid + 1;
		else hi = mid;
	}
	if (lo > 0 && Math.abs(run.t[lo - 1]! - t) < Math.abs(run.t[lo]! - t)) lo--;
	const lat = run.fixLat[lo]!;
	const lon = run.fixLon[lo]!;
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	return [lon, lat];
}

/**
 * The playhead, on the map.
 *
 * Two marks with different jobs. The **robot** is where it was at the cursor's
 * time — hovering a peak on the coil signals and seeing the machine move along
 * its track is the whole of "chart → map". The **highlight** rings the detection
 * under the cursor, so pointing at a mark on either side names the same one.
 *
 * Rendered once, by the detections layer, rather than by each of the three: they
 * would collide on source id, and the detections layer is the one whose marks
 * the cursor names.
 *
 * @returns Map sources and layers, or null when nothing is hovered.
 */
function EmiCursorOverlay(props: { keyId: string }) {
	const { run, result } = useEmiReplay();
	const cursor = useEmiCursor();

	const selection = useEmiSelection();

	// The picks, as their own collection. Separate from the cursor's marks so a
	// selection stays drawn while the pointer is elsewhere — the whole point of
	// picking is to build a set up over a survey and still see it.
	const picks = useMemo<GeoJSON.FeatureCollection>(() => {
		if (!run || !result || selection.size === 0) return EMPTY;
		// Both kinds, in one collection. A picked barycentre is drawn wider than
		// a picked detection because it is a wider claim — the averaged position
		// of several passes rather than one of them — and because the two often
		// sit within a few centimetres of each other, where identical rings
		// would say the operator had picked the same thing twice.
		const targets = result.targets
			.filter((t) => selection.has(targetKey(t.id)))
			.map((t) => ({
				type: "Feature" as const,
				geometry: {
					type: "Point" as const,
					coordinates: toLngLat(run, t.cx, t.cy),
				},
				properties: { target: t.id, bary: true },
			}));
		return {
			type: "FeatureCollection",
			features: [
				...targets,
				...result.geoNew
					.filter((d) => selection.has(detectionKey(d)))
					.map((d) => ({
						type: "Feature" as const,
						geometry: {
							type: "Point" as const,
							coordinates: toLngLat(run, d.x, d.y),
						},
						properties: { coil: d.coil, bary: false },
					})),
			],
		};
	}, [run, result, selection]);

	const data = useMemo<GeoJSON.FeatureCollection>(() => {
		if (!run || !cursor) return EMPTY;
		const features: GeoJSON.Feature[] = [];
		const at = fixAt(run, cursor.t);
		if (at) {
			features.push({
				type: "Feature",
				geometry: { type: "Point", coordinates: at },
				properties: { kind: "robot" },
			});
		}
		const d = cursor.det >= 0 ? result?.geoNew[cursor.det] : undefined;
		if (d) {
			features.push({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: toLngLat(run, d.x, d.y),
				},
				properties: { kind: "mark" },
			});
		}
		return { type: "FeatureCollection", features };
	}, [run, result, cursor]);

	if (data.features.length === 0 && picks.features.length === 0) return null;

	return (
		<>
			{picks.features.length > 0 && (
				<Source
					id={`emi-picked-${props.keyId}`}
					type="geojson"
					data={picks}
				>
					<Layer
						id={`emi-picked-layer-${props.keyId}`}
						type="circle"
						paint={{
							"circle-color": PICKED,
							// A barycentre reads as the wider claim it is.
							"circle-radius": ["case", ["get", "bary"], 5, 3],
							"circle-stroke-color": PICKED,
							"circle-stroke-width": [
								"case",
								["get", "bary"],
								4,
								2.5,
							],
							"circle-stroke-opacity": 0.85,
							"circle-opacity": 0.9,
						}}
					/>
				</Source>
			)}
			{data.features.length > 0 && (
				<Source
					id={`emi-cursor-${props.keyId}`}
					type="geojson"
					data={data}
				>
					{/* A halo, so the robot stays findable zoomed out — at whole-survey
			    extent a 4 px dot on a track of ten thousand marks is lost. */}
					<Layer
						id={`emi-cursor-halo-${props.keyId}`}
						type="circle"
						filter={["==", ["get", "kind"], "robot"]}
						paint={{
							"circle-color": CURSOR,
							"circle-radius": 9,
							"circle-opacity": 0.18,
							"circle-stroke-color": CURSOR,
							"circle-stroke-width": 1.5,
							"circle-stroke-opacity": 0.9,
						}}
					/>
					<Layer
						id={`emi-cursor-mark-${props.keyId}`}
						type="circle"
						filter={["==", ["get", "kind"], "mark"]}
						paint={{
							"circle-color": "transparent",
							"circle-radius": 8,
							"circle-stroke-color": CURSOR,
							"circle-stroke-width": 2.5,
						}}
					/>
				</Source>
			)}
		</>
	);
}

// ── W4a — detections, recorded against replayed ──────────────────────

/**
 * Recorded and replayed detections as two paired layers.
 *
 * Two sources rather than one with a discriminating property: they carry
 * different geometry (the recorded ones are the robot's own coil fixes, the
 * replayed ones are placed by whichever frame the rail selects) and they must be
 * separately switchable, which a single filtered layer makes awkward.
 *
 * @param props - Topic and layer name from the map widget.
 * @returns Map sources and layers.
 */
export function EmiDetectionsLayer(props: EmiLayerProps) {
	const { run, result, snapshot } = useEmiReplay();
	const key = layerKey(props.topic);
	const show = useLayerToggle(key, "EMI detections — recorded and replayed");

	// Keyed on the snapshot, not on `run`: the builder returns the same run
	// object on every commit and reassigns `recorded.alerts` on it, so a memo
	// keyed on the run's identity would compute once — at the first commit,
	// with almost nothing recorded — and then claim for the whole survey that
	// the robot raised no alerts.
	const recorded = useMemo<GeoJSON.FeatureCollection>(() => {
		const run = snapshot.run;
		if (!run) return EMPTY;
		return {
			type: "FeatureCollection",
			features: run.recorded.alerts
				.filter(
					(a) =>
						Number.isFinite(a.latitude) &&
						Number.isFinite(a.longitude),
				)
				.map((a) => ({
					type: "Feature" as const,
					geometry: {
						type: "Point" as const,
						coordinates: [a.longitude, a.latitude],
					},
					properties: {
						coil: a.coil,
						amp: a.amp,
						t: a.t,
						kind: "recorded",
					},
				})),
		};
	}, [snapshot]);

	const replayed = useMemo<GeoJSON.FeatureCollection>(() => {
		if (!run || !result) return EMPTY;
		return {
			type: "FeatureCollection",
			features: result.geoNew.map((d, i) => ({
				type: "Feature" as const,
				geometry: {
					type: "Point" as const,
					coordinates: toLngLat(run, d.x, d.y),
				},
				properties: {
					coil: d.coil,
					amp: d.amp,
					t: d.t,
					target: d.targetId,
					// The index the shared cursor speaks in, and the sample the
					// export key is built from. Both ride on the feature so the
					// map's listeners need no lookup back into the replay.
					det: i,
					iPeak: d.iPeak,
					kind: "replayed",
				},
			})),
		};
	}, [run, result]);

	// Only the replayed layer is listened on. The recorded marks are what the
	// robot decided on the day and carry no index into the current replay, so a
	// cursor set from one would name a detection that is not the one under it.
	useEmiMapHover([`emi-replayed-hit-${key}`], show && Boolean(result));

	if (!show) return null;

	return (
		<>
			{/* Recorded underneath, as open rings: a recorded and a replayed
			    detection at the same peak sit on the same point, and the ring
			    keeps both readable instead of one hiding the other. */}
			<Source id={`emi-recorded-${key}`} type="geojson" data={recorded}>
				<Layer
					id={`emi-recorded-layer-${key}`}
					type="circle"
					paint={{
						"circle-color": "transparent",
						"circle-radius": 6,
						"circle-stroke-color": RECORDED,
						"circle-stroke-width": 1.75,
					}}
				/>
			</Source>
			<Source id={`emi-replayed-${key}`} type="geojson" data={replayed}>
				{/* First, so it is added to the style beneath the visible mark
				    and cannot paint over it. */}
				<Layer
					id={`emi-replayed-hit-${key}`}
					type="circle"
					paint={HIT_PAINT}
				/>
				<Layer
					id={`emi-replayed-layer-${key}`}
					type="circle"
					paint={{
						"circle-color": REPLAYED,
						"circle-radius": 4,
						"circle-stroke-color": "#ffffff",
						"circle-stroke-width": 1.5,
						"circle-opacity": 0.9,
					}}
				/>
			</Source>
			{/* The playhead, above both. Rendered here and only here: the three
			    layers would collide on source id, and this is the layer whose
			    marks the cursor names. */}
			<EmiCursorOverlay keyId={key} />
		</>
	);
}

// ── W4b — targets and their spokes ───────────────────────────────────

/**
 * Target centroids joined to the detections that made them.
 *
 * The spokes are the association drawn as what it is: several passes of the
 * array over one object, averaged. Without them a centroid is a claim with no
 * visible evidence, and two targets 30 cm apart look like one.
 *
 * @param props - Topic and layer name from the map widget.
 * @returns Map sources and layers.
 */
export function EmiTargetsLayer(props: EmiLayerProps) {
	const { run, result } = useEmiReplay();
	const key = layerKey(props.topic);
	const show = useLayerToggle(key, "EMI targets and their member detections");

	const spokes = useMemo<GeoJSON.FeatureCollection>(() => {
		if (!run || !result) return EMPTY;
		return {
			type: "FeatureCollection",
			features: result.targets
				.filter((t) => t.members.length > 1)
				.map((t) => ({
					type: "Feature" as const,
					geometry: {
						type: "MultiLineString" as const,
						coordinates: t.members.map((m) => [
							toLngLat(run, t.cx, t.cy),
							toLngLat(run, m.x, m.y),
						]),
					},
					properties: { id: t.id },
				})),
		};
	}, [run, result]);

	const centroids = useMemo<GeoJSON.FeatureCollection>(() => {
		if (!run || !result) return EMPTY;
		return {
			type: "FeatureCollection",
			features: result.targets.map((t) => ({
				type: "Feature" as const,
				geometry: {
					type: "Point" as const,
					coordinates: toLngLat(run, t.cx, t.cy),
				},
				properties: {
					id: t.id,
					members: t.members.length,
					bestAmp: t.bestAmp,
					bestCoil: t.bestCoil,
					spread: t.spread,
					confirmed: t.confirmed,
					degraded: t.degraded,
					// What the shared cursor speaks in. A target's moment is its
					// first sighting — the pass that opened it — rather than the
					// mean of its members, which is a time nothing happened at.
					target: t.id,
					t: t.firstSeen,
				},
			})),
		};
	}, [run, result]);

	// Pointing at a centroid puts the playhead on the pass that opened it, and
	// clicking picks every detection it was built from.
	useEmiMapHover([`emi-centroids-hit-${key}`], show && Boolean(result));

	if (!show) return null;

	return (
		<>
			<Source id={`emi-spokes-${key}`} type="geojson" data={spokes}>
				<Layer
					id={`emi-spokes-layer-${key}`}
					type="line"
					paint={{
						"line-color": TARGET,
						"line-width": 1,
						"line-opacity": 0.55,
					}}
				/>
			</Source>
			<Source id={`emi-centroids-${key}`} type="geojson" data={centroids}>
				<Layer
					id={`emi-centroids-hit-${key}`}
					type="circle"
					paint={HIT_PAINT}
				/>
				<Layer
					id={`emi-centroids-layer-${key}`}
					type="circle"
					paint={{
						// Confirmed targets are larger: more than one coil saw
						// them, which is the distinction the whole proposal is
						// about.
						"circle-radius": ["case", ["get", "confirmed"], 7, 5],
						"circle-color": TARGET,
						"circle-stroke-color": "#ffffff",
						"circle-stroke-width": 1.5,
						// A degraded fix is drawn faint rather than hidden: the
						// target is real, its position is not trustworthy.
						"circle-opacity": [
							"case",
							["get", "degraded"],
							0.45,
							0.95,
						],
					}}
				/>
			</Source>
		</>
	);
}

// ── W4d — the driven track ───────────────────────────────────────────

/**
 * Where the robot actually went.
 *
 * The layer the rest of the map is read against: detections mean "here", targets
 * mean "here, more than once", and neither can be judged without the path they
 * were raised from. A gap in the track is a gap in the survey, and it is drawn as
 * a gap — the line is a `MultiLineString` broken wherever the fix went away or
 * jumped, never bridged. The breaking and thinning rules live in
 * `driven-track.ts`, where they can be tested.
 *
 * Drawn from the same `sx`/`sy` columns every detection is placed from, so the
 * track and the marks cannot disagree about where the robot was.
 *
 * @param props - Topic and layer name from the map widget.
 * @returns Map sources and layers.
 */
export function EmiTrackLayer(props: EmiLayerProps) {
	const { run, snapshot } = useEmiReplay();
	const key = layerKey(props.topic);
	const show = useLayerToggle(key, "Path the robot drove");

	// Read out here so the memo genuinely consumes it: the run object's identity
	// never changes while it grows, so `n` is the only thing that says the track
	// moved, and a dependency the body does not read is one the React Compiler is
	// entitled to drop (see AGENTS.md).
	const n = snapshot.n;

	const track = useMemo<GeoJSON.FeatureCollection>(() => {
		if (!run || n === 0) return EMPTY;
		const lines = drivenTrack(run, n);
		if (lines.length === 0) return EMPTY;
		return {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					geometry: { type: "MultiLineString", coordinates: lines },
					properties: { stretches: lines.length },
				},
			],
		};
	}, [run, n]);

	if (!show) return null;

	return (
		<Source id={`emi-track-${key}`} type="geojson" data={track}>
			<Layer
				id={`emi-track-layer-${key}`}
				type="line"
				layout={{ "line-cap": "round", "line-join": "round" }}
				paint={{
					"line-color": TRACK,
					"line-width": 1.75,
					"line-opacity": 0.65,
				}}
			/>
		</Source>
	);
}

// ── W4c — robot ghosts ───────────────────────────────────────────────

/**
 * The robot's transform tree, stroked at the pose each detection was raised
 * from.
 *
 * The tree itself, edge for edge and node for node — not a rake inferred from
 * the coil offsets. The distinction is the whole value of the layer. Five dots
 * joined by two lines is a shape, and a shape can be drawn plausibly while the
 * georeferencing behind it is wrong; the recording's own tree carries the
 * antenna, the GNSS receiver, the lidar and the camera boom as well, so a ghost
 * has a front, a back and a known scale, and *that* is what makes "the coil sits
 * on its own mark" a claim a reader can check by eye. It is also what the
 * offline report draws, which is the standard this panel is measured against.
 *
 * The tree ships expressed in `base_link`, while the fix belongs to whichever
 * frame the offsets were resolved against — so every node is shifted onto that
 * origin before it is rotated by the pose. Skipping that shift draws the robot
 * displaced from its own fix by the lever arm, which is precisely the error the
 * georeferencing choice exists to expose.
 *
 * Thinned above {@link MAX_GHOSTS}: a survey with a thousand detections would
 * otherwise paint the whole track solid. The thinning is even rather than a
 * prefix, so the layer covers the whole survey at lower density instead of
 * showing its beginning in full and none of its end. **It is currently silent** —
 * there is no rendered control to report the stride on; say so here rather than
 * let the layer imply it is complete.
 *
 * @param props - Topic and layer name from the map widget.
 * @returns Map sources and layers.
 */
export function EmiGhostsLayer(props: EmiLayerProps) {
	const { run, result } = useEmiReplay();
	const key = layerKey(props.topic);
	const show = useLayerToggle(key, "Robot pose at each detection");

	// Lifted out of the memo deliberately. The run object's identity is stable
	// while its fields are mutated in place, and `frameTree` is replaced when a
	// late `tf_static` resolves — so the tree has to be the dependency itself.
	// Keying on a revision counter the body does not read is the pattern the
	// React Compiler strips as a dead read, which freezes the memo on its first
	// result (see AGENTS.md).
	const tree = run?.frameTree ?? null;

	const ghosts = useMemo<{
		links: GeoJSON.FeatureCollection;
		joints: GeoJSON.FeatureCollection;
	}>(() => {
		const none = { links: EMPTY, joints: EMPTY };
		if (!run || !result || !tree || result.geoNew.length === 0) return none;

		// Onto the frame the fix belongs to. `gnssFrame` names the frame the
		// coil offsets were resolved against, and the pose columns are that
		// frame's origin — so the tree has to be re-expressed there too.
		const org = tree.nodes[result.geoConfig.frame] ?? [0, 0];
		const local: Record<string, readonly [number, number]> = {};
		for (const [name, p] of Object.entries(tree.nodes)) {
			local[name] = [p[0] - org[0], p[1] - org[1]];
		}

		// Even thinning rather than "the first N": a prefix would show the
		// beginning of the survey in full and none of the end.
		const stride = Math.max(
			1,
			Math.ceil(result.geoNew.length / MAX_GHOSTS),
		);
		const links: GeoJSON.Feature[] = [];
		const joints: GeoJSON.Feature[] = [];
		for (let k = 0; k < result.geoNew.length; k += stride) {
			const d = result.geoNew[k]!;
			// The SAME indices the placement used. Reading `iPeak` for both —
			// which this did — draws the rake on the wrong heading under every
			// preset that takes orientation at release, so the raising coil
			// misses the detection's own mark and the ghost contradicts exactly
			// the georeferencing it exists to check.
			const { iPos, iYaw } = poseIndices(d, result.geoConfig);
			const yaw = run.yaw[iYaw];
			const px = run.sx[iPos];
			const py = run.sy[iPos];
			if (
				yaw === undefined ||
				px === undefined ||
				py === undefined ||
				!Number.isFinite(yaw) ||
				!Number.isFinite(px) ||
				!Number.isFinite(py)
			) {
				continue;
			}
			const ch = Math.cos(yaw);
			const sh = Math.sin(yaw);
			const place = (p: readonly [number, number]): [number, number] =>
				toLngLat(
					run,
					px + ch * p[0] - sh * p[1],
					py + sh * p[0] + ch * p[1],
				);

			const lines: Array<[number, number][]> = [];
			for (const [parent, child] of tree.edges) {
				const a = local[parent];
				const b = local[child];
				if (a && b) lines.push([place(a), place(b)]);
			}
			if (lines.length === 0) continue;
			links.push({
				type: "Feature",
				geometry: { type: "MultiLineString", coordinates: lines },
				properties: { t: d.t, coil: d.coil },
			});

			// The coil that raised this detection is marked apart from the rest,
			// so a ghost says which of its five coils it is standing there for —
			// without it, a cluster of ghosts is a crowd of identical robots.
			const mine = `coil${d.coil}_link`;
			for (const [name, p] of Object.entries(local)) {
				joints.push({
					type: "Feature",
					geometry: { type: "Point", coordinates: place(p) },
					properties: { frame: name, raised: name === mine },
				});
			}
		}
		return {
			links: { type: "FeatureCollection", features: links },
			joints: { type: "FeatureCollection", features: joints },
		};
	}, [run, result, tree]);

	if (!show) return null;

	return (
		<>
			<Source id={`emi-ghosts-${key}`} type="geojson" data={ghosts.links}>
				<Layer
					id={`emi-ghosts-layer-${key}`}
					type="line"
					paint={{
						"line-color": GHOST,
						"line-width": 1,
						// A rake is 1.4 m across. Zoomed out to the whole survey
						// that is under a pixel, and eighty of them stack into a
						// grey smear over the marks they exist to support — so
						// they fade in only once the shape can be read.
						"line-opacity": [
							"interpolate",
							["linear"],
							["zoom"],
							16,
							0,
							18,
							0.45,
						],
					}}
				/>
			</Source>
			<Source
				id={`emi-ghost-joints-${key}`}
				type="geojson"
				data={ghosts.joints}
			>
				<Layer
					id={`emi-ghost-joints-layer-${key}`}
					type="circle"
					paint={{
						"circle-radius": ["case", ["get", "raised"], 3, 1.8],
						"circle-color": [
							"case",
							["get", "raised"],
							REPLAYED,
							GHOST,
						],
						"circle-opacity": [
							"interpolate",
							["linear"],
							["zoom"],
							17,
							0,
							19,
							0.8,
						],
					}}
				/>
			</Source>
		</>
	);
}
