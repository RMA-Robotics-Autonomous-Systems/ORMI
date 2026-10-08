/**
 * Geometry and "Arrange" presets of the GRID layout engine.
 *
 * Pure: no React, no CSS, no icons. The dashboard component measures its
 * container and calls in here; everything that decides where a tile goes is
 * a function of plain numbers, so it is unit-tested without a DOM.
 *
 * The geometry constants are the ones `<ResponsiveGridLayout>` is given as
 * props. They are exported from here and read by both sides, so the row
 * budget the presets compute and the rows the grid actually draws cannot
 * drift apart.
 */
import { getBreakpointFromWidth } from "react-grid-layout/core";
import type { LayoutItem } from "react-grid-layout";

/** Height of one grid row, in pixels. */
export const GRID_ROW_HEIGHT = 30;

/** Gap between two neighbouring tiles, in pixels, on both axes. */
export const GRID_MARGIN = 2;

/** The `margin` prop of the grid: `[horizontal, vertical]`. */
export const GRID_MARGIN_XY: readonly [number, number] = [
	GRID_MARGIN,
	GRID_MARGIN,
];

/**
 * Padding the grid keeps above the first row and below the last one.
 * The engine passes no `containerPadding`, and react-grid-layout then falls
 * back to `margin` (`containerPadding ?? margin`), so the two are one value.
 */
export const GRID_CONTAINER_PADDING_Y = GRID_MARGIN;

/** Minimum container width, in pixels, of each breakpoint. */
export const GRID_BREAKPOINTS = {
	lg: 1200,
	md: 996,
	sm: 768,
	xs: 480,
	xxs: 0,
} as const;

/** Column count of each breakpoint. */
export const GRID_COLS = {
	lg: 12,
	md: 10,
	sm: 6,
	xs: 4,
	xxs: 2,
} as const;

/** Name of a grid breakpoint. */
export type GridBreakpoint = keyof typeof GRID_COLS;

/**
 * Smallest height a preset gives a tile, in rows (190px at the grid's
 * pitch). A budget that cannot honour it is exceeded: the layout extends
 * past the visible area and scrolls.
 */
export const MIN_TILE_ROWS = 6;

/** Smallest width a preset gives a tile, in columns. */
export const MIN_TILE_COLS = 2;

/** At or below this column count the focus preset stacks vertically. */
const FOCUS_STACKED_MAX_COLS = 4;

/** Width-to-height ratio the grid preset steers its tiles towards. */
const TARGET_TILE_ASPECT = 3 / 2;

/** Layout presets offered by the Arrange menu. */
export type ArrangePreset = "grid" | "columns" | "rows" | "focus";

/** Input of {@link arrangeGrid}. */
export interface ArrangeGridInput {
	/** Preset to apply. */
	preset: ArrangePreset;
	/** Ids of every widget on the dashboard, in dashboard order. */
	widgetIds: readonly string[];
	/** Current layout of the breakpoint being arranged. */
	layout: readonly LayoutItem[];
	/** Column count of that breakpoint. */
	cols: number;
	/** Width of the grid container, in pixels. */
	width: number;
	/** Visible height available to the grid, in pixels. */
	height: number;
}

/**
 * Number of grid rows that fit a container height.
 *
 * `N` rows occupy `N * rowHeight + (N - 1) * margin + 2 * paddingY` pixels,
 * which is the height react-grid-layout gives its own container.
 *
 * @param heightPx Visible height available to the grid, in pixels.
 * @returns The largest row count that fits, never below 1.
 */
export function rowsForHeight(heightPx: number): number {
	if (!Number.isFinite(heightPx)) return 1;
	const pitch = GRID_ROW_HEIGHT + GRID_MARGIN;
	const rows = Math.floor(
		(heightPx - 2 * GRID_CONTAINER_PADDING_Y + GRID_MARGIN) / pitch,
	);
	return Math.max(1, rows);
}

/**
 * Breakpoint the grid shows at a container width. Delegates to
 * react-grid-layout's own helper, the one `ResponsiveGridLayout` calls: the
 * widest breakpoint whose minimum is strictly below the width.
 *
 * @param containerWidth Width of the grid container, in pixels.
 * @returns The breakpoint name.
 */
