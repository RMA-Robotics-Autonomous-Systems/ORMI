"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";

import {
	applyRasterLayerOrder,
	type BeforeIdCandidate,
} from "@workspace/ormi-core/map-layers/map";

import { Button } from "@workspace/ui/components/button";

import {
	RAINVIEWER_MAXZOOM,
	buildRainviewerTileUrl,
} from "./maps-shared/rainviewer";
import { useRainviewerFrames } from "./maps-shared/use-rainviewer-frames";

/** Animation cadence (ms per frame). */
const FRAME_MS = 600;
/** Radar paint opacity for the active frame. */
const RADAR_OPACITY = 0.7;

/**
 * Id of the hidden layer directly under the radar frames. Pass it as the
 * map-server stack's `beforeId` while the radar is on, so the radar draws
 * above every map-server layer.
 */
export const RAINVIEWER_ANCHOR_ID = "c2-rainviewer-anchor";

/** MapLibre layer id of one radar frame. */
function frameLayerId(time: number): string {
	return `c2-rainviewer-${time}-layer`;
}

/**
 * Live RainViewer radar overlay (rendered as a child of the MapLibre map).
 *
 * "Fully live" on two clocks: {@link useRainviewerFrames} re-fetches the index
 * every ~10 min (freshness), and a local interval animates through the frames
 * (past → nowcast). All frames are mounted as raster layers so their tiles
 * preload; only the active frame is opaque, giving a flicker-free crossfade.
 * `beforeIds` keeps the radar under the C2 features, and on a vector basemap
 * under the basemap's own place labels too. The candidates are resolved
 * against the **live** map (core's `applyRasterLayerOrder`, after every render
 * and on every `styledata`), never against the style object a widget is about
 * to hand MapLibre: during a basemap swap the two disagree, and a `beforeId`
 * the live map does not contain throws.
 *
 * Self-contained: it owns its frame index + play state and also renders a small
 * play/pause + timestamp control over the map, so no state crosses the widget
 * boundary. Mount it conditionally on the Layers toggle.
 *
 * @param props.beforeIds - Layer ids to stack the radar under, preferred
 *   first; the first one the live map contains wins.
 */
export function RainviewerOverlay(props: {
	beforeIds: readonly BeforeIdCandidate[];
}) {
	const { current: mapRef } = useMap();
	const map = mapRef?.getMap();
	const { host, frames, pastCount } = useRainviewerFrames();
	const [tick, setTick] = useState(0);
	const [playing, setPlaying] = useState(true);

	// Animation clock — advances a monotonic tick; the active frame is derived
	// from it via modulo so a refresh that resizes `frames` can't strand it.
	useEffect(() => {
		if (!playing || frames.length === 0) return;
		const id = setInterval(() => setTick((t) => t + 1), FRAME_MS);
		return () => clearInterval(id);
	}, [playing, frames.length]);

	// The radar stack bottom first: the anchor, then the frames in order.
	const idsKey = JSON.stringify([
		RAINVIEWER_ANCHOR_ID,
		...frames.map((frame) => frameLayerId(frame.time)),
	]);
	const candidatesKey = JSON.stringify(props.beforeIds);
	const idsRef = useRef<string[]>([]);
	const candidatesRef = useRef<BeforeIdCandidate[]>([]);

	// Placed before paint, after the `<Layer>` children added themselves.
	useLayoutEffect(() => {
		idsRef.current = JSON.parse(idsKey) as string[];
		candidatesRef.current = JSON.parse(
			candidatesKey,
		) as BeforeIdCandidate[];
		if (map)
			applyRasterLayerOrder(map, idsRef.current, candidatesRef.current);
	}, [map, idsKey, candidatesKey]);

	// A basemap swap re-adds the children: place them again.
	useEffect(() => {
		if (!map) return undefined;
		const onStyleData = () =>
			applyRasterLayerOrder(map, idsRef.current, candidatesRef.current);
		map.on("styledata", onStyleData);
		return () => {
			map.off("styledata", onStyleData);
		};
	}, [map]);

	// A hidden, sourceless layer under the radar frames, present while the
	// overlay is mounted, so the map-server stack can be placed under the
	// radar (`RAINVIEWER_ANCHOR_ID`) before the first frame has loaded.
	const anchor = (
		<Layer
			id={RAINVIEWER_ANCHOR_ID}
			type="background"
			layout={{ visibility: "none" }}
		/>
	);

	if (host === "" || frames.length === 0) return anchor;

	const index = tick % frames.length;
	const current = frames[index];
	if (!current) return anchor;

	const isForecast = index >= pastCount;
	const label = new Date(current.time * 1000).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<>
			{anchor}
			{frames.map((frame, i) => (
				<Source
					key={frame.time}
					id={`c2-rainviewer-${frame.time}`}
					type="raster"
					tiles={[buildRainviewerTileUrl(host, frame.path)]}
					tileSize={256}
					maxzoom={RAINVIEWER_MAXZOOM}
				>
					<Layer
						id={frameLayerId(frame.time)}
						type="raster"
						paint={{
							"raster-opacity": i === index ? RADAR_OPACITY : 0,
							"raster-opacity-transition": { duration: 300 },
						}}
					/>
				</Source>
			))}
			{/* Bottom-left: MapLibre's attribution (a licence term, the
			    RainViewer credit included) and MapChrome own the
			    bottom-right, and the mission map's panels the top corners. */}
			<div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 bg-background/95 border rounded-md px-2 py-1 shadow-md text-xs">
				<Button
					size="sm"
					variant="ghost"
					className="h-6 w-6 p-0"
					onClick={() => setPlaying((p) => !p)}
					aria-label={playing ? "Pause radar" : "Play radar"}
				>
					{playing ? (
						<Pause className="w-3.5 h-3.5" />
					) : (
						<Play className="w-3.5 h-3.5" />
					)}
				</Button>
				<span className="tabular-nums">{label}</span>
				<span
					className={
						isForecast
							? "text-info font-medium"
							: "text-muted-foreground"
					}
				>
					{isForecast ? "forecast" : "radar"}
				</span>
			</div>
		</>
	);
}
