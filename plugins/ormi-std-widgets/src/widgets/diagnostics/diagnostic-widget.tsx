"use client";

import {
	DatasourceHealth,
	DatasourceProviderSettings,
	LocalDataSourcesProvider,
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { DiagnosticArray, DiagnosticStatus } from "@workspace/ormi-core/types";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Input } from "@workspace/ui/components/input";
import { Activity } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { levelLabel, levelRank, levelVariant } from "./diagnostic-enums";
import { useDiscoveredTopics } from "../shared/use-discovered-topics";

/** Webapp type tag applied by the converter to DiagnosticArray topics. */
const DIAGNOSTIC_WEBAPP_TYPE = "DiagnosticArray";

/** Raw ROS type, used as a fallback discovery predicate. */
const DIAGNOSTIC_ROS_TYPE = "diagnostic_msgs/msg/DiagnosticArray";

/** Effective level applied to a status whose node has gone silent. */
const STALE_LEVEL = 3;

/** How often the staleness clock ticks, in ms (re-render for dead nodes). */
const STALENESS_TICK_MS = 1000;

/** Default seconds without a fresh message before a status is treated STALE. */
const DEFAULT_STALE_SECONDS = 5;

/** Settings for the Diagnostics widget. */
interface DiagnosticsWidgetProps extends Record<string, unknown> {
	title: string;
	/** Whether OK-level entries are shown by default (default false). */
	showOk: boolean;
	/**
	 * Seconds without a fresh message before a latched status is treated as
	 * STALE (level 3). A shared `/diagnostics` topic carries low-Hz and bursty
	 * publishers, so entries are latched and aged out rather than snapshotted.
	 */
	staleTimeout: number;
}

/**
 * One latched diagnostic status, keyed by `(source, hardwareId, name)`. The
 * widget accumulates the newest status per key across every buffered message
 * (not just the latest sample), so low-Hz / bursty publishers on a shared
 * `/diagnostics` topic never vanish. `lastUpdate` is the wall-clock time the
 * status was last refreshed, used to age silent nodes to STALE.
 */
interface DiagnosticLatchEntry {
	/** Unique key: `${source.id}::${status.hardwareId}::${status.name}`. */
	key: string;
	status: DiagnosticStatus;
	source: DatasourceProviderSettings;
	topic: SelectedTopic;
	/** `Date.now()` of the last message that refreshed this status. */
	lastUpdate: number;
}

/**
 * A latched entry resolved for the current render: its effective level (STALE
 * when aged out) and its live datasource health (recomputed fresh, never
 * latched, so an offline source dims the row without blanking the widget).
 */
interface ResolvedEntry {
	entry: DiagnosticLatchEntry;
	/** Effective level: `STALE_LEVEL` when stale, else the reported level. */
	level: number;
	health: DatasourceHealth;
}

/** A group of entries sharing a hardware id (or falling back to source title). */
interface DiagnosticGroup {
	id: string;
	label: string;
	entries: ResolvedEntry[];
	/** Highest {@link levelRank} across the group's entries. */
	worstRank: number;
	/** Level owning the worst rank, for the group badge. */
	worstLevel: number;
}

/** Last slash-delimited path segment of a status name, for a compact label. */
const shortName = (name: string): string => {
	const trimmed = name.replace(/\/+$/, "");
	const idx = trimmed.lastIndexOf("/");
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed || name;
};

/** Small colored count pill used in the summary bar. */
function SummaryPill({
	label,
	count,
	variant,
}: {
	label: string;
	count: number;
	variant: "success" | "warning" | "destructive" | "secondary";
}) {
	return (
		<Badge variant={variant} className="tabular-nums">
			{count} {label}
		</Badge>
	);
}

/**
 * One diagnostic row: severity badge, short name (full name on hover), message,
 * a muted source tag, and an expandable key/value table. Offline rows dim but
 * keep their last-known data (per-topic gating — the widget never blanks).
 */
