"use client";

/**
 * The Mission Feedback widget's two views, hand-rolled SVG on ORMI's theme:
 *
 *  - {@link MissionGantt} — the TIME view. x = time, fitted to each mission's
 *    CURRENT run; a mission row with its status changes (nearby markers merged,
 *    the tooltip lists them) and one compact lane per robot (moving robots
 *    first): actual execution solid, the projection to `eta_end` hatched,
 *    waypoint ticks at `reached_at`, and a "now" line. Every live active
 *    mission plus the selected one, so a robot used twice is visible; many
 *    lanes scroll inside a bounded height under a fixed time axis.
 *  - {@link RouteGraph} — the STRUCTURE view. Per robot a "metro line" of its
 *    waypoints. A route too long for its width becomes a compact whole-route
 *    track (passed part, stop points, the robot, exact counts) plus a zoomed
 *    strip of the few stations around the robot.
 *
 * ⚠ COLOURS — every SVG colour is a theme token (`var(--success)` etc., the
 * runtime variables Tailwind's `bg-success` resolves through), so light and
 * dark mode follow the app. Never `var(--color-*)`: those names exist only
 * inside `@theme inline` and are not emitted at runtime, so an SVG fill using
 * one resolves to nothing and paints black. The ONLY non-theme colour is the small robot identity swatch
 * (`vehicleColor`), kept because it must match that robot's route on the map
 * (MapLibre paints resolved colours, not CSS variables).
 *
 * All geometry comes from the tested pure helpers in `feedback-layout.ts`; the
 * width comes from the shared {@link useContainerSize} measurement.
 */

import { Badge } from "@workspace/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { Fragment, useId, type ReactNode } from "react";

import {
	FeedbackTask,
	MissionFeedback,
	TaskState,
} from "../types/mission-feedback";
import { missionStatusLabel } from "../types/status-labels";
import { useAgentName } from "../state/c2-agents-store";
import { useMissionName } from "../state/c2-catalog-store";
import { setSelectedMission } from "../state/selection-store";
import {
	hoverWaypoint,
	toggleWaypointPin,
	unhoverWaypoint,
	useWaypointHighlight,
} from "../state/waypoint-highlight-store";
import {
	StatusTone,
	clusterMarkers,
	currentRunStart,
	fitTimeAxis,
	ganttLane,
	layoutStations,
	needsCompactRoute,
	robotGlyphX,
	routeTrack,
	sortLanes,
	stationWindow,
	statusTone,
	timeTicks,
	timeToX,
} from "./feedback-layout";
import {
	formatClock,
	missionPhase,
	parseTime,
	taskProgress,
	taskStateLabel,
} from "./mission-progress";
import {
	formatDistance,
	formatDuration,
	taskDistanceMeters,
	vehicleColor,
} from "./plan-metrics";
import { PanelEmptyState } from "./panel-empty-state";
import { ContainerSize, useContainerSize } from "./responsive";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * A theme colour token as a CSS value. The runtime variable is `--<name>` (the
 * `--color-<name>` aliases live in `@theme inline` and are compiled away).
 */
const token = (name: string) => `var(--${name})`;

/** Theme colour per status tone (SVG). */
export const TONE_COLOR: Record<StatusTone, string> = {
	active: token("success"),
	info: token("info"),
	warn: token("warning"),
	fail: token("destructive"),
	done: token("muted-foreground"),
	neutral: token("muted-foreground"),
};

/**
 * ORMI `Badge` variant per status tone. A status is never `default` (a solid
 * primary pill reads as a button) nor `secondary` (reserved for counts).
 */
export const TONE_BADGE: Record<
	StatusTone,
	"success" | "warning" | "destructive" | "outline"
> = {
	active: "success",
	info: "outline",
	warn: "warning",
	fail: "destructive",
	done: "outline",
	neutral: "outline",
};

/** Theme colour of a robot's bar by its task state. */
function laneColor(state: number | undefined): string {
	switch (state) {
		case TaskState.STARTED:
			return token("success");
		case TaskState.PAUSED:
			return token("warning");
		case TaskState.STOPPED:
			return token("info");
		case TaskState.COMPLETED:
			return token("muted-foreground");
		case TaskState.ABORTED:
		case TaskState.DELETED:
			return token("destructive");
		default:
			return token("primary");
	}
}

