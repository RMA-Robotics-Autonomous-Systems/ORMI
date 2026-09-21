"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";

import { formatResolution, resolveScaleBar } from "./map-scale";
import {
	formatBearing,
	isFlat,
	isNorthUp,
	normalizeBearing,
} from "./map-orientation";

/**
 * The ORMI map widgets' shared corner chrome: a north indicator and a metric
 * scale bar, in one positioned cluster.
 *
 * They ship together rather than as two absolutely-positioned siblings for a
 * reason that had already bitten once: the standard map draws
 * `UnconfiguredEntriesNotice` at `bottom-2 left-2`, and a scale bar placed
 * there independently sat straight on top of it. One cluster is one placement
 * decision, and a third indicator later inherits it instead of guessing a new
 * corner and a magic offset.
 *
 * Deliberately not MapLibre's built-in `ScaleControl`/`NavigationControl`:
 * `maplibre-gl.css` styles `.maplibregl-ctrl-group` with a hardcoded white
 * background, so both render as a white box on ORMI's dark theme; and see
 * `map-scale.ts` for why the stock scale bar's rounding cannot express a bar
 * under one metre, which is the range the raised zoom ceiling puts operators
 * in.
 *
 * Kept out of the `@workspace/utils` barrel and given its own subpath: it
 * imports `react-map-gl` at runtime, and the barrel is reachable from code a
 * Web Worker loads.
 */

/** Largest width, in CSS pixels, the scale bar may be drawn at. */
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
 * the resolution continuously during a pan. Without quantisation the chrome
 * would re-render every frame of every gesture to report a difference no
 * operator can see; with it, a pan across a city re-renders a handful of times.
 */
const RESOLUTION_DIGITS = 3;

/** Decimal places the bearing and pitch are quantised to. */
const ANGLE_DIGITS = 1;

/** A map's current resolution and orientation, as the chrome reads them. */
interface MapView {
	/** Ground metres per CSS pixel, quantised — see {@link RESOLUTION_DIGITS}. */
	metersPerPixel: number;
	/** Current zoom, rounded to one decimal for display. */
	zoom: number;
	/** Current bearing in `[0, 360)`, rounded to one decimal. */
	bearing: number;
	/** Current pitch in degrees, rounded to one decimal. */
	pitch: number;
}

/** Props for {@link MapChrome}. */
export interface MapChromeProps {
	/**
	 * Placement and any other chrome, applied to the positioned wrapper.
	 * Defaults to the bottom-right corner of the map container — free on both
	 * map widgets, where the top corners carry panels and the bottom-left
	 * carries the standard map's unconfigured-entries notice.
	 */
	className?: string;
}

/**
 * Read a live map's resolution and orientation.
 *
 * Resolution is measured through the map's own `unproject` rather than a
 * Mercator formula, so bearing, pitch and any future projection stay honest —
 * the same approach MapLibre's own control takes. Note the standing limit of
 * any single scale bar: on a pitched map the scale is only exact along the
 * centre line, which is where this samples.
 *
 * @param map - The live MapLibre map.
 * @returns The current view, or `undefined` before the container has a size.
 */
