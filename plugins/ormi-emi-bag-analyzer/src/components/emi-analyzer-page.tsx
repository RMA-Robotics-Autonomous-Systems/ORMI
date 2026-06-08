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
import {
	DEFAULT_DETECTION_CONFIG,
	clusterDetections,
	runAutoLabel,
} from "../algorithms";
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
import { LabelingChart } from "./playground/labeling-chart";
import type { ConfidencePoint } from "./playground/labeling-chart";
import { BaselineSketchDialog } from "./playground/baseline-sketch-dialog";
import type { DrawnBaselinePoint } from "../algorithms";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Spinner } from "@workspace/ui/components/spinner";
import { ScrollArea } from "@workspace/ui/components/scroll-area";

const MAD_COLOR = "#f97316";
const RSD_COLOR = "#a855f7";
const CUSUM_COLOR = "#22c55e";
const EVENT_COLOR = "#64748b";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Linearly interpolate the confidence curve (sorted ConfidencePoint[]) at a
 * given timestamp in nanoseconds. Clamps to the nearest endpoint outside range.
 */
function lerpConfidence(pts: ConfidencePoint[], tsNs: number): number {
	if (pts.length === 0) return 0;
	if (pts.length === 1) return pts[0]!.confidence;
	if (tsNs <= pts[0]!.tsNs) return pts[0]!.confidence;
	if (tsNs >= pts[pts.length - 1]!.tsNs)
		return pts[pts.length - 1]!.confidence;
	let lo = 0;
	let hi = pts.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (pts[mid]!.tsNs <= tsNs) lo = mid;
		else hi = mid;
	}
	const a = pts[lo]!;
	const b = pts[hi]!;
	const t = (tsNs - a.tsNs) / (b.tsNs - a.tsNs);
	return a.confidence + t * (b.confidence - a.confidence);
}

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
		cusum: DetectionRunResult | null;
	}>({ mad: null, rsd: null, cusum: null });

	const [detectionStatus, setDetectionStatus] = useState<
		"idle" | "computing" | "done"
	>("idle");

	// ──────────────────────────────────────────────────────────────────────
	// Bag upload handler
	// ──────────────────────────────────────────────────────────────────────
	const handleFileLoaded = useCallback(async (buffer: ArrayBuffer) => {
		setError(null);
		setSummary(null);
		setData(null);
		setSketchHandles([]);

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
			setDetectionResult({ mad: null, rsd: null, cusum: null });
			setDetectionStatus("idle");
			return;
		}
		const reader = readerRef.current;
		const pts = detectionSource.points;
		const cfg = detectionConfig;
		let cancelled = false;
		setDetectionStatus("idle");
		const timer = setTimeout(() => {
			if (cancelled) return;
			setDetectionStatus("computing");
			reader.runDetection(pts, cfg).then((res) => {
				if (!cancelled) {
					setDetectionResult(res);
					setDetectionStatus("done");
				}
			});
		}, 350);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [detectionConfig, detectionSource]);

	const madResult = detectionResult.mad;
	const rsdResult = detectionResult.rsd;
	const cusumResult = detectionResult.cusum;

	const gps = useMemo(() => data?.gps ?? [], [data]);

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

	const clusteredCusum = useMemo(() => {
		if (!cusumResult) return [];
		return detectionConfig.clustering.enabled
			? clusterDetections(
					cusumResult.detectedTimestamps,
					gps,
					detectionConfig.clustering,
				)
			: cusumResult.detectedTimestamps;
	}, [cusumResult, gps, detectionConfig.clustering]);

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
		if (cusumResult && detectionConfig.cusum.showInternals) {
			out.push({
				name: "CUSUM threshold",
				topic,
				axisKey,
				points: cusumResult.thresholdSeries,
			});
			out.push({
				name: "CUSUM accumulator",
				topic,
				axisKey,
				points: cusumResult.deviationSeries,
			});
		}
		if (
			detectionConfig.showFiltered &&
			detectionConfig.filterType !== "none"
		) {
			const filtered =
				madResult?.filteredSeries ??
				rsdResult?.filteredSeries ??
				cusumResult?.filteredSeries;
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
	}, [detectionConfig, detectionSource, madResult, rsdResult, cusumResult]);

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
		if (clusteredCusum.length)
			groups.push({
				name: "CUSUM",
				timestamps: clusteredCusum,
				color: CUSUM_COLOR,
			});
		return groups;
	}, [clusteredMad, clusteredRsd, clusteredCusum]);

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
						: lc.includes("cusum")
							? CUSUM_COLOR
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
				fromAlgo: true,
			});
		if (clusteredRsd.length)
			groups.push({
				name: "RSD (algo)",
				timestamps: clusteredRsd,
				color: RSD_COLOR,
				fromAlgo: true,
			});
		if (clusteredCusum.length)
			groups.push({
				name: "CUSUM (algo)",
				timestamps: clusteredCusum,
				color: CUSUM_COLOR,
				fromAlgo: true,
			});
		return groups;
	}, [data, clusteredMad, clusteredRsd, clusteredCusum]);

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
		for (const t of clusteredCusum) evs.push({ t, color: CUSUM_COLOR });
		return evs;
	}, [data, clusteredMad, clusteredRsd, clusteredCusum]);

	const duration = data?.duration ?? 0;

	// ── Confidence labels ─────────────────────────────────────────────────
	const [confidencePoints, setConfidencePoints] = useState<ConfidencePoint[]>(
		[],
	);

	// Seed two default endpoints (first/last timestamp) whenever a new bag loads
	useEffect(() => {
		const pts = detectionSource?.points ?? data?.lineSeries[0]?.points;
		if (!pts || pts.length === 0) {
			setConfidencePoints([]);
			return;
		}
		const first = pts[0]!.timestamp;
		const last = pts[pts.length - 1]!.timestamp;
		setConfidencePoints([
			{
				id: Math.random().toString(36).slice(2, 10),
				tsNs: first,
				confidence: 0,
			},
			{
				id: Math.random().toString(36).slice(2, 10),
				tsNs: last,
				confidence: 0,
			},
		]);
	}, [data]); // eslint-disable-line react-hooks/exhaustive-deps

	const [sketchOpen, setSketchOpen] = useState(false);
	const [sketchSeries, setSketchSeries] = useState<
		typeof data extends null
			? never
			: NonNullable<typeof data>["lineSeries"][0]["points"]
	>([]);
	const [sketchHandles, setSketchHandles] = useState<DrawnBaselinePoint[]>(
		[],
	);

	/**
	 * For each active algorithm, classify each detection as TP (confidence ≥ 0.5
	 * at that timestamp) or FP (confidence < 0.5). Also compute the fraction of
	 * bag duration covered by the labeled region (confidence ≥ 0.5).
	 */
	const detectionQuality = useMemo(() => {
		const CONF_THRESHOLD = 0.5;
		const sorted = [...confidencePoints].sort((a, b) => a.tsNs - b.tsNs);
		const hasLabels = sorted.length >= 2;

		const classify = (timestamps: number[]) => {
			let tp = 0;
			for (const tsNs of timestamps) {
				if (lerpConfidence(sorted, tsNs) >= CONF_THRESHOLD) tp++;
			}
			return { total: timestamps.length, tp, fp: timestamps.length - tp };
		};

		// Approximate labeled-region coverage: integrate segments where conf ≥ 0.5
		let labeledNs = 0;
		if (hasLabels) {
			for (let i = 0; i < sorted.length - 1; i++) {
				const a = sorted[i]!;
				const b = sorted[i + 1]!;
				const segLen = b.tsNs - a.tsNs;
				if (
					a.confidence >= CONF_THRESHOLD &&
					b.confidence >= CONF_THRESHOLD
				) {
					labeledNs += segLen;
				} else if (
					a.confidence >= CONF_THRESHOLD ||
					b.confidence >= CONF_THRESHOLD
				) {
					const crossT =
						(CONF_THRESHOLD - a.confidence) /
						(b.confidence - a.confidence);
					labeledNs +=
						segLen *
						(a.confidence < CONF_THRESHOLD ? 1 - crossT : crossT);
				}
			}
		}
		const totalNs =
			sorted.length >= 2
				? sorted[sorted.length - 1]!.tsNs - sorted[0]!.tsNs
				: 0;
		const labelCoverage = totalNs > 0 ? labeledNs / totalNs : 0;

		return {
			hasLabels,
			labelCoverage,
			mad: detectionConfig.mad.enabled ? classify(clusteredMad) : null,
			rsd: detectionConfig.rsd.enabled ? classify(clusteredRsd) : null,
			cusum: detectionConfig.cusum.enabled
				? classify(clusteredCusum)
				: null,
		};
	}, [
		confidencePoints,
		clusteredMad,
		clusteredRsd,
		clusteredCusum,
		detectionConfig,
	]);

	const handleAutoLabel = useCallback(() => {
		const pts = detectionSource?.points ?? data?.lineSeries[0]?.points;
		if (!pts || pts.length === 0) return;
		setSketchSeries(pts);
		setSketchOpen(true);
	}, [detectionSource, data]);

	const handleSketchConfirm = useCallback(
		(baseline: DrawnBaselinePoint[]) => {
			setSketchOpen(false);
			setSketchHandles(baseline);
			if (sketchSeries.length === 0) return;
			const raw = runAutoLabel(sketchSeries, { drawnBaseline: baseline });
			setConfidencePoints(
				raw.map((p) => ({
					id: Math.random().toString(36).slice(2, 10),
					tsNs: p.tsNs,
					confidence: p.confidence,
				})),
			);
		},
		[sketchSeries],
	);

	const handleSeedFromDetections = useCallback(() => {
		const mkPt = (tsNs: number): ConfidencePoint => ({
			id: Math.random().toString(36).slice(2, 10),
			tsNs,
			confidence: 1.0,
		});
		const detectionPts = [
			...clusteredMad,
			...clusteredRsd,
			...clusteredCusum,
		]
			.filter((t, i, arr) => arr.indexOf(t) === i) // deduplicate
			.map(mkPt);
		const endpoints: ConfidencePoint[] = [
			{
				id: Math.random().toString(36).slice(2, 10),
				tsNs: 0,
				confidence: 0,
			},
			{
				id: Math.random().toString(36).slice(2, 10),
				tsNs: duration,
				confidence: 0,
			},
		];
		setConfidencePoints([...endpoints, ...detectionPts]);
	}, [clusteredMad, clusteredRsd, clusteredCusum, duration]);

	const handleMapSeek = useCallback(
		(tsNs: number) => {
			const window = 10_000_000_000; // ±10 s in nanoseconds
			setTimeRange([
				Math.max(0, tsNs - window),
				Math.min(duration, tsNs + window),
			]);
		},
		[duration],
	);

	// ──────────────────────────────────────────────────────────────────────
	// Render
	// ──────────────────────────────────────────────────────────────────────
	return (
		<div className="flex w-full flex-col gap-3 px-4 pt-4 pb-12">
			{/* Header */}
			<div className="shrink-0">
				<h1 className="text-2xl font-semibold">EMI Bag Analyzer</h1>
				<p className="text-muted-foreground text-sm">
					Load a ROS2 .db3 bag — everything runs in your browser.
				</p>
			</div>

			{/* Upload */}
			<div className="shrink-0">
				<BagUpload onFileLoaded={handleFileLoaded} loading={loading} />
			</div>

			{error && (
				<Alert variant="destructive" className="shrink-0">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Two-column layout — shown once a bag is opened */}
			{summary && (
				<div className="grid grid-cols-3 items-start gap-4">
					{/* ── Left 1/3: settings ─────────────────────────────── */}
					<div className="col-span-1 flex flex-col gap-3">
						{/* 1. Detection algorithms */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center gap-2">
									<CardTitle className="text-sm">
										Detection algorithms
									</CardTitle>
									{detectionStatus === "computing" && (
										<Badge
											variant="secondary"
											className="gap-1"
										>
											<Spinner className="size-3" />
											Computing…
										</Badge>
									)}
									{detectionStatus === "done" && (
										<Badge variant="outline">Done</Badge>
									)}
								</div>
							</CardHeader>
							<CardContent>
								<DetectionPanel
									config={detectionConfig}
									onChange={patchDetection}
								/>
							</CardContent>
						</Card>

						{/* 2. Statistics */}
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
									Statistics
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
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
								{detectionConfig.enabled &&
									(clusteredMad.length > 0 ||
										clusteredRsd.length > 0 ||
										clusteredCusum.length > 0) && (
										<div className="mt-2 space-y-1 rounded bg-muted/40 p-2 text-xs">
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
											{clusteredCusum.length > 0 && (
												<p>
													<span
														style={{
															color: CUSUM_COLOR,
														}}
													>
														●
													</span>{" "}
													CUSUM:{" "}
													<span className="font-mono">
														{clusteredCusum.length}
													</span>{" "}
													events
												</p>
											)}
										</div>
									)}
								{detectionQuality.hasLabels &&
									detectionConfig.enabled && (
										<div className="mt-2 space-y-1 rounded bg-muted/40 p-2 text-xs">
											<p className="mb-1 font-medium text-muted-foreground">
												vs. confidence labels
											</p>
											<p>
												Labeled region:{" "}
												<span className="font-mono">
													{(
														detectionQuality.labelCoverage *
														100
													).toFixed(1)}
													%
												</span>{" "}
												of bag
											</p>
											{detectionQuality.mad && (
												<>
													<p
														className="mt-1 font-medium"
														style={{
															color: MAD_COLOR,
														}}
													>
														MAD
													</p>
													<p className="pl-2">
														TP:{" "}
														<span className="font-mono text-green-600 dark:text-green-400">
															{
																detectionQuality
																	.mad.tp
															}
														</span>
														{" / FP: "}
														<span className="font-mono text-destructive">
															{
																detectionQuality
																	.mad.fp
															}
														</span>
														{" / Total: "}
														<span className="font-mono">
															{
																detectionQuality
																	.mad.total
															}
														</span>
													</p>
												</>
											)}
											{detectionQuality.rsd && (
												<>
													<p
														className="mt-1 font-medium"
														style={{
															color: RSD_COLOR,
														}}
													>
														RSD
													</p>
													<p className="pl-2">
														TP:{" "}
														<span className="font-mono text-green-600 dark:text-green-400">
															{
																detectionQuality
																	.rsd.tp
															}
														</span>
														{" / FP: "}
														<span className="font-mono text-destructive">
															{
																detectionQuality
																	.rsd.fp
															}
														</span>
														{" / Total: "}
														<span className="font-mono">
															{
																detectionQuality
																	.rsd.total
															}
														</span>
													</p>
												</>
											)}
											{detectionQuality.cusum && (
												<>
													<p
														className="mt-1 font-medium"
														style={{
															color: CUSUM_COLOR,
														}}
													>
														CUSUM
													</p>
													<p className="pl-2">
														TP:{" "}
														<span className="font-mono text-green-600 dark:text-green-400">
															{
																detectionQuality
																	.cusum.tp
															}
														</span>
														{" / FP: "}
														<span className="font-mono text-destructive">
															{
																detectionQuality
																	.cusum.fp
															}
														</span>
														{" / Total: "}
														<span className="font-mono">
															{
																detectionQuality
																	.cusum.total
															}
														</span>
													</p>
												</>
											)}
										</div>
									)}
								<ScrollArea className="mt-2 max-h-48">
									<div className="space-y-0.5 text-xs">
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
								</ScrollArea>
							</CardContent>
						</Card>

						{/* 3. Topics */}
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm">
									Topics
								</CardTitle>
							</CardHeader>
							<CardContent>
								<TopicPanel
									topics={summary.topics}
									selectedNumeric={selectedNumeric}
									selectedEvents={selectedEvents}
									gpsTopic={gpsTopic}
									detectionTopic={
										detectionConfig.detectionTopic
									}
									onNumericChange={setSelectedNumeric}
									onEventsChange={setSelectedEvents}
									onGpsTopicChange={setGpsTopic}
									onDetectionTopicChange={(t) =>
										patchDetection({ detectionTopic: t })
									}
									onLoad={handleLoad}
									loading={loading}
								/>
							</CardContent>
						</Card>
					</div>

					{/* ── Right 2/3: visualisation ───────────────────────── */}
					<div className="col-span-2 flex flex-col gap-2">
						{data ? (
							<>
								{/* Signal plot — 1/3 height */}
								<Card>
									<CardContent className="p-1">
										<SignalsChart
											lineSeries={data.lineSeries}
											eventSeries={data.eventSeries}
											detectionEvents={
												detectionChartEvents
											}
											extraSeries={extraSeries}
											timeRange={timeRange}
											duration={duration}
											onRangeChange={setTimeRange}
											height={300}
										/>
									</CardContent>
								</Card>

								{/* Confidence labeling — full width row below both columns */}
								{data && (
									<Card>
										<CardContent className="p-3">
											<LabelingChart
												series={
													detectionSource?.points ??
													data.lineSeries[0]
														?.points ??
													[]
												}
												filteredSeries={
													madResult?.filteredSeries ??
													rsdResult?.filteredSeries ??
													cusumResult?.filteredSeries
												}
												duration={duration}
												timeRange={timeRange}
												controlPoints={confidencePoints}
												onChange={setConfidencePoints}
												extraCsvSeries={[
													...data.lineSeries
														.filter(
															(s) =>
																s.name ===
																	"/cmd_vel linear.x" ||
																s.name ===
																	"/cmd_vel angular.z",
														)
														.map((s) => ({
															label:
																s.name ===
																"/cmd_vel linear.x"
																	? "cmd_vel_linear_x"
																	: "cmd_vel_angular_z",
															points: s.points,
														})),
													...(data.gps.length > 0
														? [
																{
																	label: "gps_latitude",
																	points: data.gps.map(
																		(
																			p,
																		) => ({
																			timestamp:
																				p.timestamp,
																			value: p.latitude,
																		}),
																	),
																},
																{
																	label: "gps_longitude",
																	points: data.gps.map(
																		(
																			p,
																		) => ({
																			timestamp:
																				p.timestamp,
																			value: p.longitude,
																		}),
																	),
																},
															]
														: []),
												]}
												onSeedFromDetections={
													handleSeedFromDetections
												}
												onAutoLabel={handleAutoLabel}
												sketchSeries={sketchHandles}
												height={200}
											/>
										</CardContent>
									</Card>
								)}

								<BaselineSketchDialog
									open={sketchOpen}
									series={sketchSeries}
									initialHandles={sketchHandles}
									onConfirm={handleSketchConfirm}
									onCancel={() => setSketchOpen(false)}
								/>
								{/* Timeline scrubber — top */}
								<Card>
									<CardContent className="px-3 py-2">
										<TimelineScrubber
											duration={duration}
											value={timeRange}
											onChange={setTimeRange}
											events={timelineEvents}
										/>
									</CardContent>
								</Card>

								{/* Map — 2/3 height */}
								<Card>
									<CardContent className="p-1">
										<GpsMapAdvanced
											gps={gps}
											valueSeries={
												detectionSource?.points ??
												data.lineSeries[0]?.points
											}
											filteredValueSeries={
												madResult?.filteredSeries ??
												rsdResult?.filteredSeries ??
												cusumResult?.filteredSeries
											}
											detectionGroups={gpsDetectionGroups}
											timeRange={timeRange}
											height={600}
											onSeek={handleMapSeek}
										/>
									</CardContent>
								</Card>
							</>
						) : (
							<div className="flex h-64 items-center justify-center rounded border text-sm text-muted-foreground">
								Select topics and press Load to view data.
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
