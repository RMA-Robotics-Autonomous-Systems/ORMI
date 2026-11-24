"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { ROUTE_KINDS, ROUTE_STYLES, type RouteKind } from "./route-styles";

/**
 * The C2 map's legend for the robot lines: one row per kind
 * ({@link ROUTE_STYLES}), each drawn with the casing, width and dash the map
 * draws, so the two cannot disagree.
 *
 * It sits in the map's bottom-right column, above `MapChrome` and clear of
 * the attribution below it (AGENTS.md, the map-chrome rule), and folds down
 * to its header. The header is a 44px target under a coarse pointer.
 */

/** A sample robot colour for the swatches: the map colours each robot its own. */
const SAMPLE_COLOR = "#2563eb";
/**
 * A basemap-neutral grey under each swatch, so the casings show as they do
 * on the map and not against the panel, whose colour follows the theme.
 */
const SWATCH_GROUND = "#a8b0bc";
/** Swatch size, in CSS pixels. */
const SWATCH_WIDTH = 40;
const SWATCH_HEIGHT = 14;

/** One kind, drawn as the map draws it. */
function RouteSwatch(props: { kind: RouteKind }) {
	const { casing, core } = ROUTE_STYLES[props.kind];
	const y = SWATCH_HEIGHT / 2;
	// MapLibre dashes are in line widths; SVG's are in pixels. A zero-length
	// dash with a round cap is a dot in both.
	const dash = core.dash
		? `${core.dash[0] * core.width} ${core.dash[1] * core.width}`
		: undefined;
	const inset = casing.width / 2 + 2;
	return (
		<svg
			width={SWATCH_WIDTH}
			height={SWATCH_HEIGHT}
			viewBox={`0 0 ${SWATCH_WIDTH} ${SWATCH_HEIGHT}`}
			aria-hidden="true"
			className="shrink-0"
		>
			<rect
				width={SWATCH_WIDTH}
				height={SWATCH_HEIGHT}
				rx={3}
				fill={SWATCH_GROUND}
			/>
			<line
				x1={inset}
				x2={SWATCH_WIDTH - inset}
				y1={y}
				y2={y}
				stroke={casing.color}
				strokeOpacity={casing.opacity}
				strokeWidth={casing.width}
				strokeLinecap={core.cap}
			/>
			<line
				x1={inset}
				x2={SWATCH_WIDTH - inset}
				y1={y}
				y2={y}
				stroke={SAMPLE_COLOR}
				strokeOpacity={core.opacity}
				strokeWidth={core.width}
				strokeLinecap={core.cap}
				strokeDasharray={dash}
			/>
		</svg>
	);
}

/**
 * The legend. Open until the operator folds it.
 */
export function RouteLegend() {
	const [open, setOpen] = useState(true);
	const listId = useId();
	return (
		<div
			role="group"
			aria-label="Map legend"
			className="pointer-events-auto flex flex-col rounded-md border bg-background/90 text-[11px] text-foreground shadow-sm backdrop-blur-sm"
		>
			<button
				type="button"
				aria-expanded={open}
				aria-controls={listId}
				onClick={() => setOpen((v) => !v)}
				className="flex items-center justify-between gap-2 rounded-md px-2 py-1 font-medium outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 any-pointer-coarse:min-h-11"
			>
				Legend
				{open ? (
					<ChevronDown className="size-3.5" />
				) : (
					<ChevronUp className="size-3.5" />
				)}
			</button>
			{open && (
				<ul id={listId} className="flex flex-col gap-1 px-2 pb-1.5">
					{ROUTE_KINDS.map((kind) => (
						<li key={kind} className="flex items-center gap-2">
							<RouteSwatch kind={kind} />
							<span>{ROUTE_STYLES[kind].label}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