function readMapView(map: MapLibreMap): MapView | undefined {
	const height = map.getContainer().clientHeight;
	if (!height) return undefined;

	const y = height / 2;
	const span = map
		.unproject([0, y])
		.distanceTo(map.unproject([SAMPLE_PX, y]));
	if (!Number.isFinite(span) || span <= 0) return undefined;

	const quantiseAngle = 10 ** ANGLE_DIGITS;
	return {
		metersPerPixel: Number(
			(span / SAMPLE_PX).toPrecision(RESOLUTION_DIGITS),
		),
		zoom: Math.round(map.getZoom() * 10) / 10,
		bearing:
			Math.round(normalizeBearing(map.getBearing()) * quantiseAngle) /
			quantiseAngle,
		pitch: Math.round(map.getPitch() * quantiseAngle) / quantiseAngle,
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
 * One subscription feeds both indicators. `move` covers pan, zoom, rotate and
 * pitch — MapLibre fires it for every camera change — so a second listener for
 * `rotate` would only duplicate work.
 *
 * @returns The current view, or `undefined` while the map is unavailable.
 */
function useMapView(): MapView | undefined {
	const { current: map } = useMap();
	const cached = useRef<MapView | undefined>(undefined);

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
		const next = readMapView(map.getMap());
		const previous = cached.current;
		// Recomputed and compared on every call: returning a fresh object each
		// time would re-render on every frame of every gesture.
		if (
			previous &&
			next &&
			previous.metersPerPixel === next.metersPerPixel &&
			previous.zoom === next.zoom &&
			previous.bearing === next.bearing &&
			previous.pitch === next.pitch
		) {
			return previous;
		}
		cached.current = next;
		return next;
	}, [map]);

	return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

/** Props for {@link MapNorthIndicator}. */
interface MapNorthIndicatorProps {
	/** Current bearing in `[0, 360)`. */
	bearing: number;
	/** Current pitch in degrees. */
	pitch: number;
	/** Returns the view to north. */
	onResetNorth: () => void;
}

/**
 * Compass rose showing which way is north, and a click that returns there.
 *
 * Both map widgets enable MapLibre's default `dragRotate`, so a right-drag or
 * a two-finger twist rotates the view — and until now nothing on screen said
 * so and nothing offered the way back. An operator who rotated by accident had
 * to rotate back by hand, against a basemap whose labels stay upright and give
 * no cue.
 *
 * It is always on screen, never only-when-rotated: an indicator that appears
 * on a state change is one the operator has not learnt the position of, and at
 * the moment they need it they are looking for something that was not there a
 * second ago. Facing north it reads as a quiet confirmation; rotated, it takes
 * the accent colour and states the heading in figures, because an arrow gives
 * a direction and only a number gives a bearing.
 *
 * The needle tilts with pitch the way MapLibre's own compass does. A flat
 * needle over a pitched map claims a plan view the map is not showing.
 *
 * Reset is bearing-only (`resetNorth`, not `resetNorthPitch`): the standard
 * map **opens** at `pitch: 45`, so flattening it here would undo the widget's
 * own default view in answer to a request about rotation.
 *
 * @param props - Component props.
 * @returns The compass control.
 */
function MapNorthIndicator({
	bearing,
	pitch,
	onResetNorth,
}: MapNorthIndicatorProps) {
	const northUp = isNorthUp(bearing);
	const flat = isFlat(pitch);
	const heading = formatBearing(bearing);

	return (
		<button
			type="button"
			onClick={onResetNorth}
			// Stated rather than left to the arrow: a rotating glyph is
			// invisible to a screen reader and unreadable at a glance on a
			// wall-mounted console.
			aria-label={
				northUp
					? "Map is facing north"
					: `Map bearing ${heading}. Activate to face north.`
			}
			title={
				northUp
					? "Facing north"
					: `Bearing ${heading} — click to face north`
			}
			className="pointer-events-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/60"
		>
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				aria-hidden="true"
				className={northUp ? "text-muted-foreground" : "text-primary"}
				style={{
					// Rotate opposite the bearing: the needle points at north
					// on the ground, not at the top of the screen. Foreshorten
					// with pitch, as MapLibre's own compass does.
					transform: `rotate(${-bearing}deg) scaleY(${
						flat ? 1 : Math.cos((pitch * Math.PI) / 180)
					})`,
				}}
			>
				{/* North half filled, south half outlined: which end is north
				    has to survive being glanced at upside down. */}
				<path d="M12 2.5 L16 13 L12 11 Z" fill="currentColor" />
				<path
					d="M12 21.5 L8 11 L12 13 Z"
					fill="currentColor"
					opacity="0.35"
				/>
				<path
					d="M12 2.5 L8 11 L12 13 Z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1"
					strokeLinejoin="round"
				/>
				<path
					d="M12 21.5 L16 13 L12 11 Z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1"
					strokeLinejoin="round"
					opacity="0.35"
				/>
			</svg>
			<span
				className={`text-[11px] leading-none font-medium tabular-nums ${
					northUp ? "text-muted-foreground" : "text-primary"
				}`}
			>
				{northUp ? "N" : heading}
			</span>
		</button>
	);
}

/** Props for {@link MapScaleBar}. */
interface MapScaleBarProps {
	/** Ground metres per CSS pixel. */
	metersPerPixel: number;
	/** Current zoom, for display. */
	zoom: number;
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
 * @returns The bar, or `null` when the resolution is not drawable.
 */
function MapScaleBar({ metersPerPixel, zoom }: MapScaleBarProps) {
	const bar = resolveScaleBar(metersPerPixel, MAX_BAR_WIDTH_PX);
	if (!bar) return null;

	return (
		<div className="flex items-end gap-2">
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
				{formatResolution(metersPerPixel)} · z{zoom.toFixed(1)}
			</span>
		</div>
	);
}

/**
 * The map widgets' corner chrome: north indicator plus metric scale bar.
 *
 * Rendered as a child of a react-map-gl `<Map>`, which places it inside the
 * map container.
 *
 * @param props - Component props.
 * @returns The chrome, or `null` until the map reports a usable viewport.
 */
export function MapChrome({ className }: MapChromeProps) {
	const { current: map } = useMap();
	const view = useMapView();

	const resetNorth = useCallback(() => {
		// `resetNorth`, never `resetNorthPitch` — see MapNorthIndicator.
		map?.getMap().resetNorth();
	}, [map]);

	if (!view) return null;

	return (
		<div
			className={
				className ??
				"pointer-events-none absolute right-2 bottom-2 z-10 select-none"
			}
		>
			<div className="flex items-end gap-2 rounded-md bg-background/80 px-2 py-1 backdrop-blur-sm">
				<MapNorthIndicator
					bearing={view.bearing}
					pitch={view.pitch}
					onResetNorth={resetNorth}
				/>
				<MapScaleBar
					metersPerPixel={view.metersPerPixel}
					zoom={view.zoom}
				/>
			</div>
		</div>
	);
}
