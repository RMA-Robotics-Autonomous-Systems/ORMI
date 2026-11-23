"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Layer, Source } from "react-map-gl/maplibre";

import type { SnapIndicator, SnapIndicatorStore } from "./map-snap";

/**
 * Colour of the snap indicator. Meaning against a basemap, so it is fixed in
 * both themes: a magenta that reads on imagery and on the light vector
 * basemap, apart from the selected-vertex orange (`#f59e0b`), terra-draw's
 * blue handles and the risk red. A dark casing under it keeps it legible
 * over pale ground.
 */
export const SNAP_INDICATOR_COLOR = "#d946ef";
/** The casing under the indicator. */
export const SNAP_INDICATOR_CASING = "#1e1b4b";

/** Ring radius (px) around a snapped vertex: clear of a finger-sized handle. */
const VERTEX_RING_RADIUS = 14;
/** Ring radius (px) at the snapped point on an edge. */
const EDGE_RING_RADIUS = 7;

const serverSnapshot = () => null;

/**
 * Where the pointer snaps, while it snaps: a ring around a snapped vertex,
 * or the snapped edge highlighted with a small ring at the point on it.
 *
 * Declarative layers that mount only while a snap is shown, so they are
 * added after terra-draw's and draw over its handles. They never touch the
 * style object. The state comes from a store outside React
 * ({@link SnapIndicatorStore}), so a pointer move re-renders this and
 * nothing else.
 */
export function SnapIndicatorLayer(props: { store: SnapIndicatorStore }) {
	const indicator = useSyncExternalStore(
		props.store.subscribe,
		props.store.get,
		serverSnapshot,
	);
	if (!indicator) return null;
	return <SnapIndicatorShapes indicator={indicator} />;
}

function SnapIndicatorShapes(props: { indicator: SnapIndicator }) {
	const { indicator } = props;
	const data = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: [
				{
					type: "Feature" as const,
					properties: { part: "point", kind: indicator.kind },
					geometry: {
						type: "Point" as const,
						coordinates: indicator.position,
					},
				},
				...(indicator.segment
					? [
							{
								type: "Feature" as const,
								properties: { part: "segment", kind: "edge" },
								geometry: {
									type: "LineString" as const,
									coordinates: indicator.segment,
								},
							},
						]
					: []),
			],
		}),
		[indicator],
	);
	const radius =
		indicator.kind === "vertex" ? VERTEX_RING_RADIUS : EDGE_RING_RADIUS;
	return (
		<Source id="c2-snap-indicator" type="geojson" data={data}>
			<Layer
				id="c2-snap-indicator-segment-casing"
				type="line"
				filter={["==", ["get", "part"], "segment"]}
				layout={{ "line-cap": "round" }}
				paint={{
					"line-color": SNAP_INDICATOR_CASING,
					"line-width": 8,
					"line-opacity": 0.6,
				}}
			/>
			<Layer
				id="c2-snap-indicator-segment"
				type="line"
				filter={["==", ["get", "part"], "segment"]}
				layout={{ "line-cap": "round" }}
				paint={{
					"line-color": SNAP_INDICATOR_COLOR,
					"line-width": 4,
				}}
			/>
			<Layer
				id="c2-snap-indicator-ring-casing"
				type="circle"
				filter={["==", ["get", "part"], "point"]}
				paint={{
					"circle-radius": radius,
					"circle-color": "rgba(0,0,0,0)",
					"circle-stroke-color": SNAP_INDICATOR_CASING,
					"circle-stroke-width": 5,
					"circle-stroke-opacity": 0.6,
				}}
			/>
			<Layer
				id="c2-snap-indicator-ring"
				type="circle"
				filter={["==", ["get", "part"], "point"]}
				paint={{
					"circle-radius": radius,
					"circle-color": "rgba(0,0,0,0)",
					"circle-stroke-color": SNAP_INDICATOR_COLOR,
					"circle-stroke-width": 3,
				}}
			/>
		</Source>
	);
}
