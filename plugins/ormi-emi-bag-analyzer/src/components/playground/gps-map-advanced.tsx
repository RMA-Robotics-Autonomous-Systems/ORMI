"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import Map, {
	Layer,
	Source,
	Popup,
	type LayerProps,
	type MapRef,
	type MapMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GpsPoint, TimeSeriesPoint } from "../../bag-reader/bag-types";
import { gpsAtTimestamp } from "../../algorithms/clustering";

export interface GpsDetectionGroup {
	name: string;
	timestamps: number[];
	color: string;
	/** True for algorithm-computed detections (triangle), false/absent for bag events (circle) */
	fromAlgo?: boolean;
}

interface GpsMapAdvancedProps {
	gps: GpsPoint[];
	valueSeries?: TimeSeriesPoint[];
	/** Optional filtered series (e.g. lowpass output) to display instead of raw */
	filteredValueSeries?: TimeSeriesPoint[];
	detectionGroups?: GpsDetectionGroup[];
	timeRange?: [number, number];
	/** Map height in pixels. Defaults to 420 */
	height?: number;
	/** Called when the user clicks a heatline or detection point. tsNs is nanoseconds from bag start. */
	onSeek?: (tsNs: number) => void;
}

interface PopupState {
	lng: number;
	lat: number;
	content: React.ReactNode;
}

function interpolateValue(
	series: TimeSeriesPoint[],
	tsNs: number,
): number | null {
	if (series.length === 0) return null;
	if (tsNs <= series[0]!.timestamp) return series[0]!.value;
	if (tsNs >= series[series.length - 1]!.timestamp)
		return series[series.length - 1]!.value;
	let lo = 0;
	let hi = series.length - 1;
	while (lo + 1 < hi) {
		const mid = (lo + hi) >> 1;
		if (series[mid]!.timestamp <= tsNs) lo = mid;
		else hi = mid;
	}
	const a = series[lo]!;
	const b = series[hi]!;
	const t = (tsNs - a.timestamp) / (b.timestamp - a.timestamp);
	return a.value + t * (b.value - a.value);
}

function normalizeValues(values: number[]): number[] {
	let min = Infinity;
	let max = -Infinity;
	for (const v of values) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	if (max === min) return values.map(() => 0.5);
	return values.map((v) => (v - min) / (max - min));
}

const BASE_MAP_STYLE = {
	version: 8,
	sources: {
		"osm-tiles": {
			type: "raster",
			tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
			tileSize: 256,
			attribution: "© OpenStreetMap contributors",
		},
	},
	layers: [{ id: "osm", type: "raster", source: "osm-tiles" }],
} as const;

/** Draws a filled equilateral triangle into an offscreen canvas and returns its ImageData. */
function makeTriangleImage(color: string, size = 28): ImageData {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d")!;
	const pad = 2;
	ctx.fillStyle = color;
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(size / 2, pad); // apex
	ctx.lineTo(size - pad, size - pad); // bottom-right
	ctx.lineTo(pad, size - pad); // bottom-left
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	return ctx.getImageData(0, 0, size, size);
}

