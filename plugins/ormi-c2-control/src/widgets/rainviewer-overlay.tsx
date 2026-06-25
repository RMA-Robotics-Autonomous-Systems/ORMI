"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Layer, Source } from "react-map-gl/maplibre";

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
 * Live RainViewer radar overlay (rendered as a child of the MapLibre map).
 *
 * "Fully live" on two clocks: {@link useRainviewerFrames} re-fetches the index
 * every ~10 min (freshness), and a local interval animates through the frames
 * (past → nowcast). All frames are mounted as raster layers so their tiles
 * preload; only the active frame is opaque, giving a flicker-free crossfade.
 * `beforeId="c2-features-fill"` keeps the radar under the C2 features.
 *
 * Self-contained: it owns its frame index + play state and also renders a small
 * play/pause + timestamp control over the map, so no state crosses the widget
 * boundary. Mount it conditionally on the Layers toggle.
 */
export function RainviewerOverlay() {
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

	if (host === "" || frames.length === 0) return null;

	const index = tick % frames.length;
	const current = frames[index];
	if (!current) return null;

	const isForecast = index >= pastCount;
	const label = new Date(current.time * 1000).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<>
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
						id={`c2-rainviewer-${frame.time}-layer`}
						type="raster"
						beforeId="c2-features-fill"
						paint={{
							"raster-opacity": i === index ? RADAR_OPACITY : 0,
							"raster-opacity-transition": { duration: 300 },
						}}
					/>
				</Source>
			))}
			<div className="absolute bottom-2 right-2 z-10 flex items-center gap-2 bg-background/95 border rounded-md px-2 py-1 shadow-md text-xs">
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
							? "text-sky-500 font-medium"
							: "text-muted-foreground"
					}
				>
					{isForecast ? "forecast" : "radar"}
				</span>
			</div>
		</>
	);
}
