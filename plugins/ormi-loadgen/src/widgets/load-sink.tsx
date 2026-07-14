"use client";

import {
	Datasource,
	DatasourceHealth,
	DatasourceTopic,
	LocalDataSourcesProvider,
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import {
	PluginsHooks,
	usePluginsManager,
	type PluginsManager,
} from "@workspace/ormi-plugins";
import {
	metrics,
	subscribeMetricsReport,
	type MetricsReport,
} from "@workspace/utils";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LoadgenSettings } from "../index";
import { resolveGenerators } from "../presets";

/** Datasource definition id this widget binds to. */
export const LOADGEN_DATASOURCE_ID = "loadgen-source";

/** Widget definition id, referenced by the datasource gating filter. */
export const LOAD_SINK_WIDGET_ID = "loadgen-load-sink";

/** Built-in loadgen self-report topic, skipped when `excludeStats` is on. */
const STATS_TOPIC = "/loadgen/stats";

/** Topic list refresh period; matches the topics-list widget poll cadence. */
const TOPIC_POLL_MS = 2000;

/** Maximum number of per-topic rows rendered; the rest is summarized. */
const MAX_VISIBLE_ROWS = 20;

/** Per-topic buffer depth — enough samples to estimate a delivery rate. */
const BUFFER_SIZE = 10;

/** Settings for the LoadSink widget. */
interface LoadSinkProps extends Record<string, unknown> {
	title: string;
	/** Skip the 1 Hz `/loadgen/stats` self-report topic (default true). */
	excludeStats: boolean;
	/**
	 * Benchmark summary scope: `"loadgen"` aggregates only wire rows belonging
	 * to loadgen datasources; `"all"` aggregates every wire row. Default
	 * `"loadgen"`.
	 */
	scope?: "loadgen" | "all";
}

/** Selectable benchmark window durations, in seconds. */
const DURATION_OPTIONS = [5, 10, 30, 60] as const;

/** Default benchmark window duration, in seconds. */
const DEFAULT_DURATION_SEC = 10;

/** Compact per-generator summary embedded in an exported benchmark. */
interface GeneratorSummary {
	topicPrefix: string;
	topicCount: number;
	type: string;
	rateHz: number;
	payloadBytes: number;
}

/** Derived summary block of an exported benchmark. */
interface BenchmarkSummary {
	producedPerSec: number;
	deliveredPerSec: number;
	dropPct: number;
	latP50: number | null;
	latP95: number | null;
	decodePc2P95Ms: number | null;
	flushOverwritesPerSec: number | null;
	longtasksPerSec: number | null;
}

/** Full exported benchmark document. */
interface BenchmarkExport {
	preset: string | null;
	generators: GeneratorSummary[] | null;
	startedAt: number;
	durationMs: number;
	env: { userAgent: string; note: string };
	summary: BenchmarkSummary;
	ticks: MetricsReport[];
}

/**
 * Prod-vs-dev caveat embedded in every export: dev builds and open DevTools
 * dominate main-thread traces, so a benchmark is only meaningful on a
 * production build.
 */
const ENV_NOTE =
	"Metrics reflect the build that produced them; judge performance on a production build, not a dev build with DevTools open.";

/**
 * Average of a numeric list, or `null` when empty. Keeps the summary honest —
 * an unsampled metric reports `null` rather than a misleading `0`.
 */
const averageOrNull = (values: number[]): number | null =>
	values.length === 0
		? null
		: values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Aggregate a captured window of 1 Hz reports into a single summary.
 *
 * Rates (`*.PerSec`) are averaged across the ticks that carried a non-null
 * `ratePerSec` (the first tick after the reporter loop starts has none). Ring
 * percentiles (latency, decode) are **averaged** across every captured tick
 * and matching ring — a stable central estimate over the window rather than a
 * single worst-tick spike. `dropPct` is derived from the aggregate produced
 * and delivered rates.
 *
 * @param ticks - Raw reports captured during the window.
 * @param loadgenIds - Instance ids of the enabled loadgen datasources.
 * @param scope - `"loadgen"` restricts wire/produced rows to loadgen
 *   datasources; `"all"` includes every datasource.
 */
