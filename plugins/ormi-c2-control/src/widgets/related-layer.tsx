"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";

import type { C2Feature } from "../types/c2-types";
import { readFeatureId } from "./feature-geojson";
import { GROUP_OUTLINE_CASING, GROUP_OUTLINE_COLOR } from "./map-group-card";

/**
 * Features related to what is selected in another panel (the assets the
 * node editor's selected nodes target), outlined DASHED: a highlight, never
 * a pick. Nothing here is selected, deletable or flown to.
 *
 * Fixed colours, as the group outline: it must read against the basemap,
 * which is not the app theme.
 */
export function RelatedSelectionLayer(props: {
	features: readonly C2Feature[];
}) {
	const data = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: props.features
				.filter((f) => f.geometry && f.geometry.coordinates != null)
				.map((f) => ({
					type: "Feature" as const,
					properties: { feature_id: readFeatureId(f) ?? "" },
					geometry: {
						type: f.geometry?.type,
						coordinates: f.geometry?.coordinates,
					} as never,
				})),
		}),
		[props.features],
	);
	return (
		<Source id="c2-related-selection" type="geojson" data={data}>
			<Layer
				id="c2-related-selection-casing"
				type="line"
				filter={["!=", ["geometry-type"], "Point"]}
				paint={{ "line-color": GROUP_OUTLINE_CASING, "line-width": 5 }}
			/>
			<Layer
				id="c2-related-selection-line"
				type="line"
				filter={["!=", ["geometry-type"], "Point"]}
				paint={{
					"line-color": GROUP_OUTLINE_COLOR,
					"line-width": 3,
					"line-dasharray": [2, 1.5],
				}}
			/>
			<Layer
				id="c2-related-selection-circle"
				type="circle"
				filter={["==", ["geometry-type"], "Point"]}
				paint={{
					"circle-radius": 12,
					"circle-color": "rgba(0,0,0,0)",
					"circle-stroke-color": GROUP_OUTLINE_COLOR,
					"circle-stroke-width": 2,
				}}
			/>
		</Source>
	);
}