export function GpsMapAdvanced({
	gps,
	valueSeries,
	filteredValueSeries,
	detectionGroups = [],
	timeRange,
	height = 420,
	onSeek,
}: GpsMapAdvancedProps) {
	const mapRef = useRef<MapRef>(null);
	const [mapLoaded, setMapLoaded] = useState(false);

	// ── Visibility toggles ────────────────────────────────────────────────────
	const [showTrack, setShowTrack] = useState(true);
	const [showHeatline, setShowHeatline] = useState(true);
	const [useFiltered, setUseFiltered] = useState(false);
	const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

	const toggleGroup = useCallback((name: string) => {
		setHiddenGroups((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	}, []);

	// ── Hover popup ───────────────────────────────────────────────────────────
	const [popup, setPopup] = useState<PopupState | null>(null);
	const [cursor, setCursor] = useState("grab");

	// ── Register triangle sprites whenever algo groups change ─────────────────
	useEffect(() => {
		const map = mapRef.current?.getMap();
		if (!map || !mapLoaded) return;
		for (const g of detectionGroups) {
			if (!g.fromAlgo) continue;
			const imageId = `triangle-${g.color.replace("#", "")}`;
			if (!map.hasImage(imageId)) {
				map.addImage(imageId, makeTriangleImage(g.color), {
					sdf: false,
				});
			}
		}
	}, [detectionGroups, mapLoaded]);

	// ── Fit bounds on data change ─────────────────────────────────────────────
	useEffect(() => {
		if (!mapRef.current || gps.length < 2) return;
		let minLon = Infinity,
			maxLon = -Infinity,
			minLat = Infinity,
			maxLat = -Infinity;
		for (const p of gps) {
			if (p.longitude < minLon) minLon = p.longitude;
			if (p.longitude > maxLon) maxLon = p.longitude;
			if (p.latitude < minLat) minLat = p.latitude;
			if (p.latitude > maxLat) maxLat = p.latitude;
		}
		mapRef.current.fitBounds(
			[
				[minLon, minLat],
				[maxLon, maxLat],
			],
			{ padding: 40, duration: 400 },
		);
	}, [gps]);

	// ── GeoJSON ───────────────────────────────────────────────────────────────
	const trackGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
		if (gps.length < 2) return { type: "FeatureCollection", features: [] };
		return {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					geometry: {
						type: "LineString",
						coordinates: gps.map((p) => [p.longitude, p.latitude]),
					},
					properties: {},
				},
			],
		};
	}, [gps]);

	const heatlineGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
		const activeSeries =
			useFiltered && filteredValueSeries && filteredValueSeries.length > 0
				? filteredValueSeries
				: valueSeries;
		if (!activeSeries || activeSeries.length === 0 || gps.length === 0)
			return { type: "FeatureCollection", features: [] };
		const rawValues = gps.map(
			(p) => interpolateValue(activeSeries, p.timestamp) ?? 0,
		);
		const normalized = normalizeValues(rawValues);
		return {
			type: "FeatureCollection",
			features: gps.map((p, i) => ({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [p.longitude, p.latitude],
				},
				properties: {
					emi_norm: normalized[i],
					emi_value: rawValues[i],
					ts_ns: p.timestamp,
				},
			})),
		};
	}, [gps, valueSeries, filteredValueSeries, useFiltered]);

	const detectionGeoJsons = useMemo(
		() =>
			detectionGroups.map((group) => {
				const features: GeoJSON.Feature[] = [];
				for (const ts of group.timestamps) {
					const pt = gpsAtTimestamp(gps, ts);
					if (pt) {
						features.push({
							type: "Feature",
							geometry: {
								type: "Point",
								coordinates: [pt.longitude, pt.latitude],
							},
							properties: { group: group.name, ts_ns: ts },
						});
					}
				}
				return {
					id: group.name,
					color: group.color,
					fromAlgo: group.fromAlgo ?? false,
					geojson: { type: "FeatureCollection" as const, features },
				};
			}),
		[gps, detectionGroups],
	);

	// ── Interactive layer IDs for hover ───────────────────────────────────────
	const interactiveLayerIds = useMemo(() => {
		const ids: string[] = [];
		if (showHeatline && heatlineGeoJson.features.length > 0)
			ids.push("gps-heatline");
		for (const d of detectionGeoJsons) {
			if (!hiddenGroups.has(d.id)) ids.push(`detection-layer-${d.id}`);
		}
		return ids;
	}, [
		showHeatline,
		heatlineGeoJson.features.length,
		detectionGeoJsons,
		hiddenGroups,
	]);

	// ── Mouse handlers ────────────────────────────────────────────────────────
	const handleMouseMove = useCallback((e: MapMouseEvent) => {
		const features = e.features;
		if (!features || features.length === 0) {
			setPopup(null);
			setCursor("grab");
			return;
		}
		setCursor("pointer");
		const f = features[0]!;
		const props = f.properties ?? {};
		const coords = (f.geometry as GeoJSON.Point).coordinates;
		let content: React.ReactNode;
		if (f.layer.id === "gps-heatline") {
			content = (
				<div style={{ fontSize: 12, lineHeight: 1.6 }}>
					<div>
						<b>EMI</b> {Number(props.emi_value).toFixed(4)}
					</div>
					<div>
						<b>t</b> {(Number(props.ts_ns) / 1e9).toFixed(2)} s
					</div>
				</div>
			);
		} else {
			content = (
				<div style={{ fontSize: 12, lineHeight: 1.6 }}>
					<div>
						<b>{String(props.group)}</b>
					</div>
					<div>
						<b>t</b> {(Number(props.ts_ns) / 1e9).toFixed(2)} s
					</div>
				</div>
			);
		}
		setPopup({
			lng: coords[0] as number,
			lat: coords[1] as number,
			content,
		});
	}, []);

	const handleMouseLeave = useCallback(() => {
		setPopup(null);
		setCursor("grab");
	}, []);

	const handleClick = useCallback(
		(e: MapMouseEvent) => {
			if (!onSeek) return;
			const features = e.features;
			if (!features || features.length === 0) return;
			const f = features[0]!;
			const tsNs = Number((f.properties ?? {}).ts_ns);
			if (isNaN(tsNs) || tsNs === 0) return;
			onSeek(tsNs);
		},
		[onSeek],
	);

	// ── Layer specs ───────────────────────────────────────────────────────────
	const trackLayer: LayerProps = {
		id: "gps-track",
		type: "line",
		layout: { visibility: showTrack ? "visible" : "none" },
		paint: { "line-color": "rgba(100,100,100,0.3)", "line-width": 1.5 },
	};

	const heatlineLayer: LayerProps = {
		id: "gps-heatline",
		type: "circle",
		layout: {
			visibility: showHeatline ? "visible" : "none",
			// Higher EMI values render on top of lower ones
			"circle-sort-key": ["get", "emi_norm"],
		},
		paint: {
			"circle-radius": 4,
			"circle-color": [
				"interpolate",
				["linear"],
				["get", "emi_norm"],
				0,
				"hsl(0, 90%, 50%)",
				0.2,
				"hsl(60, 90%, 50%)",
				0.4,
				"hsl(120, 90%, 50%)",
				0.6,
				"hsl(180, 90%, 50%)",
				0.8,
				"hsl(240, 90%, 50%)",
				1,
				"hsl(300, 90%, 50%)",
			],
			"circle-opacity": timeRange
				? [
						"case",
						[
							"all",
							[">=", ["get", "ts_ns"], timeRange[0]],
							["<=", ["get", "ts_ns"], timeRange[1]],
						],
						1,
						0.15,
					]
				: 1,
			"circle-stroke-width": 0,
		},
	};

	const hasHeatline = heatlineGeoJson.features.length > 0;

	return (
		<div style={{ width: "100%", height, position: "relative" }}>
			<Map
				ref={mapRef}
				initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }}
				style={{ width: "100%", height: "100%" }}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				mapStyle={BASE_MAP_STYLE as any}
				attributionControl={false}
				onLoad={() => setMapLoaded(true)}
				interactiveLayerIds={interactiveLayerIds}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				onClick={handleClick}
				cursor={cursor}
			>
				{/* Track */}
				<Source id="gps-track" type="geojson" data={trackGeoJson}>
					<Layer {...trackLayer} />
				</Source>

				{/* Heatline */}
				<Source id="gps-heatline" type="geojson" data={heatlineGeoJson}>
					<Layer {...heatlineLayer} />
				</Source>

				{/* Detection groups — circles for bag events, triangles for algo results */}
				{detectionGeoJsons.map(({ id, color, fromAlgo, geojson }) => (
					<Source
						key={id}
						id={`detection-${id}`}
						type="geojson"
						data={geojson}
					>
						{fromAlgo ? (
							<Layer
								id={`detection-layer-${id}`}
								type="symbol"
								layout={{
									visibility: hiddenGroups.has(id)
										? "none"
										: "visible",
									"icon-image": `triangle-${color.replace("#", "")}`,
									"icon-size": 0.5,
									"icon-allow-overlap": true,
									"icon-ignore-placement": true,
								}}
								paint={{}}
							/>
						) : (
							<Layer
								id={`detection-layer-${id}`}
								type="circle"
								layout={{
									visibility: hiddenGroups.has(id)
										? "none"
										: "visible",
								}}
								paint={{
									"circle-radius": 6,
									"circle-color": color,
									"circle-stroke-width": 1,
									"circle-stroke-color": "#ffffff",
								}}
							/>
						)}
					</Source>
				))}

				{/* Hover popup */}
				{popup && (
					<Popup
						longitude={popup.lng}
						latitude={popup.lat}
						closeButton={false}
						closeOnClick={false}
						offset={10}
					>
						{popup.content}
					</Popup>
				)}
			</Map>

			{/* Layer toggles panel */}
			<div
				style={{
					position: "absolute",
					top: 8,
					left: 8,
					background: "rgba(255,255,255,0.92)",
					borderRadius: 6,
					padding: "6px 10px",
					fontSize: 12,
					display: "flex",
					flexDirection: "column",
					gap: 4,
					boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
				}}
			>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						cursor: "pointer",
					}}
				>
					<input
						type="checkbox"
						checked={showTrack}
						onChange={(e) => setShowTrack(e.target.checked)}
					/>
					Track
				</label>
				{hasHeatline && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 3,
						}}
					>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								cursor: "pointer",
							}}
						>
							<input
								type="checkbox"
								checked={showHeatline}
								onChange={(e) =>
									setShowHeatline(e.target.checked)
								}
							/>
							EMI heatline
						</label>
						{filteredValueSeries &&
							filteredValueSeries.length > 0 &&
							showHeatline && (
								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										cursor: "pointer",
										paddingLeft: 18,
										fontSize: 11,
									}}
								>
									<input
										type="checkbox"
										checked={useFiltered}
										onChange={(e) =>
											setUseFiltered(e.target.checked)
										}
									/>
									Use filtered
								</label>
							)}
					</div>
				)}
				{detectionGroups.map((g) => (
					<label
						key={g.name}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							cursor: "pointer",
						}}
					>
						<input
							type="checkbox"
							checked={!hiddenGroups.has(g.name)}
							onChange={() => toggleGroup(g.name)}
						/>
						<span
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
							}}
						>
							{g.fromAlgo ? (
								<span
									style={{
										fontSize: 12,
										color: g.color,
										lineHeight: 1,
									}}
								>
									▲
								</span>
							) : (
								<span
									style={{
										width: 10,
										height: 10,
										borderRadius: "50%",
										background: g.color,
										display: "inline-block",
										flexShrink: 0,
									}}
								/>
							)}
							{g.name}
						</span>
					</label>
				))}
			</div>

			{/* EMI legend */}
			{hasHeatline && showHeatline && (
				<div
					style={{
						position: "absolute",
						bottom: 20,
						right: 10,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 4,
						pointerEvents: "none",
					}}
				>
					<span
						style={{
							fontSize: 10,
							color: "#555",
							background: "rgba(255,255,255,0.85)",
							padding: "0 3px",
							borderRadius: 3,
						}}
					>
						high
					</span>
					<div
						style={{
							width: 12,
							height: 80,
							borderRadius: 6,
							background:
								"linear-gradient(to top, hsl(0,90%,50%), hsl(60,90%,50%), hsl(120,90%,50%), hsl(180,90%,50%), hsl(240,90%,50%), hsl(300,90%,50%))",
						}}
					/>
					<span
						style={{
							fontSize: 10,
							color: "#555",
							background: "rgba(255,255,255,0.85)",
							padding: "0 3px",
							borderRadius: 3,
						}}
					>
						low
					</span>
				</div>
			)}
		</div>
	);
}