function summarizeTicks(
	ticks: MetricsReport[],
	loadgenIds: Set<string>,
	scope: "loadgen" | "all",
): BenchmarkSummary {
	const belongs = (dsId: string) => scope === "all" || loadgenIds.has(dsId);

	const deliveredRates: number[] = [];
	const producedRates: number[] = [];
	const latP50s: number[] = [];
	const latP95s: number[] = [];
	const decodeP95s: number[] = [];
	const flushRates: number[] = [];
	const longtaskRates: number[] = [];

	for (const report of ticks) {
		let tickDelivered = 0;
		let hasDelivered = false;
		let tickProduced = 0;
		let hasProduced = false;

		for (const counter of report.counters) {
			if (
				counter.name.startsWith("wire.") &&
				counter.name.endsWith(".delivered") &&
				counter.value !== 0
			) {
				const key = counter.name.slice(
					"wire.".length,
					-".delivered".length,
				);
				const dsId = key.split("::")[0] ?? "";
				if (belongs(dsId) && counter.ratePerSec !== null) {
					tickDelivered += counter.ratePerSec;
					hasDelivered = true;
				}
			} else if (
				counter.name.startsWith("ds.") &&
				counter.name.endsWith(".produced")
			) {
				const dsId = counter.name
					.slice("ds.".length)
					.split(".topic.")[0]!;
				if (belongs(dsId) && counter.ratePerSec !== null) {
					tickProduced += counter.ratePerSec;
					hasProduced = true;
				}
			} else if (
				counter.name === "flush.overwrites" &&
				counter.ratePerSec !== null
			) {
				flushRates.push(counter.ratePerSec);
			} else if (
				counter.name === "app.longtasks" &&
				counter.ratePerSec !== null
			) {
				longtaskRates.push(counter.ratePerSec);
			}
		}

		for (const ring of report.rings) {
			if (ring.count === 0) continue;
			if (
				ring.name.startsWith("wire.") &&
				ring.name.endsWith(".latencyMs")
			) {
				const key = ring.name.slice(
					"wire.".length,
					-".latencyMs".length,
				);
				const dsId = key.split("::")[0] ?? "";
				if (belongs(dsId)) {
					latP50s.push(ring.p50);
					latP95s.push(ring.p95);
				}
			} else if (ring.name === "decode.pointcloud2.ms") {
				decodeP95s.push(ring.p95);
			}
		}

		if (hasDelivered) deliveredRates.push(tickDelivered);
		if (hasProduced) producedRates.push(tickProduced);
	}

	const producedPerSec = averageOrNull(producedRates) ?? 0;
	const deliveredPerSec = averageOrNull(deliveredRates) ?? 0;
	const dropPct =
		producedPerSec > 0
			? Math.max(0, 1 - deliveredPerSec / producedPerSec) * 100
			: 0;

	return {
		producedPerSec,
		deliveredPerSec,
		dropPct,
		latP50: averageOrNull(latP50s),
		latP95: averageOrNull(latP95s),
		decodePc2P95Ms: averageOrNull(decodeP95s),
		flushOverwritesPerSec: averageOrNull(flushRates),
		longtasksPerSec: averageOrNull(longtaskRates),
	};
}

/** Snapshot of the enabled loadgen datasources at benchmark start. */
interface LoadgenSnapshot {
	/** Instance ids of every enabled loadgen datasource. */
	ids: Set<string>;
	/** Active preset of the first enabled loadgen datasource, or `null`. */
	preset: string | null;
	/** Resolved generator summary of the first enabled loadgen datasource. */
	generators: GeneratorSummary[] | null;
}

/**
 * Read the enabled loadgen datasources from the plugins manager and resolve
 * the primary one's preset + generator mix. Called once at benchmark start so
 * the export reflects the config that was actually under test.
 */
function snapshotLoadgen(pluginsManager: PluginsManager): LoadgenSnapshot {
	const datasources = pluginsManager.applyFilter<Datasource[]>(
		PluginsHooks.AVAILABLE_DATASOURCES,
		[],
	);
	const loadgen = datasources.filter(
		(datasource) =>
			datasource.datasource_id === LOADGEN_DATASOURCE_ID &&
			datasource.settings.enable,
	);
	const ids = new Set(loadgen.map((datasource) => datasource.settings.id));

	const primary = loadgen[0]?.settings as LoadgenSettings | undefined;
	const preset = primary?.preset ?? null;
	const generators = primary
		? resolveGenerators(primary).map(
				(generator): GeneratorSummary => ({
					topicPrefix: generator.topicPrefix,
					topicCount: generator.topicCount,
					type: generator.type,
					rateHz: generator.rateHz,
					payloadBytes: generator.payloadBytes,
				}),
			)
		: null;

	return { ids, preset, generators };
}