export function resolveGridBreakpoint(containerWidth: number): GridBreakpoint {
	return getBreakpointFromWidth(GRID_BREAKPOINTS, containerWidth);
}

/**
 * Splits `total` units into `parts` integer spans that sum exactly to
 * `total`. The remainder is spread one unit at a time over the leading
 * spans, so spans differ by at most one.
 *
 * @param total Units to split. Spans are at least 1 only when
 *   `total >= parts`.
 * @param parts Number of spans.
 * @returns The spans, or an empty array when `parts` is below 1.
 */
export function distribute(total: number, parts: number): number[] {
	if (parts < 1) return [];
	const base = Math.floor(total / parts);
	const remainder = total - base * parts;
	return Array.from({ length: parts }, (_, index) =>
		index < remainder ? base + 1 : base,
	);
}

/** A tile position, before it is merged onto its layout item. */
interface Cell {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Heights of `count` stacked bands: the row budget shared out when every
 * band can have the minimum, the minimum each otherwise.
 */
function bandHeights(rowBudget: number, count: number): number[] {
	if (rowBudget >= count * MIN_TILE_ROWS) return distribute(rowBudget, count);
	return Array.from({ length: count }, () => MIN_TILE_ROWS);
}

/**
 * Lays out horizontal bands top to bottom. Each band's tiles share the full
 * width, so a band holding fewer tiles has wider ones.
 */
function layoutBands(
	bandSizes: readonly number[],
	cols: number,
	rowBudget: number,
): Cell[] {
	const heights = bandHeights(rowBudget, bandSizes.length);
	const cells: Cell[] = [];
	let y = 0;
	bandSizes.forEach((size, band) => {
		const h = heights[band] ?? MIN_TILE_ROWS;
		let x = 0;
		for (const w of distribute(cols, size)) {
			cells.push({ x, y, w, h });
			x += w;
		}
		y += h;
	});
	return cells;
}

/** Most tiles one band can hold at the minimum tile width. */
function maxTilesPerBand(cols: number): number {
	return Math.max(1, Math.floor(cols / MIN_TILE_COLS));
}

/** Band sizes for `count` tiles at `perBand` a band; the last may be short. */
function fillBands(count: number, perBand: number): number[] {
	const sizes: number[] = [];
	for (let left = count; left > 0; left -= perBand) {
		sizes.push(Math.min(perBand, left));
	}
	return sizes;
}

/**
 * Column count of the grid preset. Each candidate is judged by its worst
 * tile: how far that tile's pixel aspect ratio is from the target. Judging
 * the worst one keeps a lone tile stretched over a whole band from hiding
 * behind well-shaped neighbours. Ties go to fewer empty cells, then to
 * fewer columns.
 */
function gridColumnCount(
	count: number,
	cols: number,
	width: number,
	height: number,
): number {
	const minTileHeightPx = MIN_TILE_ROWS * (GRID_ROW_HEIGHT + GRID_MARGIN);
	const offTarget = (tileWidth: number, tileHeight: number) =>
		Math.abs(Math.log(tileWidth / tileHeight / TARGET_TILE_ASPECT));
	const safeWidth = Math.max(1, width);
	let best = 1;
	let bestScore = Infinity;
	let bestEmpty = Infinity;
	const limit = Math.min(count, maxTilesPerBand(cols));
	for (let candidate = 1; candidate <= limit; candidate++) {
		const bands = Math.ceil(count / candidate);
		const lastBand = count - (bands - 1) * candidate;
		const tileHeight = Math.max(height / bands, minTileHeightPx);
		const score = Math.max(
			offTarget(safeWidth / candidate, tileHeight),
			offTarget(safeWidth / lastBand, tileHeight),
		);
		const empty = candidate * bands - count;
		const tied = Math.abs(score - bestScore) < 1e-9;
		if ((tied && empty < bestEmpty) || (!tied && score < bestScore)) {
			best = candidate;
			bestScore = score;
			bestEmpty = empty;
		}
	}
	return best;
}

/**
 * Focus preset: one large tile and the others in the remaining strip. On a
 * narrow grid the large tile sits on top and the others stack below it.
 */
function layoutFocus(count: number, cols: number, rowBudget: number): Cell[] {
	const others = count - 1;
	if (others === 0) {
		return [{ x: 0, y: 0, w: cols, h: Math.max(rowBudget, MIN_TILE_ROWS) }];
	}

	if (cols <= FOCUS_STACKED_MAX_COLS) {
		const wanted = Math.max(MIN_TILE_ROWS, Math.round((rowBudget * 2) / 3));
		const fits = rowBudget >= count * MIN_TILE_ROWS;
		const mainHeight = fits
			? Math.min(wanted, rowBudget - others * MIN_TILE_ROWS)
			: wanted;
		const heights = bandHeights(rowBudget - mainHeight, others);
		const cells: Cell[] = [{ x: 0, y: 0, w: cols, h: mainHeight }];
		let y = mainHeight;
		for (const h of heights) {
			cells.push({ x: 0, y, w: cols, h });
			y += h;
		}
		return cells;
	}

	// The strip keeps the minimum tile width; the large tile takes the rest.
	const mainWidth = Math.min(
		Math.round((cols * 2) / 3),
		cols - MIN_TILE_COLS,
	);
	const cells: Cell[] = [
		{ x: 0, y: 0, w: mainWidth, h: Math.max(rowBudget, MIN_TILE_ROWS) },
	];
	let y = 0;
	for (const h of bandHeights(rowBudget, others)) {
		cells.push({ x: mainWidth, y, w: cols - mainWidth, h });
		y += h;
	}
	return cells;
}

/**
 * Orders the widgets for a preset: reading order of the current layout
 * (top to bottom, then left to right), then the widgets that have no layout
 * item, in dashboard order. Layout items of widgets that no longer exist
 * are left out.
 */
function orderWidgets(
	widgetIds: readonly string[],
	layout: readonly LayoutItem[],
): { id: string; item: LayoutItem | undefined }[] {
	const known = new Set(widgetIds);
	const placed = new Map<string, LayoutItem>();
	for (const item of layout) {
		if (known.has(item.i) && !placed.has(item.i)) placed.set(item.i, item);
	}
	const ordered = Array.from(placed.values())
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map((item) => ({ id: item.i, item: item as LayoutItem | undefined }));
	for (const id of known) {
		if (!placed.has(id)) ordered.push({ id, item: undefined });
	}
	return ordered;
}

/**
 * Arranges every widget of one breakpoint with a preset.
 *
 * The result never overlaps, never exceeds the column count, and every tile
 * is at least {@link MIN_TILE_ROWS} tall. When the row budget can give every
 * tile that minimum the layout ends exactly on the budget; otherwise tiles
 * keep the minimum and the layout extends below it.
 *
 * Properties already on a layout item (`minW`, `static`, ...) are kept; only
 * `x`, `y`, `w` and `h` are rewritten.
 *
 * @param input Preset, widgets, current layout and container measurements.
 * @returns The new layout for that breakpoint, in reading order.
 */
export function arrangeGrid(input: ArrangeGridInput): LayoutItem[] {
	const { preset, widgetIds, layout, width, height } = input;
	const cols = Math.max(1, Math.floor(input.cols));
	const ordered = orderWidgets(widgetIds, layout);
	const count = ordered.length;
	if (count === 0) return [];

	const rowBudget = rowsForHeight(height);
	const perBandLimit = maxTilesPerBand(cols);

	let cells: Cell[];
	switch (preset) {
		case "rows":
			cells = layoutBands(fillBands(count, 1), cols, rowBudget);
			break;
		case "columns": {
			// Wrapped bands are balanced rather than filled, so no band is
			// left holding a single stretched tile.
			const bands = Math.ceil(count / perBandLimit);
			cells = layoutBands(
				fillBands(count, Math.ceil(count / bands)),
				cols,
				rowBudget,
			);
			break;
		}
		case "focus":
			cells = layoutFocus(count, cols, rowBudget);
			break;
		case "grid":
		default:
			cells = layoutBands(
				fillBands(count, gridColumnCount(count, cols, width, height)),
				cols,
				rowBudget,
			);
	}

	return ordered.map(({ id, item }, index) => {
		const cell = cells[index] ?? { x: 0, y: 0, w: cols, h: MIN_TILE_ROWS };
		return { ...item, i: id, ...cell };
	});
}