function DiagnosticStatusRow({
	resolved,
	expanded,
	onToggle,
}: {
	resolved: ResolvedEntry;
	expanded: boolean;
	onToggle: () => void;
}) {
	const { entry, level, health } = resolved;
	const { status, source } = entry;
	const offline = health === "offline";
	const values = status.values ?? [];

	return (
		<div
			className={`flex flex-col gap-1 rounded-md border bg-card px-2 py-1.5 text-card-foreground ${
				offline ? "opacity-50" : ""
			}`}
		>
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center gap-2 text-left"
			>
				<Badge variant={levelVariant(level)} className="shrink-0">
					{levelLabel(level)}
				</Badge>
				<span
					className="min-w-0 flex-1 truncate text-sm font-medium"
					title={status.name}
				>
					{shortName(status.name)}
				</span>
				{status.message && (
					<span className="hidden min-w-0 max-w-[45%] truncate text-xs text-muted-foreground sm:block">
						{status.message}
					</span>
				)}
				<span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
					{source.title || source.id}
				</span>
				<span className="shrink-0 text-[11px] text-muted-foreground">
					{expanded ? "▾" : "▸"}
				</span>
			</button>

			{/* The full message is always kept accessible on small widths. */}
			{status.message && (
				<span className="truncate text-xs text-muted-foreground sm:hidden">
					{status.message}
				</span>
			)}

			{expanded && (
				<div className="border-t pt-1">
					{values.length === 0 ? (
						<span className="text-xs text-muted-foreground">
							No values
						</span>
					) : (
						<table className="w-full text-xs">
							<tbody>
								{values.map((kv, index) => (
									<tr
										key={`${kv.key}-${index}`}
										className="align-top"
									>
										<td className="w-1/3 py-0.5 pr-2 font-medium text-muted-foreground break-all">
											{kv.key}
										</td>
										<td className="py-0.5 tabular-nums break-all">
											{kv.value}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Diagnostics body: latches the newest status per `(source, hardwareId, name)`
 * across EVERY buffered message (not just the latest sample) so low-Hz / bursty
 * publishers on a shared `/diagnostics` topic never vanish, ages silent nodes to
 * STALE, then renders a summary bar, search + "Show OK" controls, and a
 * hardware-grouped list (worst severity first).
 *
 * The latch is component `useState` (compiler-tracked), fed by an effect keyed
 * on the provider's per-flush `sources` map. Health is recomputed fresh each
 * render via `getTopicHealth` (never latched), so an offline source dims rows
 * without blanking the widget — reads stay direct, never memoized on a version
 * counter, per the React-Compiler + external-store rule.
 */
function DiagnosticsBody({
	topics,
	defaultShowOk,
	staleMs,
}: {
	topics: SelectedTopic[];
	defaultShowOk: boolean;
	staleMs: number;
}) {
	const { sources, getSourceId, getTopicHealth } = useLocalDataSource();
	const [search, setSearch] = useState("");
	const [showOk, setShowOk] = useState(defaultShowOk);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() => new Set(),
	);

	// Latched statuses keyed by `(source, hardwareId, name)`. Compiler-tracked
	// component state (never a module-level store), so derived reads below stay
	// fresh without keying a memo on a version counter.
	const [store, setStore] = useState<Map<string, DiagnosticLatchEntry>>(
		() => new Map(),
	);

	// Last message object already folded into the latch, per topic key. Used to
	// resume from the first unprocessed message in the buffer on the next flush.
	const lastSeenRef = useRef<Map<string, DiagnosticArray>>(new Map());

	// Ticks ~1 Hz so staleness is re-evaluated even when no messages arrive (a
	// dead node produces none). The value is unused — the state update alone
	// forces the re-render that recomputes each entry's effective level.
	const [, setStalenessTick] = useState(0);
	useEffect(() => {
		const id = setInterval(
			() => setStalenessTick((tick) => tick + 1),
			STALENESS_TICK_MS,
		);
		return () => clearInterval(id);
	}, []);

	// Fold every NEW buffered message into the latch on each provider flush.
	// Depends on the per-flush `sources` map identity (read directly here, so
	// the compiler cannot drop it as a dead read) plus the topic set. For each
	// topic, read its FULL buffer and process only messages after the last one
	// already folded in; upsert each status, then prune entries/refs for topics
	// whose datasource is gone. `setStore` returns the previous map unchanged
	// when nothing moved, so this never loops.
	useEffect(() => {
		const now = Date.now();
		const upserts: DiagnosticLatchEntry[] = [];
		const currentTopicKeys = new Set(
			topics.map((t) => `${t.source.id}::${t.topic}`),
		);

		for (const topic of topics) {
			const topicKey = `${topic.source.id}::${topic.topic}`;
			const buffer = sources.get(getSourceId(topic))?.data as
				| DiagnosticArray[]
				| undefined;
			if (!buffer || buffer.length === 0) continue;

			// Resume after the last-folded message; if it aged out of the
			// buffer (not found), fold the whole buffer.
			const lastSeen = lastSeenRef.current.get(topicKey);
			const seenIdx =
				lastSeen !== undefined ? buffer.lastIndexOf(lastSeen) : -1;
			for (let i = seenIdx + 1; i < buffer.length; i++) {
				const array = buffer[i];
				if (!array) continue;
				for (const status of array.status ?? []) {
					// Include hardwareId so sibling statuses that share a name
					// but describe different hardware are not merged away.
					const key = `${topic.source.id}::${status.hardwareId}::${status.name}`;
					upserts.push({
						key,
						status,
						source: topic.source,
						topic,
						lastUpdate: now,
					});
				}
			}
			lastSeenRef.current.set(topicKey, buffer[buffer.length - 1]!);
		}

		// Drop last-seen refs for topics that are gone.
		for (const topicKey of Array.from(lastSeenRef.current.keys())) {
			if (!currentTopicKeys.has(topicKey)) {
				lastSeenRef.current.delete(topicKey);
			}
		}

		setStore((prev) => {
			let next = prev;
			const clone = () => {
				if (next === prev) next = new Map(prev);
				return next;
			};
			for (const entry of upserts) clone().set(entry.key, entry);
			// Prune latched entries whose topic is no longer subscribed (covers a
			// removed datasource and a single removed topic).
			for (const [key, entry] of prev) {
				const entryTopicKey = `${entry.source.id}::${entry.topic.topic}`;
				if (!currentTopicKeys.has(entryTopicKey)) clone().delete(key);
			}
			return next;
		});
	}, [sources, getSourceId, topics]);

	// Resolve each latched entry for this render: effective level (STALE when
	// aged out) and fresh datasource health (never latched).
	const now = Date.now();
	const resolved: ResolvedEntry[] = Array.from(store.values()).map(
		(entry) => {
			const isStale = now - entry.lastUpdate > staleMs;
			return {
				entry,
				level: isStale ? STALE_LEVEL : entry.status.level,
				health: getTopicHealth(entry.topic),
			};
		},
	);

	// Summary counts across all entries (OK / Warn / Error / Stale), using the
	// effective (staleness-aware) level.
	const counts = [0, 0, 0, 0];
	for (const item of resolved) {
		// Fold any out-of-range level into Stale so the pills always sum to the
		// number of rendered rows.
		const bucket = item.level >= 0 && item.level <= 3 ? item.level : 3;
		counts[bucket]!++;
	}

	// Apply the search filter and the "Show OK" toggle. STALE/WARN/ERROR are
	// always shown; only OK (effective level 0) is hidden when the toggle is
	// off — a stale entry is level 3, so it stays visible.
	const query = search.trim().toLowerCase();
	const visible = resolved.filter((item) => {
		if (!showOk && item.level === 0) return false;
		if (!query) return true;
		const { name, message, hardwareId } = item.entry.status;
		return (
			name.toLowerCase().includes(query) ||
			message.toLowerCase().includes(query) ||
			hardwareId.toLowerCase().includes(query)
		);
	});

	// Group by hardware id (fallback to the source title when empty).
	const groupMap = new Map<string, DiagnosticGroup>();
	for (const item of visible) {
		const { entry, level } = item;
		const label = entry.status.hardwareId || entry.source.title || "—";
		const id = `${entry.source.id}::${label}`;
		let group = groupMap.get(id);
		if (!group) {
			group = {
				id,
				label,
				entries: [],
				worstRank: -1,
				worstLevel: 0,
			};
			groupMap.set(id, group);
		}
		group.entries.push(item);
		const rank = levelRank(level);
		if (rank > group.worstRank) {
			group.worstRank = rank;
			group.worstLevel = level;
		}
	}

	const groups = Array.from(groupMap.values());
	// Groups: worst severity first. Within a group: worst rows first.
	groups.sort(
		(a, b) => b.worstRank - a.worstRank || a.label.localeCompare(b.label),
	);
	for (const group of groups) {
		group.entries.sort((a, b) => levelRank(b.level) - levelRank(a.level));
	}

	const toggleExpanded = (key: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	return (
		<div className="flex h-full flex-col gap-2 p-2">
			{/* Summary bar */}
			<div className="flex flex-wrap items-center gap-1.5 shrink-0">
				<SummaryPill label="OK" count={counts[0]!} variant="success" />
				<SummaryPill
					label="Warn"
					count={counts[1]!}
					variant="warning"
				/>
				<SummaryPill
					label="Error"
					count={counts[2]!}
					variant="destructive"
				/>
				<SummaryPill
					label="Stale"
					count={counts[3]!}
					variant="secondary"
				/>
			</div>

			{/* Controls */}
			<div className="flex items-center gap-2 shrink-0">
				<Input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search name, message, hardware…"
					className="h-8 flex-1"
				/>
				<label className="flex items-center gap-1 text-xs text-muted-foreground select-none">
					<input
						type="checkbox"
						checked={showOk}
						onChange={(event) => setShowOk(event.target.checked)}
					/>
					Show OK
				</label>
			</div>

			{/* Grouped list */}
			<div className="flex-1 overflow-auto min-h-0">
				{groups.length === 0 ? (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						{store.size === 0
							? "Waiting for diagnostics…"
							: "No entries match the current filter"}
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{groups.map((group) => (
							<div key={group.id} className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<span
										className="min-w-0 flex-1 truncate text-xs font-semibold"
										title={group.label}
									>
										{group.label}
									</span>
									<Badge
										variant={levelVariant(group.worstLevel)}
										className="shrink-0"
									>
										{levelLabel(group.worstLevel)}
									</Badge>
									<span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
										{group.entries.length}
									</span>
								</div>
								<div className="flex flex-col gap-1">
									{group.entries.map((item) => (
										<DiagnosticStatusRow
											key={item.entry.key}
											resolved={item}
											expanded={expanded.has(
												item.entry.key,
											)}
											onToggle={() =>
												toggleExpanded(item.entry.key)
											}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Diagnostics widget host: discovers every
 * `diagnostic_msgs/msg/DiagnosticArray` topic across all datasources and
 * subscribes to all of them at once, presenting a unified merged view.
 *
 * Topic discovery is delegated to {@link useDiscoveredTopics}, which keeps the
 * `SelectedTopics` array identity stable unless the topic set actually changed,
 * so the local provider does not resubscribe on every poll.
 *
 * This is the module-level, stable `Component` reference for the widget
 * definition (widget pattern #10): it holds the polling interval and the
 * subscriptions, so a per-render inline component would remount and thrash them.
 */
const DiagnosticsWidget: React.FC<DiagnosticsWidgetProps> = (props) => {
	const topics = useDiscoveredTopics({
		webappType: DIAGNOSTIC_WEBAPP_TYPE,
		rosType: DIAGNOSTIC_ROS_TYPE,
	});
	const showOk = props.showOk === true;
	// Seconds → ms; clamp to a sane floor so a 0/negative config never marks
	// every entry stale immediately.
	const staleMs =
		Math.max(1, Number(props.staleTimeout) || DEFAULT_STALE_SECONDS) * 1000;

	if (topics.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-3 text-sm text-muted-foreground">
				No diagnostic topics found
			</div>
		);
	}

	// buffersSize > 1 guards against dropping messages when the widget skips a
	// render: the provider appends at most one message per source per ~33ms pump
	// tick (last-wins), so the latch accumulates statuses across ticks and relies
	// on diagnostics being republished periodically. 256 leaves ample headroom.
	return (
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={256}>
			<DiagnosticsBody
				topics={topics}
				defaultShowOk={showOk}
				staleMs={staleMs}
			/>
		</LocalDataSourcesProvider>
	);
};

/**
 * Widget definition for the Diagnostics widget.
 * @returns Widget definition.
 */
export function DiagnosticsWidgetDefinition(): WidgetDefinition<DiagnosticsWidgetProps> {
	return {
		id: "diagnostics-widget",
		name: "Diagnostics",
		description:
			"Auto-subscribes to every diagnostic_msgs/msg/DiagnosticArray topic and renders a unified, hardware-grouped health view",
		titleProp: "title",
		icon: <Activity />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				showOk: {
					type: "boolean",
					title: "Show OK entries by default",
				},
				staleTimeout: {
					type: "number",
					title: "Stale timeout (seconds)",
					description:
						"Seconds without a fresh message before a status is marked STALE",
					minimum: 1,
					default: DEFAULT_STALE_SECONDS,
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
					scope: "#/properties/showOk",
				},
				{
					type: "Control",
					scope: "#/properties/staleTimeout",
				},
			],
		},

		data: {
			title: "Diagnostics",
			showOk: false,
			staleTimeout: DEFAULT_STALE_SECONDS,
		},
		Component: DiagnosticsWidget,
	} as WidgetDefinition<DiagnosticsWidgetProps>;
}
