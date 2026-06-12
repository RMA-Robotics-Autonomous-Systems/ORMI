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
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";
import { useEffect, useState } from "react";

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
}

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

	return (
		<LocalDataSourcesProvider
			SelectedTopics={topics}
			buffersSize={BUFFER_SIZE}
		>
			<LoadSinkSummary topics={topics} />
		</LocalDataSourcesProvider>
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
		description:
			"Subscribes to every topic of all enabled load generator datasources to exercise full pipeline fan-out",
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
			],
		},

		data: {
			title: "Load Sink",
			excludeStats: true,
		},
		Component: LoadSinkHost,
	} as WidgetDefinition<LoadSinkProps>;
}