/** Format an elapsed millisecond count as `mm:ss`. */
const formatClock = (ms: number): string => {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSec / 60);
	const seconds = totalSec % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

/**
 * Timed benchmark recorder. Flips the heavy metrics tier on for the window
 * (required for latency/decode rings to populate), captures every 1 Hz report,
 * then restores the prior heavy state and downloads a JSON summary.
 *
 * All recording state lives in refs so an unmount mid-window can restore the
 * heavy tier and unsubscribe without depending on a stale closure — the heavy
 * tier must never be left stuck on.
 */
const BenchmarkRecorder: React.FC<{ scope: "loadgen" | "all" }> = ({
	scope,
}) => {
	const pluginsManager = usePluginsManager();
	const [recording, setRecording] = useState(false);
	const [durationSec, setDurationSec] =
		useState<number>(DEFAULT_DURATION_SEC);
	const [elapsedMs, setElapsedMs] = useState(0);

	// Recording state kept in refs so teardown never reads a stale closure.
	const recordingRef = useRef(false);
	const ticksRef = useRef<MetricsReport[]>([]);
	const unsubscribeRef = useRef<(() => void) | null>(null);
	const priorHeavyRef = useRef(false);
	const startedAtRef = useRef(0);
	const durationRef = useRef(DEFAULT_DURATION_SEC);
	const snapshotRef = useRef<LoadgenSnapshot | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scopeRef = useRef(scope);
	// Mirror the latest scope into a ref so a teardown/download (which runs from
	// a stable callback) reads the current value without re-binding.
	useEffect(() => {
		scopeRef.current = scope;
	}, [scope]);

	/**
	 * Tear down a recording: unsubscribe, restore the heavy tier, clear the
	 * timer. Idempotent. When `download` is true (timer elapsed or manual
	 * stop) it also builds and downloads the export; on unmount it is false.
	 */
	const stopRecording = useCallback((download: boolean) => {
		if (!recordingRef.current) return;
		recordingRef.current = false;

		unsubscribeRef.current?.();
		unsubscribeRef.current = null;
		metrics.heavy = priorHeavyRef.current;
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setRecording(false);

		if (!download) return;

		const snapshot = snapshotRef.current;
		const startedAt = startedAtRef.current;
		const durationMs = durationRef.current * 1000;
		const ticks = ticksRef.current;

		const summary = summarizeTicks(
			ticks,
			snapshot?.ids ?? new Set<string>(),
			scopeRef.current,
		);

		const preset = snapshot?.preset ?? null;
		const doc: BenchmarkExport = {
			preset,
			generators: snapshot?.generators ?? null,
			startedAt,
			durationMs,
			env: { userAgent: navigator.userAgent, note: ENV_NOTE },
			summary,
			ticks,
		};

		// Blob + anchor download (no shared helper; mirrors emi-bag-analyzer).
		const json = JSON.stringify(doc, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `loadgen-${preset ?? "benchmark"}-${startedAt}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}, []);

	const startRecording = useCallback(() => {
		if (recordingRef.current) return;

		const startedAt = Date.now();
		snapshotRef.current = snapshotLoadgen(pluginsManager);
		ticksRef.current = [];
		startedAtRef.current = startedAt;
		durationRef.current = durationSec;
		priorHeavyRef.current = metrics.heavy;
		metrics.heavy = true;
		recordingRef.current = true;

		setElapsedMs(0);
		setRecording(true);

		unsubscribeRef.current = subscribeMetricsReport((report) => {
			ticksRef.current.push(report);
			setElapsedMs(Date.now() - startedAt);
		});

		timerRef.current = setTimeout(
			() => stopRecording(true),
			durationSec * 1000,
		);
	}, [pluginsManager, durationSec, stopRecording]);

	// Unmount safety: restore heavy tier + unsubscribe, never download.
	useEffect(() => {
		return () => stopRecording(false);
	}, [stopRecording]);

	return (
		<div className="flex flex-wrap items-center gap-2 border-b p-2 text-xs font-mono shrink-0">
			<span className="font-semibold">benchmark</span>
			<select
				className="rounded border bg-transparent px-1 py-0.5 disabled:opacity-50"
				value={durationSec}
				disabled={recording}
				onChange={(event) => setDurationSec(Number(event.target.value))}
				aria-label="Benchmark duration"
			>
				{DURATION_OPTIONS.map((seconds) => (
					<option key={seconds} value={seconds}>
						{seconds}s
					</option>
				))}
			</select>
			<button
				type="button"
				className="rounded border px-2 py-0.5 hover:bg-muted"
				onClick={() =>
					recording ? stopRecording(true) : startRecording()
				}
			>
				{recording ? "Stop" : "Start"}
			</button>
			{recording && (
				<span className="text-red-500">
					● REC {formatClock(elapsedMs)}
				</span>
			)}
		</div>
	);
};

/** Indicator dot color per topic health state. */
const HEALTH_DOT_CLASS: Record<DatasourceHealth, string> = {
	online: "bg-emerald-500",
	connecting: "bg-amber-500",
	offline: "bg-red-500",
};

/** Format a last-message age in ms as a short human-readable string. */
const formatAge = (ageMs: number): string => {
	if (ageMs < 1000) return `${Math.max(0, Math.round(ageMs))}ms`;
	if (ageMs < 60_000) return `${(ageMs / 1000).toFixed(1)}s`;
	return `${Math.floor(ageMs / 60_000)}m`;
};

/**
 * Sink body: compact aggregate summary plus a capped per-topic row list.
 * Re-renders are driven by the provider's buffer pump (and a 1 Hz tick so
 * ages stay live when traffic stalls); each render does O(topics) work and
 * holds no per-message state of its own.
 */
function LoadSinkSummary({ topics }: { topics: SelectedTopic[] }) {
	const { getSource, getTopicHealth } = useLocalDataSource();

	// 1 Hz tick: keeps last-message ages and offline rows fresh even when no
	// buffer updates arrive (exactly the moment an operator needs to see it).
	const [, setTick] = useState(0);
	useEffect(() => {
		const intervalId = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(intervalId);
	}, []);

	const now = Date.now();
	let totalBuffered = 0;
	let aggregateRate = 0;
	let offlineCount = 0;

	const rows = topics.map((topic) => {
		const source = getSource(topic);
		const health = getTopicHealth(topic);
		if (health === "offline") offlineCount++;

		const times = source?.times ?? [];
		totalBuffered += source?.data.length ?? 0;

		// Delivered-to-widget rate from buffered timestamp deltas. This is an
		// estimate bounded by the provider's pump frequency, not the raw wire
		// rate (the produced rate lives on /loadgen/stats).
		if (times.length >= 2) {
			const spanMs = times[times.length - 1]! - times[0]!;
			if (spanMs > 0) {
				aggregateRate += ((times.length - 1) * 1000) / spanMs;
			}
		}

		const lastTime = times.length > 0 ? times[times.length - 1] : undefined;

		return {
			key: `${topic.source.id}::${topic.topic}`,
			name: topic.topic,
			health,
			lastTime,
		};
	});

	if (topics.length === 0) {
		return (
			<div className="h-full flex items-center justify-center text-sm text-muted-foreground p-3">
				Waiting for load generator topics…
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col text-xs font-mono p-2 gap-2">
			<div className="flex flex-wrap gap-x-4 gap-y-1 shrink-0">
				<span>
					topics:{" "}
					<span className="font-semibold">{topics.length}</span>
					{offlineCount > 0 && (
						<span className="text-red-500">
							{" "}
							({offlineCount} offline)
						</span>
					)}
				</span>
				<span>
					buffered:{" "}
					<span className="font-semibold">{totalBuffered}</span>
				</span>
				<span>
					≈{" "}
					<span className="font-semibold">
						{Math.round(aggregateRate)}
					</span>{" "}
					msg/s
				</span>
			</div>
			<div className="flex-1 overflow-auto min-h-0">
				{rows.slice(0, MAX_VISIBLE_ROWS).map((row) => (
					<div
						key={row.key}
						className="flex items-center gap-2 py-0.5"
					>
						<span
							className={`inline-block w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT_CLASS[row.health]}`}
						/>
						<span className="truncate flex-1">{row.name}</span>
						<span className="text-muted-foreground shrink-0">
							{row.health !== "online"
								? row.health
								: row.lastTime !== undefined
									? formatAge(now - row.lastTime)
									: "—"}
						</span>
					</div>
				))}
				{rows.length > MAX_VISIBLE_ROWS && (
					<div className="text-muted-foreground py-0.5">
						+{rows.length - MAX_VISIBLE_ROWS} more topics
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Load Sink widget host: discovers every topic of every enabled loadgen
 * datasource and subscribes to all of them at once, exercising the full
 * pipeline fan-out without adding one widget per topic.
 *
 * Topic discovery polls the `AVAILABLE_TOPICS` filter (same mechanism as the
 * topic-selection dialog and topics-list widget) and keeps the
 * `SelectedTopics` array identity stable unless the topic set actually
 * changed, so the provider does not resubscribe on every poll.
 */
const LoadSinkHost: React.FC<LoadSinkProps> = (props) => {
	const pluginsManager = usePluginsManager();
	const [topics, setTopics] = useState<SelectedTopic[]>([]);
	const excludeStats = props.excludeStats !== false;

	useEffect(() => {
		let cancelled = false;

		const refreshTopics = async () => {
			// Instance ids of every enabled loadgen datasource.
			const datasources = pluginsManager.applyFilter<Datasource[]>(
				PluginsHooks.AVAILABLE_DATASOURCES,
				[],
			);
			const loadgenIds = new Set(
				datasources
					.filter(
						(datasource) =>
							datasource.datasource_id ===
								LOADGEN_DATASOURCE_ID &&
							datasource.settings.enable,
					)
					.map((datasource) => datasource.settings.id),
			);

			let next: SelectedTopic[] = [];
			if (loadgenIds.size > 0) {
				const available = await pluginsManager.applyFilterAsync<
					DatasourceTopic[]
				>(PluginsHooks.AVAILABLE_TOPICS, []);
				if (cancelled) return;

				next = available
					.filter(
						(topic) =>
							loadgenIds.has(topic.source.id) &&
							(!excludeStats || topic.topic !== STATS_TOPIC),
					)
					.map((topic) => ({ ...topic, property: "" }));
			}

			if (cancelled) return;

			// Preserve array identity unless the set changed — the local
			// provider resubscribes everything when SelectedTopics changes.
			setTopics((prev) => {
				const unchanged =
					prev.length === next.length &&
					prev.every(
						(topic, index) =>
							topic.source.id === next[index]!.source.id &&
							topic.topic === next[index]!.topic,
					);
				return unchanged ? prev : next;
			});
		};

		refreshTopics();
		const intervalId = setInterval(refreshTopics, TOPIC_POLL_MS);

		return () => {
			cancelled = true;
			clearInterval(intervalId);
		};
	}, [pluginsManager, excludeStats]);

	const scope = props.scope === "all" ? "all" : "loadgen";

	return (
		<div className="h-full flex flex-col min-h-0">
			<BenchmarkRecorder scope={scope} />
			<div className="flex-1 min-h-0">
				<LocalDataSourcesProvider
					SelectedTopics={topics}
					buffersSize={BUFFER_SIZE}
				>
					<LoadSinkSummary topics={topics} />
				</LocalDataSourcesProvider>
			</div>
		</div>
	);
};

/**
 * Widget definition for the Load Sink.
 * @returns Widget definition.
 */
export function LoadSinkDefinition(): WidgetDefinition<LoadSinkProps> {
	return {
		id: LOAD_SINK_WIDGET_ID,
		name: "Load Sink",
		description: "Subscribe to all loadgen topics",
		titleProp: "title",
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				excludeStats: {
					type: "boolean",
					title: "Exclude /loadgen/stats",
				},
				scope: {
					type: "string",
					title: "Benchmark scope",
					enum: ["loadgen", "all"],
					default: "loadgen",
				},
			},
			required: ["title"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				},
				{
					type: "Control",
					scope: "#/properties/excludeStats",
				},
				{
					type: "Control",
					scope: "#/properties/scope",
				},
			],
		},

		data: {
			title: "Load Sink",
			excludeStats: true,
			scope: "loadgen",
		},
		Component: LoadSinkHost,
	} as WidgetDefinition<LoadSinkProps>;
}
