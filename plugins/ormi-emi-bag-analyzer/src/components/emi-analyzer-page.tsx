"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Db3ReaderHost } from "../bag-reader/db3-reader-host";
import type {
	BagSummary,
	PlaygroundData,
	PlaygroundLineSeries,
} from "../bag-reader/bag-types";
import { DEFAULT_DETECTION_CONFIG, clusterDetections } from "../algorithms";
import type { DetectionConfig, DetectionRunResult } from "../algorithms";
import { BagUpload } from "./bag-upload";
import { TopicPanel } from "./playground/topic-panel";
import { DetectionPanel } from "./playground/detection-panel";
import { SignalsChart } from "./playground/signals-chart";
import type { DetectionEventGroup } from "./playground/signals-chart";
import { GpsMapAdvanced } from "./playground/gps-map-advanced";
import type { GpsDetectionGroup } from "./playground/gps-map-advanced";
import { TimelineScrubber } from "./playground/timeline-scrubber";
import type { TimelineEvent } from "./playground/timeline-scrubber";

const MAD_COLOR = "#f97316";
const RSD_COLOR = "#a855f7";
const EVENT_COLOR = "#64748b";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function smartDefault(items: { name: string }[], preferred: string[]): string {
	for (const p of preferred) {
		const found = items.find((t) => t.name === p);
		if (found) return found.name;
	}
	return items[0]?.name ?? "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmiAnalyzerPage() {
	const readerRef = useRef<Db3ReaderHost | null>(null);

	// ── Bag loading state ──────────────────────────────────────────────────
	const [summary, setSummary] = useState<BagSummary | null>(null);
	const [data, setData] = useState<PlaygroundData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// ── Topic selection ────────────────────────────────────────────────────
	const [selectedNumeric, setSelectedNumeric] = useState<string[]>([]);
	const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
	const [gpsTopic, setGpsTopic] = useState<string>("/gps/fix");

	// ── Detection ─────────────────────────────────────────────────────────
	const [detectionConfig, setDetectionConfig] = useState<DetectionConfig>(
		DEFAULT_DETECTION_CONFIG,
	);
	const patchDetection = useCallback(
		(patch: Partial<DetectionConfig>) =>
			setDetectionConfig((prev) => ({ ...prev, ...patch })),
		[],
	);

	// ── Time range (ns from bag start) ────────────────────────────────────
	const [timeRange, setTimeRange] = useState<[number, number]>([0, 0]);

	// ── Detection results (computed async in worker) ───────────────────────
	const [detectionResult, setDetectionResult] = useState<{
		mad: DetectionRunResult | null;
		rsd: DetectionRunResult | null;
	}>({ mad: null, rsd: null });

	// ──────────────────────────────────────────────────────────────────────
	// Bag upload handler
	// ──────────────────────────────────────────────────────────────────────
	const handleFileLoaded = useCallback(async (buffer: ArrayBuffer) => {
		setError(null);
		setSummary(null);
		setData(null);

		readerRef.current?.terminate();
		const reader = new Db3ReaderHost();
		readerRef.current = reader;

		try {
			setLoading(true);
			await reader.openBag(buffer);
			const bagSummary = await reader.getSummary();
			setSummary(bagSummary);
			setTimeRange([0, 0]);

			const numericTypes = new Set([
				"std_msgs/msg/Float32",
				"std_msgs/msg/Float64",
				"std_msgs/msg/Int32",
				"std_msgs/msg/Int64",
				"geometry_msgs/msg/Twist",
				"geometry_msgs/msg/Vector3Stamped",
			]);
			const numTopics = bagSummary.topics.filter((t) =>
				numericTypes.has(t.type),
			);
			const navTopics = bagSummary.topics.filter(
				(t) => t.type === "sensor_msgs/msg/NavSatFix",
			);

			// Compute defaults locally — don't rely on state which hasn't updated yet
			const defaultNumeric = numTopics
				.filter((t) => ["/emi/pulse/avg", "/cmd_vel"].includes(t.name))
				.map((t) => t.name);
			const autoNumeric = defaultNumeric.length
				? defaultNumeric
				: numTopics.slice(0, 2).map((t) => t.name);

			const autoEvents = navTopics
				.filter((t) => t.name.toLowerCase().includes("detection"))
				.map((t) => t.name);

			const autoGps = smartDefault(navTopics, ["/gps/fix", "/fix"]);

			const detTopic =
				numTopics.find((t) => t.name === "/emi/pulse/avg")?.name ??
				numTopics[0]?.name ??
				"";

			// Push selections into state for the controls to reflect
			setSelectedNumeric(autoNumeric);
			setSelectedEvents(autoEvents);
			setGpsTopic(autoGps);
			setDetectionConfig((prev) => ({
				...prev,
				detectionTopic: detTopic,
			}));

			// Auto-load immediately using local vars (state updates are async)
			const playground = await reader.readPlayground(
				autoNumeric,
				autoEvents,
				autoGps || null,
			);
			setData(playground);
			setTimeRange([0, playground.duration]);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to open bag");
		} finally {
			setLoading(false);
		}
	}, []);

	// ──────────────────────────────────────────────────────────────────────
	// Load data from worker
	// ──────────────────────────────────────────────────────────────────────
	const handleLoad = useCallback(async () => {
		if (!readerRef.current) return;
		setError(null);
		setLoading(true);
		try {
			const playground = await readerRef.current.readPlayground(
				selectedNumeric,
				selectedEvents,
				gpsTopic || null,
			);
			setData(playground);
			setTimeRange([0, playground.duration]);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to read topics",
			);
		} finally {
			setLoading(false);
		}
	}, [selectedNumeric, selectedEvents, gpsTopic]);

	// ──────────────────────────────────────────────────────────────────────
	// Computed: detection results
	// ──────────────────────────────────────────────────────────────────────
	const detectionSource = useMemo((): PlaygroundLineSeries | undefined => {
		if (!data) return undefined;
		return data.lineSeries.find(
			(s) => s.topic === detectionConfig.detectionTopic,
		);
	}, [data, detectionConfig.detectionTopic]);

	// Debounced detection: runs in the worker 350ms after the last config change
	useEffect(() => {
		if (!readerRef.current || !detectionSource) {
			setDetectionResult({ mad: null, rsd: null });
			return;
		}
		const reader = readerRef.current;
		const pts = detectionSource.points;
		const cfg = detectionConfig;
		let cancelled = false;
		const timer = setTimeout(() => {
			reader.runDetection(pts, cfg).then((res) => {
				if (!cancelled) setDetectionResult(res);
			});
		}, 350);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detectionConfig, detectionSource]);

	const madResult = detectionResult.mad;
	const rsdResult = detectionResult.rsd;

	const gps = data?.gps ?? [];

	const clusteredMad = useMemo(() => {
		if (!madResult) return [];
		return detectionConfig.clustering.enabled
			? clusterDetections(
					madResult.detectedTimestamps,
					gps,
					detectionConfig.clustering,
				)
			: madResult.detectedTimestamps;
	}, [madResult, gps, detectionConfig.clustering]);

	const clusteredRsd = useMemo(() => {
		if (!rsdResult) return [];
		return detectionConfig.clustering.enabled
			? clusterDetections(
					rsdResult.detectedTimestamps,
					gps,
					detectionConfig.clustering,
				)
			: rsdResult.detectedTimestamps;
	}, [rsdResult, gps, detectionConfig.clustering]);

	// ──────────────────────────────────────────────────────────────────────
	// Computed: extra internal series for chart
	// ──────────────────────────────────────────────────────────────────────
	const extraSeries = useMemo((): PlaygroundLineSeries[] => {
		if (!detectionConfig.enabled || !detectionSource) return [];
		const out: PlaygroundLineSeries[] = [];
		const { topic, axisKey } = detectionSource;

		if (madResult && detectionConfig.mad.showInternals) {
			out.push({
				name: "MAD threshold",
				topic,
				axisKey,
				points: madResult.thresholdSeries,
			});
			out.push({
				name: "MAD deviation",
				topic,
				axisKey,
				points: madResult.deviationSeries,
			});
		}
		if (rsdResult && detectionConfig.rsd.showInternals) {
			out.push({
				name: "RSD threshold",
				topic,
				axisKey,
				points: rsdResult.thresholdSeries,
			});
			out.push({
				name: "RSD deviation",
				topic,
				axisKey,
				points: rsdResult.deviationSeries,
			});
		}
		if (
			detectionConfig.showFiltered &&
			detectionConfig.filterType !== "none"
		) {
			const filtered =
				madResult?.filteredSeries ?? rsdResult?.filteredSeries;
			if (filtered) {
				out.push({
					name: `Filtered (${detectionConfig.filterType})`,
					topic,
					axisKey,
					points: filtered,
				});
			}
		}
		return out;
	}, [detectionConfig, detectionSource, madResult, rsdResult]);

	// ──────────────────────────────────────────────────────────────────────
	// Chart + map + timeline derived props
	// ──────────────────────────────────────────────────────────────────────
	const detectionChartEvents = useMemo((): DetectionEventGroup[] => {
		const groups: DetectionEventGroup[] = [];
		if (clusteredMad.length)
			groups.push({
				name: "MAD",
				timestamps: clusteredMad,
				color: MAD_COLOR,
			});
		if (clusteredRsd.length)
			groups.push({
				name: "RSD",
				timestamps: clusteredRsd,
				color: RSD_COLOR,
			});
		return groups;
	}, [clusteredMad, clusteredRsd]);

	const gpsDetectionGroups = useMemo((): GpsDetectionGroup[] => {
		const groups: GpsDetectionGroup[] = [];
		// Bag's own detection event series (e.g. /emi/fix/detection/mad)
		if (data) {
			for (const es of data.eventSeries) {
				if (es.timestamps.length === 0) continue;
				const lc = es.topic.toLowerCase();
				const color = lc.includes("mad")
					? MAD_COLOR
					: lc.includes("rsd")
						? RSD_COLOR
						: EVENT_COLOR;
				groups.push({
					name: es.name,
					timestamps: es.timestamps,
					color,
				});
			}
		}
		// Algorithm-computed detections
		if (clusteredMad.length)
			groups.push({
				name: "MAD (algo)",
				timestamps: clusteredMad,
				color: MAD_COLOR,
			});
		if (clusteredRsd.length)
			groups.push({
				name: "RSD (algo)",
				timestamps: clusteredRsd,
				color: RSD_COLOR,
			});
		return groups;
	}, [data, clusteredMad, clusteredRsd]);

	const timelineEvents = useMemo((): TimelineEvent[] => {
		const evs: TimelineEvent[] = [];
		if (data) {
			for (const es of data.eventSeries) {
				for (const t of es.timestamps)
					evs.push({ t, color: EVENT_COLOR });
			}
		}
		for (const t of clusteredMad) evs.push({ t, color: MAD_COLOR });
		for (const t of clusteredRsd) evs.push({ t, color: RSD_COLOR });
		return evs;
	}, [data, clusteredMad, clusteredRsd]);

	const duration = data?.duration ?? 0;

	// ──────────────────────────────────────────────────────────────────────
	// Render
	// ──────────────────────────────────────────────────────────────────────
	return (
		<div className="container mx-auto mt-6 flex flex-col gap-4 pb-12">
			{/* Header */}
			<div>
				<h1 className="text-2xl font-semibold">EMI Bag Analyzer</h1>
				<p className="text-muted-foreground text-sm">
					Load a ROS2 .db3 bag — everything runs in your browser.
				</p>
			</div>

			{/* Upload */}
			<BagUpload onFileLoaded={handleFileLoaded} loading={loading} />

			{error && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{/* Charts row */}
			{data && (
				<>
					<div className="rounded border p-1">
						<SignalsChart
							lineSeries={data.lineSeries}
							eventSeries={data.eventSeries}
							detectionEvents={detectionChartEvents}
							extraSeries={extraSeries}
							timeRange={timeRange}
							duration={duration}
							onRangeChange={setTimeRange}
						/>
					</div>

					<div className="rounded border p-1">
						<GpsMapAdvanced
							gps={gps}
							valueSeries={
								detectionSource?.points ??
								data.lineSeries[0]?.points
							}
							detectionGroups={gpsDetectionGroups}
						/>
					</div>

					{/* Timeline */}
					<div className="rounded border px-3 py-2">
						<TimelineScrubber
							duration={duration}
							value={timeRange}
							onChange={setTimeRange}
							events={timelineEvents}
						/>
					</div>
				</>
			)}

			{/* Controls row */}
			{summary && (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					{/* Topics */}
					<div className="rounded border p-3">
						<p className="mb-2 text-sm font-semibold">Topics</p>
						<TopicPanel
							topics={summary.topics}
							selectedNumeric={selectedNumeric}
							selectedEvents={selectedEvents}
							gpsTopic={gpsTopic}
							detectionTopic={detectionConfig.detectionTopic}
							onNumericChange={setSelectedNumeric}
							onEventsChange={setSelectedEvents}
							onGpsTopicChange={setGpsTopic}
							onDetectionTopicChange={(t) =>
								patchDetection({ detectionTopic: t })
							}
							onLoad={handleLoad}
							loading={loading}
						/>
					</div>

					{/* Detection + bag info */}
					<div className="rounded border p-3 lg:col-span-2">
						<p className="mb-2 text-sm font-semibold">
							Detection algorithms
						</p>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<DetectionPanel
								config={detectionConfig}
								onChange={patchDetection}
							/>

							{/* Bag info */}
							<div className="flex flex-col gap-2 text-sm">
								<p className="text-xs font-semibold uppercase text-muted-foreground">
									Bag info
								</p>
								<div className="space-y-1 rounded bg-muted/40 p-2 text-xs">
									<p>
										Messages:{" "}
										<span className="font-mono">
											{summary.messageCount}
										</span>
									</p>
									<p>
										Duration:{" "}
										<span className="font-mono">
											{(duration / 1e9).toFixed(1)}s
										</span>
									</p>
								</div>
								<div className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
									{summary.topics.map((t) => (
										<div
											key={t.name}
											className="flex justify-between gap-2"
										>
											<span className="truncate font-mono text-muted-foreground">
												{t.name}
											</span>
											<span className="shrink-0">
												{t.messageCount}
											</span>
										</div>
									))}
								</div>
								{detectionConfig.enabled &&
									(clusteredMad.length > 0 ||
										clusteredRsd.length > 0) && (
										<div className="space-y-1 rounded bg-muted/40 p-2 text-xs">
											{clusteredMad.length > 0 && (
												<p>
													<span
														style={{
															color: MAD_COLOR,
														}}
													>
														●
													</span>{" "}
													MAD:{" "}
													<span className="font-mono">
														{clusteredMad.length}
													</span>{" "}
													events
												</p>
											)}
											{clusteredRsd.length > 0 && (
												<p>
													<span
														style={{
															color: RSD_COLOR,
														}}
													>
														●
													</span>{" "}
													RSD:{" "}
													<span className="font-mono">
														{clusteredRsd.length}
													</span>{" "}
													events
												</p>
											)}
										</div>
									)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
