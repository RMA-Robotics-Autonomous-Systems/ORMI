"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";

import { formatResolution, resolveScaleBar } from "./map-scale";

/**
 * Live metric scale bar for a MapLibre map, rendered as a child of the map.
 *
 * Deliberately not MapLibre's built-in `ScaleControl` — see `map-scale.ts` for
 * why its rounding cannot express a bar under one metre, which is the range
 * the raised zoom ceiling puts operators in.
 *
 * Kept out of the `@workspace/utils` barrel and given its own subpath: it
 * imports `react-map-gl` at runtime, and the barrel is reachable from code a
 * Web Worker loads.
 */

/** Largest width, in CSS pixels, the bar may be drawn at. */
const MAX_BAR_WIDTH_PX = 110;

/**
 * Horizontal span, in CSS pixels, measured through the map's projection to
 * derive the resolution. Wide enough that pixel-level projection error is
 * averaged away, short enough that Mercator's own scale variation across it is
 * irrelevant at any zoom these maps reach.
 */
const SAMPLE_PX = 100;

/**
 * Significant digits the resolution is quantised to before it becomes state.
 *
 * MapLibre fires `move` once per animation frame, and latitude alone changes
 * the resolution continuously during a pan. Without quantisation the bar would
 * re-render every frame of every gesture to report a difference no operator
 * can see; with it, a pan across a city re-renders a handful of times.
 */
const RESOLUTION_DIGITS = 3;

/** A map's current resolution and zoom, as the bar reads them. */
interface ScaleView {
	/** Ground metres per CSS pixel, quantised — see {@link RESOLUTION_DIGITS}. */
	metersPerPixel: number;
	/** Current zoom, rounded to one decimal for display. */
	zoom: number;
}

/** Props for {@link MapScaleBar}. */
export interface MapScaleBarProps {
	/**
	 * Placement and any other chrome, applied to the bar's positioned wrapper.
	 * Defaults to the bottom-left corner of the map container.
	 */
	className?: string;
}

/**
 * Read a live map's resolution at the centre of its viewport.
 *
 * Measured through the map's own `unproject` rather than a Mercator formula,
 * so pitch, bearing and any future projection stay honest — the same approach
 * MapLibre's own control takes.
 *
 * @param map - The live MapLibre map.
 * @returns The current view, or `undefined` before the container has a size.
 */
function readScaleView(map: MapLibreMap): ScaleView | undefined {
	const height = map.getContainer().clientHeight;
	if (!height) return undefined;

	const y = height / 2;
	const span = map
		.unproject([0, y])
		.distanceTo(map.unproject([SAMPLE_PX, y]));
	if (!Number.isFinite(span) || span <= 0) return undefined;

	return {
		metersPerPixel: Number(
			(span / SAMPLE_PX).toPrecision(RESOLUTION_DIGITS),
		),
		zoom: Math.round(map.getZoom() * 10) / 10,
	};
}

/**
 * Subscribe to a map's view and report it as an identity-stable snapshot.
 *
 * `useSyncExternalStore` rather than `useState` in an effect: the map is
 * external mutable state, and the web app builds with the React Compiler,
 * which needs the snapshot to be both change-fresh and referentially stable to
 * memoise anything downstream of it.
 *
 * @returns The current view, or `undefined` while the map is unavailable.
 */
function useScaleView(): ScaleView | undefined {
	const { current: map } = useMap();
	const cached = useRef<ScaleView | undefined>(undefined);

	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			if (!map) return () => {};
			const inner = map.getMap();
			inner.on("move", onStoreChange);
			inner.on("resize", onStoreChange);
			return () => {
				inner.off("move", onStoreChange);
				inner.off("resize", onStoreChange);
			};
		},
		[map],
	);

	const getSnapshot = useCallback(() => {
		if (!map) return undefined;
		const next = readScaleView(map.getMap());
		const previous = cached.current;
		// Recomputed and compared on every call: returning a fresh object each
		// time would re-render on every frame of every gesture.
		if (
			previous &&
			next &&
			previous.metersPerPixel === next.metersPerPixel &&
			previous.zoom === next.zoom
		) {
			return previous;
		}
		cached.current = next;
		return next;
	}, [map]);

	return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

/**
 * Metric scale bar with the exact per-pixel resolution and the current zoom.
 *
 * Three facts, because they answer three different questions an operator has
 * at robot scale: the bar answers "how far is that on screen?", the resolution
 * answers "how much finer can this get?", and the zoom is what the basemap's
 * own tile depth is compared against when the imagery goes soft.
 *
 * @param props - Component props.
 * @returns The bar, or `null` until the map reports a usable viewport.
 */
export function MapScaleBar({ className }: MapScaleBarProps) {
	const view = useScaleView();
	const bar = view
		? resolveScaleBar(view.metersPerPixel, MAX_BAR_WIDTH_PX)
		: undefined;

	if (!view || !bar) return null;

	return (
		<div
			className={
				className ??
				"pointer-events-none absolute bottom-2 left-2 z-10 select-none"
			}
		>
			<div className="flex items-end gap-2 rounded-md bg-background/80 px-2 py-1 backdrop-blur-sm">
				<div
					className="flex flex-col items-center gap-1"
					style={{ width: `${bar.widthPx}px` }}
				>
					<span className="text-[11px] leading-none font-medium text-foreground tabular-nums">
						{bar.label}
					</span>
					{/* The bar itself: two end ticks joined by a baseline. */}
					<span className="h-1.5 w-full border-x border-b border-foreground/70" />
				</div>
				<span className="text-[11px] leading-none text-muted-foreground tabular-nums">
					{formatResolution(view.metersPerPixel)} · z
					{view.zoom.toFixed(1)}
				</span>
			</div>
		</div>
	);
}
