"use client";

/**
 * Diagnostics overlay panel — the UI behind Ctrl+Shift+D.
 *
 * Loaded via `next/dynamic` (ssr: false) by `DiagnosticsHost`, so it costs
 * nothing until first opened. Subscribes to the 1 Hz metrics reporter with
 * `useSyncExternalStore`; the report reference changes at most once per
 * second, so this leaf re-renders at most 1 Hz and never propagates renders
 * to the dashboard tree.
 */

import { useRef, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import {
	subscribeMetricsReport,
	getLastMetricsReport,
	type MetricsReport,
} from "@workspace/utils";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";

/** Bytes per mebibyte, for the heap gauge display. */
const BYTES_PER_MB = 1048576;

interface DiagnosticsPanelProps {
	/** Called when the user clicks the close button. */
	onClose: () => void;
}

/** One parsed `wire.<wireKey>.delivered` row plus its matching fanout gauge. */
interface WireRow {
	wireKey: string;
	datasourceId: string;
	topic: string;
	deliveredRate: number | null;
	fanout: number;
	/**
	 * Worker-side produced rate from the matching
	 * `ds.<dsId>.topic.<topic>.produced` counter, or `null` when the
	 * datasource does not report produced counts (non-worker datasources).
	 */
	producedRate: number | null;
	/**
	 * Fraction of produced messages not delivered on this wire
	 * (`1 − delivered/produced`, clamped at 0), or `null` when no produced
	 * rate is available.
	 */
	dropFraction: number | null;
	/**
	 * Per-topic p50 end-to-end latency in ms (publisher `time` → fanout) from
	 * this wire's `wire.<key>.latencyMs` ring, or `null` when the ring has no
	 * samples yet (heavy tier off, or fewer than 32 messages seen).
	 */
	latencyP50: number | null;
	/** Per-topic p95 end-to-end latency in ms, or `null` when unsampled. */
	latencyP95: number | null;
}

/**
 * Parse pipeline rows out of a report: one row per nonzero
 * `wire.<wireKey>.delivered` counter, joined with its `wire.<wireKey>.fanout`
 * gauge. The wire key format is `<dsId>::<topic>` or
 * `<dsId>::<topic>::<property>` (see `topic-key.ts` in `@workspace/utils`).
 */
function parseWireRows(report: MetricsReport): WireRow[] {
	const fanouts = new Map<string, number>();
	const producedRates = new Map<string, number | null>();
	// Per-wire latency rings: `wire.<key>.latencyMs` → percentile stats.
	const latencies = new Map<
		string,
		{ count: number; p50: number; p95: number }
	>();
	for (const ring of report.rings) {
		if (ring.name.startsWith("wire.") && ring.name.endsWith(".latencyMs")) {
			latencies.set(
				ring.name.slice("wire.".length, -".latencyMs".length),
				ring,
			);
		}
	}
	for (const counter of report.counters) {
		if (
			counter.name.startsWith("wire.") &&
			counter.name.endsWith(".fanout")
		) {
			fanouts.set(
				counter.name.slice("wire.".length, -".fanout".length),
				counter.value,
			);
		}
		if (
			counter.name.startsWith("ds.") &&
			counter.name.endsWith(".produced")
		) {
			producedRates.set(counter.name, counter.ratePerSec);
		}
	}

	const rows: WireRow[] = [];
	for (const counter of report.counters) {
		if (
			!counter.name.startsWith("wire.") ||
			!counter.name.endsWith(".delivered") ||
			counter.value === 0
		) {
			continue;
		}
		const wireKey = counter.name.slice(
			"wire.".length,
			-".delivered".length,
		);
		const [datasourceId = "", ...topicParts] = wireKey.split("::");
		// Produced counters are keyed by raw topic (no `::property` suffix).
		const producedName = `ds.${datasourceId}.topic.${topicParts[0] ?? ""}.produced`;
		const producedRate = producedRates.get(producedName) ?? null;
		const deliveredRate = counter.ratePerSec;
		const dropFraction =
			producedRate !== null && producedRate > 0 && deliveredRate !== null
				? Math.max(0, 1 - deliveredRate / producedRate)
				: null;
		const latency = latencies.get(wireKey);
		const sampled = latency !== undefined && latency.count > 0;
		rows.push({
			wireKey,
			datasourceId,
			topic: topicParts.join("::") || wireKey,
			deliveredRate,
			fanout: fanouts.get(wireKey) ?? 0,
			producedRate,
			dropFraction,
			latencyP50: sampled ? latency.p50 : null,
			latencyP95: sampled ? latency.p95 : null,
		});
	}
	return rows;
}

/** Format a rate as `12.3 Hz`, or an em dash when no rate is available yet. */
function formatHz(rate: number | null): string {
	return rate === null ? "—" : `${rate.toFixed(1)} Hz`;
}

/** Render a number with at most 3 decimals, trailing zeros trimmed. */
function formatNumber(value: number, maxDecimals = 3): string {
	return Number(value.toFixed(maxDecimals)).toString();
}

/** Format a latency in ms as `12.3`, or an em dash when unsampled. */
function formatMs(value: number | null): string {
	return value === null ? "—" : value.toFixed(1);
}

const DiagnosticsPanel = ({ onClose }: DiagnosticsPanelProps) => {
	const report = useSyncExternalStore(
		subscribeMetricsReport,
		getLastMetricsReport,
		() => null,
	);

	const panelRef = useRef<HTMLDivElement>(null);
	// Pointer offset from the panel's top-left corner while dragging, or null
	// when idle. Position is written straight to `panelRef.current.style` so a
	// drag never triggers React renders — the panel keeps its 1 Hz cadence.
	const dragOffset = useRef<{ x: number; y: number } | null>(null);

	const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		// Keep the close button (and any future header controls) clickable.
		if ((e.target as HTMLElement).closest("button")) return;
		const panel = panelRef.current;
		if (!panel) return;
		const rect = panel.getBoundingClientRect();
		dragOffset.current = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		};
		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const offset = dragOffset.current;
		const panel = panelRef.current;
		if (!offset || !panel) return;
		const x = Math.min(
			Math.max(0, e.clientX - offset.x),
			Math.max(0, window.innerWidth - panel.offsetWidth),
		);
		const y = Math.min(
			Math.max(0, e.clientY - offset.y),
			Math.max(0, window.innerHeight - panel.offsetHeight),
		);
		panel.style.left = `${x}px`;
		panel.style.top = `${y}px`;
		panel.style.bottom = "auto";
	};

	const onHeaderPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
		if (dragOffset.current === null) return;
		dragOffset.current = null;
		e.currentTarget.releasePointerCapture(e.pointerId);
	};

	const wireRows = report ? parseWireRows(report) : [];
	const decodeMs = report?.rings.find(
		(r) => r.name === "decode.pointcloud2.ms",
	);
	const decodeClouds = report?.counters.find(
		(c) => c.name === "decode.pointcloud2.clouds",
	);
	const longtasks = report?.counters.find((c) => c.name === "app.longtasks");
	const frames = report?.counters.find((c) => c.name === "app.frames");
	const heap = report?.counters.find((c) => c.name === "app.heapBytes");
	const flushTicks = report?.counters.find((c) => c.name === "flush.ticks");
	const flushUpdates = report?.counters.find(
		(c) => c.name === "flush.updates",
	);
	const flushOverwrites = report?.counters.find(
		(c) => c.name === "flush.overwrites",
	);
	const flushTickMs = report?.rings.find((r) => r.name === "flush.tickMs");
	const rpcCalls = report?.counters.find((c) => c.name === "rpc.calls");
	const rpcInflight = report?.counters.find((c) => c.name === "rpc.inflight");
	const rpcRttMs = report?.rings.find((r) => r.name === "rpc.rttMs");

	return (
		<Card
			ref={panelRef}
			className="fixed bottom-4 left-4 z-50 w-[44rem] max-w-[calc(100vw-2rem)] gap-0 py-0 shadow-2xl pointer-events-auto"
		>
			<CardHeader
				className="flex cursor-grab touch-none select-none flex-row items-center justify-between border-b px-4 py-2 active:cursor-grabbing [.border-b]:pb-2"
				onPointerDown={onHeaderPointerDown}
				onPointerMove={onHeaderPointerMove}
				onPointerUp={onHeaderPointerEnd}
				onPointerCancel={onHeaderPointerEnd}
			>
				<CardTitle className="text-sm">Diagnostics</CardTitle>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={onClose}
					aria-label="Close diagnostics"
				>
					<X className="size-4" />
				</Button>
			</CardHeader>
			<CardContent className="max-h-[50vh] overflow-y-auto px-4 py-3 text-xs">
				<p className="mb-3 rounded-md bg-muted/50 px-3 py-2 leading-relaxed text-muted-foreground">
					<span className="font-medium text-foreground">
						When things are bad, look for:
					</span>{" "}
					high <span className="font-mono">Drop</span> on a low-rate
					topic (UI discarding data it should show) · flush drops/s
					rising with tick p95 near 16 ms (main thread saturated) ·
					latency p95 climbing (backlog before widget fan-out) · long
					tasks {">"} 0/min or sagging FPS (the app, not the network,
					is the bottleneck) · RPC in-flight stuck high or heap
					growing steadily (hung worker / leak).
				</p>
				{report === null ? (
					<p className="text-muted-foreground">No data yet…</p>
				) : (
					<div className="flex flex-col gap-3">
						<section>
							<h3 className="mb-1 font-medium text-muted-foreground">
								Pipeline
							</h3>
							{wireRows.length === 0 ? (
								<p className="text-muted-foreground">
									No active wires
								</p>
							) : (
								<Table className="font-mono tabular-nums">
									<TableHeader>
										<TableRow>
											<TableHead className="h-7 px-2">
												Datasource
											</TableHead>
											<TableHead className="h-7 px-2">
												Topic
											</TableHead>
											<TableHead className="h-7 px-2 text-right">
												Delivered
											</TableHead>
											<TableHead className="h-7 px-2 text-right">
												Produced
											</TableHead>
											<TableHead className="h-7 px-2 text-right">
												Fan-out
											</TableHead>
											<TableHead className="h-7 px-2 text-right">
												Lat p50
											</TableHead>
											<TableHead className="h-7 px-2 text-right">
												Lat p95
											</TableHead>
											<TableHead className="h-7 px-2 text-right">
												Drop
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{wireRows.map((row) => (
											<TableRow key={row.wireKey}>
												<TableCell
													className="max-w-36 truncate px-2 py-1 text-muted-foreground"
													title={row.datasourceId}
												>
													{row.datasourceId}
												</TableCell>
												<TableCell
													className="max-w-52 truncate px-2 py-1"
													title={row.wireKey}
												>
													{row.topic}
												</TableCell>
												<TableCell className="px-2 py-1 text-right">
													{formatHz(
														row.deliveredRate,
													)}
												</TableCell>
												<TableCell className="px-2 py-1 text-right">
													{row.producedRate === null
														? "—"
														: formatHz(
																row.producedRate,
															)}
												</TableCell>
												<TableCell className="px-2 py-1 text-right">
													×{formatNumber(row.fanout)}
												</TableCell>
												<TableCell className="px-2 py-1 text-right text-muted-foreground">
													{formatMs(row.latencyP50)}
												</TableCell>
												<TableCell className="px-2 py-1 text-right text-muted-foreground">
													{formatMs(row.latencyP95)}
												</TableCell>
												<TableCell
													className={`px-2 py-1 text-right ${
														row.dropFraction !==
															null &&
														row.dropFraction > 0.05
															? "text-destructive"
															: "text-muted-foreground"
													}`}
												>
													{row.dropFraction === null
														? "—"
														: `${(row.dropFraction * 100).toFixed(0)}%`}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</section>

						{decodeClouds && decodeClouds.value > 0 && (
							<>
								<Separator />
								<section>
									<h3 className="mb-1 font-medium text-muted-foreground">
										Decode
									</h3>
									<div className="flex justify-between font-mono tabular-nums">
										<span>
											{formatHz(
												decodeClouds.ratePerSec ?? null,
											)}{" "}
											<span className="text-muted-foreground">
												PointCloud2 clouds
											</span>
										</span>
									</div>
									{decodeMs && decodeMs.count > 0 && (
										<div className="flex justify-between font-mono tabular-nums">
											<span>
												p50 {decodeMs.p50.toFixed(2)}
											</span>
											<span>
												p95 {decodeMs.p95.toFixed(2)}
											</span>
											<span>
												p99 {decodeMs.p99.toFixed(2)}
											</span>
											<span>
												max {decodeMs.max.toFixed(2)}{" "}
												ms/cloud
											</span>
										</div>
									)}
								</section>
							</>
						)}

						{flushTicks && (
							<>
								<Separator />
								<section>
									<h3 className="mb-1 font-medium text-muted-foreground">
										Flush
									</h3>
									<div className="flex justify-between font-mono tabular-nums">
										<span>
											{formatHz(
												flushTicks.ratePerSec ?? null,
											)}{" "}
											<span className="text-muted-foreground">
												ticks
											</span>
										</span>
										<span>
											{formatHz(
												flushUpdates?.ratePerSec ??
													null,
											)}{" "}
											<span className="text-muted-foreground">
												updates
											</span>
										</span>
										<span
											className={
												(flushOverwrites?.ratePerSec ??
													0) > 0
													? "text-destructive"
													: undefined
											}
										>
											{formatHz(
												flushOverwrites?.ratePerSec ??
													null,
											)}{" "}
											<span className="text-muted-foreground">
												drops
											</span>
										</span>
									</div>
									{flushTickMs && flushTickMs.count > 0 && (
										<div className="flex justify-between font-mono tabular-nums">
											<span>
												p50 {flushTickMs.p50.toFixed(1)}
											</span>
											<span>
												p95 {flushTickMs.p95.toFixed(1)}
											</span>
											<span>
												p99 {flushTickMs.p99.toFixed(1)}
											</span>
											<span>
												max {flushTickMs.max.toFixed(1)}{" "}
												ms
											</span>
										</div>
									)}
								</section>
							</>
						)}

						{rpcCalls && (
							<>
								<Separator />
								<section>
									<h3 className="mb-1 font-medium text-muted-foreground">
										RPC
									</h3>
									<div className="flex justify-between font-mono tabular-nums">
										<span>
											{formatHz(
												rpcCalls.ratePerSec ?? null,
											)}{" "}
											<span className="text-muted-foreground">
												calls
											</span>
										</span>
										<span>
											{formatNumber(
												rpcInflight?.value ?? 0,
											)}{" "}
											<span className="text-muted-foreground">
												in flight
											</span>
										</span>
									</div>
									{rpcRttMs && rpcRttMs.count > 0 && (
										<div className="flex justify-between font-mono tabular-nums">
											<span>
												p50 {rpcRttMs.p50.toFixed(1)}
											</span>
											<span>
												p95 {rpcRttMs.p95.toFixed(1)}
											</span>
											<span>
												p99 {rpcRttMs.p99.toFixed(1)}
											</span>
											<span>
												max {rpcRttMs.max.toFixed(1)} ms
											</span>
										</div>
									)}
								</section>
							</>
						)}

						<Separator />
						<section>
							<h3 className="mb-1 font-medium text-muted-foreground">
								App
							</h3>
							<div className="flex justify-between font-mono tabular-nums">
								<span>
									{longtasks?.ratePerSec === null ||
									longtasks?.ratePerSec === undefined
										? "—"
										: (longtasks.ratePerSec * 60).toFixed(
												0,
											)}{" "}
									<span className="text-muted-foreground">
										long tasks/min
									</span>
								</span>
								<span>
									{frames?.ratePerSec === null ||
									frames?.ratePerSec === undefined
										? "—"
										: frames.ratePerSec.toFixed(0)}{" "}
									<span className="text-muted-foreground">
										FPS
									</span>
								</span>
								<span>
									{!heap || heap.value === 0
										? "n/a"
										: (heap.value / BYTES_PER_MB).toFixed(
												1,
											)}{" "}
									<span className="text-muted-foreground">
										MB heap
									</span>
								</span>
							</div>
						</section>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default DiagnosticsPanel;