/** Badge variant of a task state (a status: never `default`/`secondary`). */
function taskBadge(
	state: number | undefined,
): "success" | "warning" | "destructive" | "outline" {
	switch (state) {
		case TaskState.STARTED:
			return "success";
		case TaskState.PAUSED:
			return "warning";
		case TaskState.ABORTED:
		case TaskState.DELETED:
			return "destructive";
		default:
			return "outline";
	}
}

// ---------------------------------------------------------------------------
// Labelled figures
// ---------------------------------------------------------------------------

/** One labelled figure, e.g. `["Remaining", "42 m"]`; empty values are dropped. */
export type StatItem = [label: string, value: ReactNode | null | undefined];

/**
 * A wrapping row of labelled figures: "Remaining 42 m · Speed 0.6 m/s".
 *
 * Items are separated by a real " · " text node, not only by flex gap, so they
 * can never run together whatever the styling does. Missing values are left
 * out — no "—" placeholders.
 */
export function StatList(props: { items: StatItem[]; className?: string }) {
	const items = props.items.filter(
		([, value]) => value != null && value !== "",
	);
	if (items.length === 0) return null;
	return (
		<div
			className={`flex flex-wrap items-baseline gap-y-0.5 text-xs min-w-0 ${props.className ?? ""}`}
		>
			{items.map(([label, value], i) => (
				<Fragment key={label}>
					{i > 0 && (
						<span
							aria-hidden
							className="text-muted-foreground/60 whitespace-pre"
						>
							{" · "}
						</span>
					)}
					<span className="whitespace-nowrap">
						<span className="text-muted-foreground">{label}</span>{" "}
						<span className="tabular-nums font-medium">
							{value}
						</span>
					</span>
				</Fragment>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Name labels (hooks → their own components)
// ---------------------------------------------------------------------------

/** Truncate for an SVG label (SVG text does not ellipsise). */
function clip(text: string, maxChars: number): string {
	return text.length > maxChars
		? `${text.slice(0, Math.max(1, maxChars - 1))}…`
		: text;
}

/** A robot's name as SVG text. */
function RobotNameText(props: {
	vehicleId: string;
	x: number;
	y: number;
	maxChars: number;
}) {
	const name = useAgentName(props.vehicleId) || "unknown vehicle";
	return (
		<text
			x={props.x}
			y={props.y}
			dominantBaseline="central"
			fontSize={11}
			style={{ fill: token("foreground") }}
		>
			<title>{name}</title>
			{clip(name, props.maxChars)}
		</text>
	);
}

/** A mission's name as SVG text (click selects it). */
function MissionNameText(props: {
	missionId: string;
	x: number;
	y: number;
	maxChars: number;
	selected: boolean;
}) {
	const name = useMissionName(props.missionId);
	return (
		<text
			x={props.x}
			y={props.y}
			dominantBaseline="central"
			fontSize={11}
			fontWeight={props.selected ? 600 : 500}
			className="cursor-pointer"
			style={{
				fill: token(props.selected ? "foreground" : "muted-foreground"),
			}}
			onClick={() => setSelectedMission(props.missionId)}
		>
			<title>{name}</title>
			{clip(name, props.maxChars)}
		</text>
	);
}

// ---------------------------------------------------------------------------
// Gantt
// ---------------------------------------------------------------------------

const AXIS_H = 20;
const MISSION_H = 20;
const LANE_H = 18;
const BAR_H = 10;
const GAP_H = 6;
/** Status markers closer than this are drawn as one. */
const MARKER_MERGE_PX = 12;

/** Width of the label column per container size. */
const LABEL_W: Record<ContainerSize, number> = {
	xs: 84,
	sm: 112,
	md: 150,
	lg: 180,
};

/** Vertical layout of the Gantt body: mission rows and robot lanes. */
function ganttRows(missions: MissionFeedback[]) {
	const groups: {
		fb: MissionFeedback;
		top: number;
		bottom: number;
		lanes: { task: FeedbackTask; top: number }[];
	}[] = [];
	let y = 2;
	for (const fb of missions) {
		const top = y;
		y += MISSION_H;
		const lanes: { task: FeedbackTask; top: number }[] = [];
		for (const task of sortLanes(fb.tasks)) {
			lanes.push({ task, top: y });
			y += LANE_H;
		}
		groups.push({ fb, top, lanes, bottom: y });
		y += GAP_H;
	}
	return { groups, height: y };
}

/** One merged status marker, with a tooltip listing its members. */
function StatusMarker(props: {
	x: number;
	y: number;
	members: { status: number; at: string | null }[];
}) {
	const { x, y, members } = props;
	const last = members[members.length - 1]!;
	const color = TONE_COLOR[statusTone(last.status)];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<g className="cursor-default">
					<rect
						x={x - 4}
						y={y - 4}
						width={8}
						height={8}
						transform={`rotate(45 ${x} ${y})`}
						strokeWidth={1.5}
						style={{ fill: color, stroke: token("background") }}
					/>
					{members.length > 1 && (
						<text
							x={x + 7}
							y={y}
							dominantBaseline="central"
							fontSize={9}
							style={{ fill: token("muted-foreground") }}
						>
							{members.length}
						</text>
					)}
				</g>
			</TooltipTrigger>
			<TooltipContent side="top">
				<div className="flex flex-col gap-0.5 text-xs">
					{members.map((m, i) => (
						<div key={i} className="tabular-nums">
							{missionStatusLabel(m.status)} · {formatClock(m.at)}
						</div>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * The time view. See the module header.
 *
 * @param props.missions - Missions to draw (the selected one first).
 * @param props.selectedId - The selected mission (emphasised).
 * @param props.now - The current time in ms.
 * @param props.earlierRuns - Include runs before the current one.
 */
export function MissionGantt(props: {
	missions: MissionFeedback[];
	selectedId: string | null;
	now: number;
	earlierRuns: boolean;
}) {
	const { missions, selectedId, now, earlierRuns } = props;
	const [ref, box] = useContainerSize<HTMLDivElement>();
	const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const range = fitTimeAxis(missions, now, { earlierRuns });
	const width = box.width;

	if (!range || width === 0) {
		// Same root element either way, so the measurement keeps observing it.
		return (
			<div ref={ref} className="w-full min-w-0">
				{!range && (
					<PanelEmptyState>
						No times reported yet. The timeline appears once robots
						are dispatched (needs a C2 that sends MissionFeedback
						v2).
					</PanelEmptyState>
				)}
			</div>
		);
	}

	const labelW = LABEL_W[box.size];
	const plotW = Math.max(40, width - labelW - 8);
	const x = (t: number) => labelW + timeToX(t, range, plotW);
	const ticks = timeTicks(range, Math.max(2, Math.floor(plotW / 72)));
	const withSeconds =
		ticks.length > 1 && (ticks[1]! - ticks[0]!) % 60_000 !== 0;
	const maxChars = Math.max(4, Math.floor(labelW / 6.4));
	const { groups, height } = ganttRows(missions);
	const nowX = x(now);
	const nowVisible = nowX >= labelW && nowX <= labelW + plotW;
	const clipId = `plot-${uid}`;
	// Tick labels that would collide with the "now" label are dropped.
	const tickLabelVisible = (t: number) =>
		!nowVisible || Math.abs(x(t) - nowX) > 34;

	return (
		<div ref={ref} className="w-full min-w-0">
			{/* Fixed time axis. */}
			<svg width={width} height={AXIS_H} className="block select-none">
				{ticks.map((t) =>
					tickLabelVisible(t) ? (
						<text
							key={t}
							x={x(t)}
							y={AXIS_H / 2}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={10}
							className="tabular-nums"
							style={{ fill: token("muted-foreground") }}
						>
							{formatClock(
								new Date(t).toISOString(),
								!withSeconds,
							)}
						</text>
					) : null,
				)}
				{nowVisible && (
					<g>
						<rect
							x={Math.min(Math.max(nowX - 14, 0), width - 28)}
							y={3}
							width={28}
							height={AXIS_H - 6}
							rx={4}
							style={{ fill: token("destructive") }}
						/>
						<text
							x={Math.min(Math.max(nowX, 14), width - 14)}
							y={AXIS_H / 2}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={9}
							fontWeight={600}
							style={{ fill: "white" }}
						>
							now
						</text>
					</g>
				)}
			</svg>

			{/* Lanes, scrolling under the axis when there are many robots. */}
			<div className="max-h-72 overflow-y-auto overflow-x-hidden border-t">
				<svg
					width={width}
					height={height}
					className="block select-none"
					role="img"
					aria-label="Mission timeline"
				>
					<defs>
						<clipPath id={clipId}>
							<rect
								x={labelW}
								y={0}
								width={plotW}
								height={height}
							/>
						</clipPath>
						{groups.flatMap(({ lanes }, gi) =>
							lanes.map(({ task }, li) => (
								<pattern
									key={`${gi}-${li}`}
									id={`hatch-${uid}-${gi}-${li}`}
									width="5"
									height="5"
									patternUnits="userSpaceOnUse"
									patternTransform="rotate(45)"
								>
									<line
										x1="0"
										y1="0"
										x2="0"
										y2="5"
										strokeWidth="2"
										opacity={0.55}
										style={{
											stroke: laneColor(task.state),
										}}
									/>
								</pattern>
							)),
						)}
					</defs>

					{ticks.map((t) => (
						<line
							key={t}
							x1={x(t)}
							x2={x(t)}
							y1={0}
							y2={height}
							strokeWidth={1}
							style={{ stroke: token("border") }}
						/>
					))}

					{groups.map(({ fb, top, lanes, bottom }, gi) => {
						const selected = fb.mission_id === selectedId;
						const active = missionPhase(fb.status) === "active";
						const from = earlierRuns ? null : currentRunStart(fb);
						const markers: {
							x: number;
							status: number;
							at: string | null;
						}[] = [];
						for (const h of fb.status_history ?? []) {
							const t = parseTime(h.at);
							if (t == null || (from != null && t < from))
								continue;
							markers.push({
								x: x(t),
								status: h.status,
								at: h.at,
							});
						}
						const clusters = clusterMarkers(
							markers,
							MARKER_MERGE_PX,
						);
						const cy = top + MISSION_H / 2;
						return (
							<g key={fb.mission_id}>
								{selected && missions.length > 1 && (
									<rect
										x={0}
										y={top - 2}
										width={width}
										height={bottom - top + 4}
										style={{ fill: token("accent") }}
									/>
								)}
								<MissionNameText
									missionId={fb.mission_id}
									x={4}
									y={cy}
									maxChars={maxChars}
									selected={selected}
								/>
								<g clipPath={`url(#${clipId})`}>
									{clusters.map((c) => (
										<StatusMarker
											key={c.x}
											x={c.x}
											y={cy}
											members={c.members}
										/>
									))}
								</g>

								{lanes.map(({ task, top: laneTop }, li) => {
									const lane = ganttLane(task, active, now);
									const color = laneColor(task.state);
									const ly = laneTop + LANE_H / 2;
									const barY = ly - BAR_H / 2;
									const state = taskStateLabel(task.state);
									const target = (index: number) => ({
										missionId: fb.mission_id,
										vehicleId: task.vehicle_id,
										index,
									});
									return (
										<g key={`${task.vehicle_id}-${li}`}>
											<circle
												cx={10}
												cy={ly}
												r={3.5}
												fill={vehicleColor(
													task.vehicle_id,
												)}
											/>
											<RobotNameText
												vehicleId={task.vehicle_id}
												x={19}
												y={ly}
												maxChars={maxChars - 3}
											/>
											<g clipPath={`url(#${clipId})`}>
												{lane.waitFrom != null && (
													<line
														x1={x(lane.waitFrom)}
														x2={x(
															lane.actualFrom ??
																now,
														)}
														y1={ly}
														y2={ly}
														strokeWidth={1.5}
														strokeDasharray="2 2"
														style={{
															stroke: color,
														}}
													>
														<title>
															Dispatched, waiting
															to start
														</title>
													</line>
												)}
												{lane.actualFrom != null &&
													lane.actualTo != null && (
														<rect
															x={x(
																lane.actualFrom,
															)}
															y={barY}
															width={Math.max(
																2,
																x(
																	lane.actualTo,
																) -
																	x(
																		lane.actualFrom,
																	),
															)}
															height={BAR_H}
															rx={2}
															style={{
																fill: color,
															}}
														>
															<title>
																{[
																	state ??
																		"Task",
																	`started ${formatClock(task.started_at)}`,
																	task.ended_at
																		? `ended ${formatClock(task.ended_at)}`
																		: null,
																]
																	.filter(
																		Boolean,
																	)
																	.join(
																		" · ",
																	)}
															</title>
														</rect>
													)}
												{lane.projectedTo != null &&
													lane.actualTo != null && (
														<rect
															x={x(lane.actualTo)}
															y={barY}
															width={Math.max(
																2,
																x(
																	lane.projectedTo,
																) -
																	x(
																		lane.actualTo,
																	),
															)}
															height={BAR_H}
															rx={2}
															fill={`url(#hatch-${uid}-${gi}-${li})`}
															strokeWidth={1}
															style={{
																stroke: color,
															}}
														>
															<title>
																{`Projected end ${formatClock(task.eta_end)}`}
															</title>
														</rect>
													)}
												{lane.ticks.map((t) => (
													<line
														key={t.index}
														x1={x(t.at)}
														x2={x(t.at)}
														y1={
															t.stop
																? barY - 2
																: barY + 2
														}
														y2={
															t.stop
																? barY +
																	BAR_H +
																	2
																: barY +
																	BAR_H -
																	2
														}
														strokeWidth={
															t.stop ? 2 : 1
														}
														className="cursor-pointer"
														style={{
															stroke: token(
																t.stop
																	? "foreground"
																	: "background",
															),
														}}
														onMouseEnter={() =>
															hoverWaypoint(
																target(t.index),
															)
														}
														onMouseLeave={
															unhoverWaypoint
														}
														onClick={() =>
															toggleWaypointPin(
																target(t.index),
															)
														}
													>
														<title>
															{`WP ${t.index + 1}${t.stop ? " (stop)" : ""} · reached ${formatClock(new Date(t.at).toISOString())}`}
														</title>
													</line>
												))}
											</g>
										</g>
									);
								})}
							</g>
						);
					})}

					{nowVisible && (
						<line
							x1={nowX}
							x2={nowX}
							y1={0}
							y2={height}
							strokeWidth={1.5}
							strokeDasharray="4 3"
							pointerEvents="none"
							style={{ stroke: token("destructive") }}
						/>
					)}
				</svg>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Route graph
// ---------------------------------------------------------------------------

const PAD_X = 12;
const MIN_STATION_GAP = 16;

/** One station glyph (stop = square, pass-through = dot). */
function StationGlyph(props: {
	cx: number;
	cy: number;
	stop: boolean;
	passed: boolean;
	next: boolean;
	highlighted: boolean;
	title: string;
	onEnter: () => void;
	onClick: () => void;
}) {
	const { cx, cy, stop, passed, next, highlighted } = props;
	const fill = passed ? token("primary") : token("background");
	const stroke = passed ? token("primary") : token("muted-foreground");
	return (
		<g
			className="cursor-pointer"
			onMouseEnter={props.onEnter}
			onMouseLeave={unhoverWaypoint}
			onClick={props.onClick}
		>
			<title>{props.title}</title>
			{(next || highlighted) && (
				<circle
					cx={cx}
					cy={cy}
					r={highlighted ? 10 : 8}
					fill="none"
					strokeWidth={2}
					style={{ stroke: token(highlighted ? "warning" : "info") }}
				/>
			)}
			{stop ? (
				<rect
					x={cx - 5.5}
					y={cy - 5.5}
					width={11}
					height={11}
					rx={1.5}
					strokeWidth={2}
					style={{ fill, stroke: token("foreground") }}
				/>
			) : (
				<circle
					cx={cx}
					cy={cy}
					r={3.5}
					strokeWidth={1.5}
					style={{ fill, stroke }}
				/>
			)}
			<circle cx={cx} cy={cy} r={9} fill="transparent" />
		</g>
	);
}

/** The robot glyph. */
function RobotGlyph(props: { x: number; y: number; label: string }) {
	return (
		<g pointerEvents="none">
			<title>{props.label}</title>
			<circle
				cx={props.x}
				cy={props.y}
				r={7}
				strokeWidth={2.5}
				style={{ fill: token("primary"), stroke: token("background") }}
			/>
			<circle
				cx={props.x}
				cy={props.y}
				r={2.2}
				style={{ fill: token("primary-foreground") }}
			/>
		</g>
	);
}

/** Tooltip text of a waypoint. */
function stationTitle(task: FeedbackTask, index: number): string {
	const w = task.waypoints[index]!;
	return [
		`WP ${index + 1}`,
		w.stop === true
			? "stop point"
			: w.stop === false
				? "pass-through"
				: null,
		w.reached_at
			? `reached ${formatClock(w.reached_at)}`
			: w.eta
				? `ETA ${formatClock(w.eta)}`
				: null,
	]
		.filter(Boolean)
		.join(" · ");
}

/** "Next WP 12 · 14 m · 15:31:10" for the next waypoint. */
function nextLabel(task: FeedbackTask, index: number): string {
	const eta = task.waypoints[index]?.eta;
	return [
		`Next WP ${index + 1}`,
		task.distance_to_next_m != null
			? formatDistance(task.distance_to_next_m)
			: null,
		eta ? formatClock(eta) : null,
	]
		.filter(Boolean)
		.join(" · ");
}

/** Text anchor that keeps a label at `x` inside `[0, width]`. */
function anchorFor(x: number, width: number): "start" | "middle" | "end" {
	if (x < width * 0.25) return "start";
	if (x > width * 0.75) return "end";
	return "middle";
}

/** Short route: every station, spaced by path distance. */
function FullRoute(props: {
	missionId: string;
	task: FeedbackTask;
	width: number;
	robotName: string;
}) {
	const { missionId, task, width } = props;
	const highlight = useWaypointHighlight();
	const p = taskProgress(task);
	const innerW = Math.max(40, width - 2 * PAD_X);
	const { stations, xs } = layoutStations(task, innerW, MIN_STATION_GAP);
	const glyph = robotGlyphX(task, xs);
	const X = (v: number) => PAD_X + v;
	const lineY = 24;
	const lastPassed =
		p.done > 0 ? xs[Math.min(p.done, xs.length) - 1] : undefined;
	const drivenTo = glyph ?? lastPassed ?? null;
	const next =
		p.currentIndex != null
			? stations.find((s) => s.index === p.currentIndex)
			: undefined;
	const hl =
		highlight?.missionId === missionId &&
		highlight.vehicleId === task.vehicle_id
			? highlight.index
			: null;
	const target = (index: number) => ({
		missionId,
		vehicleId: task.vehicle_id,
		index,
	});
	const label = next ? nextLabel(task, next.index) : null;
	const labelX = next ? X(next.x) : 0;

	return (
		<svg
			width={width}
			height={40}
			className="block select-none"
			role="img"
			aria-label={`Route of ${props.robotName}`}
		>
			<line
				x1={X(0)}
				x2={X(xs[xs.length - 1] ?? 0)}
				y1={lineY}
				y2={lineY}
				strokeWidth={4}
				strokeLinecap="round"
				style={{ stroke: token("muted") }}
			/>
			{drivenTo != null && drivenTo > 0 && (
				<line
					x1={X(0)}
					x2={X(drivenTo)}
					y1={lineY}
					y2={lineY}
					strokeWidth={4}
					strokeLinecap="round"
					style={{ stroke: token("primary") }}
				/>
			)}
			{stations.map((s) => (
				<StationGlyph
					key={s.index}
					cx={X(s.x)}
					cy={lineY}
					stop={s.stop}
					passed={s.index < p.done}
					next={s.index === p.currentIndex}
					highlighted={s.index === hl}
					title={stationTitle(task, s.index)}
					onEnter={() => hoverWaypoint(target(s.index))}
					onClick={() => toggleWaypointPin(target(s.index))}
				/>
			))}
			{label && (
				<text
					x={labelX}
					y={8}
					textAnchor={anchorFor(labelX, width)}
					fontSize={10}
					fontWeight={500}
					style={{ fill: token("foreground") }}
				>
					{label}
				</text>
			)}
			{glyph != null && (
				<RobotGlyph x={X(glyph)} y={lineY} label={props.robotName} />
			)}
		</svg>
	);
}

/**
 * Long route: a compact whole-route track (passed part, stop points, robot) and
 * a zoomed strip of the stations around the robot, with exact counts.
 */
function CompactRoute(props: {
	missionId: string;
	task: FeedbackTask;
	width: number;
	robotName: string;
}) {
	const { missionId, task, width } = props;
	const highlight = useWaypointHighlight();
	const p = taskProgress(task);
	const track = routeTrack(task);
	const win = stationWindow(task, 3, 5);
	const innerW = Math.max(40, width - 2 * PAD_X);
	const X = (f: number) => PAD_X + f * innerW;
	const hl =
		highlight?.missionId === missionId &&
		highlight.vehicleId === task.vehicle_id
			? highlight.index
			: null;
	const target = (index: number) => ({
		missionId,
		vehicleId: task.vehicle_id,
		index,
	});

	// Strip: the window's stations, evenly spaced.
	const count = win.indices.length;
	const stripX = (j: number) =>
		PAD_X + (count > 1 ? (j / (count - 1)) * innerW : innerW / 2);
	const stripY = 22;
	const labelEvery = innerW / Math.max(1, count - 1) >= 40 ? 1 : 2;
	const nextJ =
		p.currentIndex != null ? win.indices.indexOf(p.currentIndex) : -1;
	// The robot inside the strip, between the last passed and the next station
	// (glyph position in "waypoint index" units, then mapped into the strip).
	let stripRobot: number | null = null;
	if (nextJ > 0) {
		const at = robotGlyphX(
			task,
			task.waypoints.map((_, i) => i),
		);
		if (at != null) {
			const f = Math.min(1, Math.max(0, at - win.indices[nextJ - 1]!));
			stripRobot =
				stripX(nextJ - 1) + f * (stripX(nextJ) - stripX(nextJ - 1));
		}
	} else if (nextJ === 0) {
		stripRobot = stripX(0);
	}
	const windowFrom = count > 0 ? win.indices[0]! : 0;
	const windowTo = count > 0 ? win.indices[count - 1]! : 0;
	const frac = (i: number) => i / Math.max(1, track.total - 1);

	return (
		<div className="flex flex-col gap-1 min-w-0">
			{/* Whole route. */}
			<svg
				width={width}
				height={20}
				className="block select-none"
				role="img"
				aria-label={`Whole route of ${props.robotName}`}
			>
				<line
					x1={X(0)}
					x2={X(1)}
					y1={10}
					y2={10}
					strokeWidth={6}
					strokeLinecap="round"
					style={{ stroke: token("muted") }}
				/>
				{track.robot != null && track.robot > 0 && (
					<line
						x1={X(0)}
						x2={X(track.robot)}
						y1={10}
						y2={10}
						strokeWidth={6}
						strokeLinecap="round"
						style={{ stroke: token("primary") }}
					/>
				)}
				{/* Where the zoomed strip below sits on the whole route. */}
				{count > 0 && (
					<rect
						x={X(frac(windowFrom)) - 3}
						y={2}
						width={Math.max(
							6,
							X(frac(windowTo)) - X(frac(windowFrom)) + 6,
						)}
						height={16}
						rx={3}
						fill="none"
						strokeWidth={1}
						strokeDasharray="2 2"
						style={{ stroke: token("muted-foreground") }}
					/>
				)}
				{track.stops.map((s) => (
					<rect
						key={s.index}
						x={X(s.at) - 4}
						y={6}
						width={8}
						height={8}
						rx={1}
						strokeWidth={1.5}
						style={{
							fill: token(
								s.index < p.done ? "primary" : "background",
							),
							stroke: token("foreground"),
						}}
					>
						<title>{stationTitle(task, s.index)}</title>
					</rect>
				))}
				{track.robot != null && (
					<RobotGlyph
						x={X(track.robot)}
						y={10}
						label={props.robotName}
					/>
				)}
			</svg>

			{/* Around the robot. */}
			<div className="flex justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
				<span>
					{win.hiddenBefore > 0
						? `‹ ${win.hiddenBefore} earlier`
						: ""}
				</span>
				<span>
					{win.hiddenAfter > 0 ? `${win.hiddenAfter} more ›` : ""}
				</span>
			</div>
			<svg
				width={width}
				height={48}
				className="block select-none"
				role="img"
				aria-label={`Stations around ${props.robotName}`}
			>
				<line
					x1={stripX(0)}
					x2={stripX(Math.max(0, count - 1))}
					y1={stripY}
					y2={stripY}
					strokeWidth={4}
					strokeLinecap="round"
					style={{ stroke: token("muted") }}
				/>
				{nextJ > 0 && (
					<line
						x1={stripX(0)}
						x2={stripRobot ?? stripX(nextJ - 1)}
						y1={stripY}
						y2={stripY}
						strokeWidth={4}
						strokeLinecap="round"
						style={{ stroke: token("primary") }}
					/>
				)}
				{nextJ < 0 && p.known && p.done > windowTo && (
					<line
						x1={stripX(0)}
						x2={stripX(Math.max(0, count - 1))}
						y1={stripY}
						y2={stripY}
						strokeWidth={4}
						strokeLinecap="round"
						style={{ stroke: token("primary") }}
					/>
				)}
				{win.indices.map((index, j) => {
					const w = task.waypoints[index]!;
					const showLabel =
						j % labelEvery === 0 || index === p.currentIndex;
					return (
						<g key={index}>
							<StationGlyph
								cx={stripX(j)}
								cy={stripY}
								stop={w.stop === true}
								passed={index < p.done}
								next={index === p.currentIndex}
								highlighted={index === hl}
								title={stationTitle(task, index)}
								onEnter={() => hoverWaypoint(target(index))}
								onClick={() => toggleWaypointPin(target(index))}
							/>
							{showLabel && (
								<text
									x={stripX(j)}
									y={stripY + 18}
									textAnchor={
										j === 0
											? "start"
											: j === count - 1
												? "end"
												: "middle"
									}
									fontSize={9}
									className="tabular-nums"
									style={{
										fill: token(
											index === p.currentIndex
												? "foreground"
												: "muted-foreground",
										),
									}}
								>
									{index + 1}
								</text>
							)}
						</g>
					);
				})}
				{nextJ >= 0 && p.currentIndex != null && (
					<text
						x={stripX(nextJ)}
						y={8}
						textAnchor={anchorFor(stripX(nextJ), width)}
						fontSize={10}
						fontWeight={500}
						style={{ fill: token("foreground") }}
					>
						{nextLabel(task, p.currentIndex)}
					</text>
				)}
				{stripRobot != null && (
					<RobotGlyph
						x={stripRobot}
						y={stripY}
						label={props.robotName}
					/>
				)}
			</svg>
		</div>
	);
}

/** One robot: name, state, counts, the route drawing and its figures. */
function RobotRoute(props: { missionId: string; task: FeedbackTask }) {
	const { missionId, task } = props;
	const [ref, box] = useContainerSize<HTMLDivElement>();
	const name = useAgentName(task.vehicle_id) || "unknown vehicle";
	const p = taskProgress(task);
	const state = taskStateLabel(task.state);
	const n = task.waypoints.length;
	const compact =
		box.width > 0 &&
		needsCompactRoute(n, box.width - 2 * PAD_X, MIN_STATION_GAP);

	return (
		<div className="flex flex-col gap-1.5 min-w-0">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
				<span className="flex items-center gap-1.5 min-w-0">
					<span
						className="size-2.5 shrink-0 rounded-full"
						style={{
							backgroundColor: vehicleColor(task.vehicle_id),
						}}
						aria-hidden
					/>
					<span
						className="text-sm font-medium truncate"
						title={task.vehicle_id}
					>
						{name}
					</span>
				</span>
				{state && (
					<Badge variant={taskBadge(task.state)}>{state}</Badge>
				)}
				<StatList
					items={
						p.known
							? [
									["Passed", `${p.done} of ${p.total}`],
									[
										"Next",
										p.currentIndex != null
											? `WP ${p.currentIndex + 1}`
											: null,
									],
								]
							: [["Waypoints", String(p.total)]]
					}
				/>
			</div>

			<div ref={ref} className="w-full min-w-0">
				{box.width > 0 &&
					n > 0 &&
					(compact ? (
						<CompactRoute
							missionId={missionId}
							task={task}
							width={box.width}
							robotName={name}
						/>
					) : (
						<FullRoute
							missionId={missionId}
							task={task}
							width={box.width}
							robotName={name}
						/>
					))}
			</div>

			<StatList
				items={[
					[
						"Remaining",
						task.remaining_m != null
							? formatDistance(task.remaining_m)
							: null,
					],
					[
						"Route",
						task.remaining_m == null
							? formatDistance(taskDistanceMeters(task))
							: null,
					],
					[
						"Speed",
						task.speed_mps != null
							? `${task.speed_mps.toFixed(1)} m/s`
							: null,
					],
					[
						"Started",
						task.started_at ? formatClock(task.started_at) : null,
					],
					[
						"Ended",
						task.ended_at ? formatClock(task.ended_at) : null,
					],
					[
						"ETA",
						!task.ended_at && task.eta_end
							? formatClock(task.eta_end)
							: null,
					],
					[
						"Took",
						task.started_at && task.ended_at
							? formatDuration(
									(Date.parse(task.ended_at) -
										Date.parse(task.started_at)) /
										1000,
								)
							: null,
					],
				]}
			/>
		</div>
	);
}

/**
 * The structure view: one route per robot of the mission, moving robots first.
 * @param props.fb - The shown mission.
 */
export function RouteGraph(props: { fb: MissionFeedback }) {
	const { fb } = props;
	if (fb.tasks.length === 0) {
		return (
			<PanelEmptyState>
				No robot tasks in this mission yet.
			</PanelEmptyState>
		);
	}
	return (
		<div className="flex flex-col gap-4 min-w-0">
			{sortLanes(fb.tasks).map((task, i) => (
				<RobotRoute
					key={`${task.task_id ?? task.vehicle_id}-${i}`}
					missionId={fb.mission_id}
					task={task}
				/>
			))}
		</div>
	);
}
