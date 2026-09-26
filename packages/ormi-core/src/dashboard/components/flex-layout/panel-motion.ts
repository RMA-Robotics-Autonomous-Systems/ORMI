/**
 * Panel motion: the pure half.
 *
 * A layout change (a widget routed in, a panel closed, a split, maximise,
 * a tab dragged elsewhere) is animated by FLIP on the real elements: the
 * panels are measured before the change, the change is committed, and each
 * panel is played from where it was to where it is with the Web Animations
 * API. Never the View Transitions API, which snapshots the page and freezes
 * every canvas and live value for the length of the transition.
 *
 * Only `transform`, `opacity` and `clip-path` are animated. A panel's
 * content is laid out ONCE, at its final size; the size change is shown by a
 * clip on the trailing edges, and the position change by a translate, so no
 * widget reflows per frame and nothing is scaled out of shape. The only
 * scale is the arrival one (a couple of percent), which is not perceptible
 * as distortion.
 *
 * Everything here is pure and unit-tested (`__tests__/panel-motion.test.ts`);
 * the DOM half is `panel-motion-controller.ts`.
 */

import { Actions } from "flexlayout-react";

/** A rectangle in layout-root coordinates (FlexLayout's own frame). */
export interface PanelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Sub-pixel differences are measurement noise, not a layout change. */
export const RECT_EPSILON = 0.5;

/**
 * A pending "before" capture older than this is stale and dropped: the
 * commit it was waiting for never came (the action was refused, or the
 * dashboard emptied), and replaying it later would animate a change the
 * operator did not just make.
 */
export const CAPTURE_MAX_AGE_MS = 1000;

/**
 * Whether two rects are the same within {@link RECT_EPSILON}.
 * @param a - First rect.
 * @param b - Second rect.
 * @returns True when every edge agrees.
 */
export function rectsEqual(a: PanelRect, b: PanelRect): boolean {
	return (
		Math.abs(a.x - b.x) <= RECT_EPSILON &&
		Math.abs(a.y - b.y) <= RECT_EPSILON &&
		Math.abs(a.width - b.width) <= RECT_EPSILON &&
		Math.abs(a.height - b.height) <= RECT_EPSILON
	);
}

/**
 * Whether a rect is on screen. FlexLayout keeps hidden tabsets (the others
 * while one is maximised) in the tree with `display: none`, which measures
 * as a zero-size rect.
 * @param rect - Rect to test.
 * @returns True when it has an area.
 */
export function isVisibleRect(rect: PanelRect | undefined): rect is PanelRect {
	return !!rect && rect.width > 0 && rect.height > 0;
}

const ANIMATED_ACTIONS: ReadonlySet<string> = new Set([
	Actions.ADD_NODE,
	Actions.MOVE_NODE,
	Actions.DELETE_TAB,
	Actions.DELETE_TABSET,
	Actions.MAXIMIZE_TOGGLE,
]);

/**
 * Whether a FlexLayout action is a layout change that gets motion.
 *
 * `ADJUST_WEIGHTS` / `ADJUST_BORDER_SPLIT` are what a splitter drag commits,
 * and a splitter follows the pointer 1:1: animating it, during or after the
 * drag, would put the panel somewhere the operator did not drop it. Tab
 * selection, renames and attribute updates move nothing.
 * @param type - `Action.type`.
 * @returns True when the action should be animated.
 */
export function isAnimatedLayoutAction(type: string): boolean {
	return ANIMATED_ACTIONS.has(type);
}

/** Motion parameters resolved from the theme tokens. */
export interface MotionTiming {
	/** `--motion-layout`, in ms. 0 means no motion at all. */
	durationMs: number;
	/** `--motion-ease`, as a CSS easing string. */
	easing: string;
	/** The scale a newly arrived panel grows from. */
	arrivalScale: number;
}

/**
 * Parse a computed `transition-duration` (`"0.216s"`, `"216ms"`, or a list,
 * of which the first entry counts).
 * @param value - Computed duration string.
 * @returns Milliseconds, or 0 when unparsable or negative.
 */
export function parseDurationMs(value: string | null | undefined): number {
	if (!value) return 0;
	const first = value.split(",")[0]?.trim() ?? "";
	const match = /^(-?[\d.]+(?:e-?\d+)?)(ms|s)$/i.exec(first);
	if (!match) return 0;
	const n = Number.parseFloat(match[1]!);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return match[2]!.toLowerCase() === "s" ? n * 1000 : n;
}

/**
 * The scale a panel arrives from. `--motion-scale` is what an overlay enters
 * from (the centre of a small surface); a panel enters from an edge and is
 * much larger, so it takes twice the offset to read at all, bounded so a
 * mistyped token cannot make it balloon or vanish.
 * @param motionScale - `--motion-scale`, or NaN when unset.
 * @returns A scale in [0.9, 1].
 */
export function arrivalScaleFrom(motionScale: number): number {
	const s = Number.isFinite(motionScale) ? motionScale : 0.98;
	return Math.min(1, Math.max(0.9, 1 - 2 * (1 - s)));
}

/**
 * The skip rule: no motion at 0 ms (amber, tactical, reduced motion) and no
 * motion when the operator asked the OS for less, whatever a preset says.
 * @param timing - Resolved timing.
 * @param reducedMotion - `prefers-reduced-motion: reduce`.
 * @returns True when a layout change should be animated.
 */
export function shouldAnimate(
	timing: Pick<MotionTiming, "durationMs">,
	reducedMotion: boolean,
): boolean {
	return !reducedMotion && timing.durationMs > 0;
}

/**
 * How a panel that stayed on screen travels from its old rect to its new
 * one. The element is already at its NEW rect (laid out once, final size);
 * it is offset by `(tx, ty)` and its trailing edges clipped by
 * `(clipRight, clipBottom)`, and both play to zero.
 *
 * The leading (top-left) corner always carries the panel, because that is
 * where the tab strip and the panel's title are: anchoring anywhere else
 * hides the title while an edge sweeps. A dimension that grows is revealed
 * by the clip; a dimension that shrinks takes its new size at once (content
 * cannot be shown larger than it is laid out without scaling it) while the
 * translate still carries its corner over, so a panel pushed aside by a new
 * one slides over to make room.
 */
export interface MoveGeometry {
	tx: number;
	ty: number;
	clipRight: number;
	clipBottom: number;
}

/**
 * Compute the FLIP inversion for a panel that moved and/or resized.
 * @param from - Rect before the change.
 * @param to - Rect after the change (where the element is laid out).
 * @returns The offsets and clips to play to zero.
 */
export function moveGeometry(from: PanelRect, to: PanelRect): MoveGeometry {
	return {
		tx: from.x - to.x,
		ty: from.y - to.y,
		clipRight: Math.max(0, to.width - from.width),
		clipBottom: Math.max(0, to.height - from.height),
	};
}

/**
 * Whether a move geometry plays nothing (every offset and clip within
 * {@link RECT_EPSILON}).
 * @param g - Move geometry.
 * @returns True when there is nothing to animate.
 */
export function isNoopMove(g: MoveGeometry): boolean {
	return (
		Math.abs(g.tx) <= RECT_EPSILON &&
		Math.abs(g.ty) <= RECT_EPSILON &&
		g.clipRight <= RECT_EPSILON &&
		g.clipBottom <= RECT_EPSILON
	);
}

/** A point in layout-root coordinates. */
export interface PanelPoint {
	x: number;
	y: number;
}

/** One panel's planned motion. */
export type PanelMotionPlan =
	| {
			kind: "move";
			tabsetId: string;
			from: PanelRect;
			to: PanelRect;
	  }
	| {
			/** A tabset that was not on screen before: grows in from `origin`. */
			kind: "arrive";
			tabsetId: string;
			to: PanelRect;
			origin: PanelPoint;
	  }
	| {
			/**
			 * The tabset stayed put but now shows a tab that was not in it
			 * before (a widget stacked into it, or a tab dragged in): only
			 * that tab's content grows in, from its centre.
			 */
			kind: "tab-arrive";
			tabsetId: string;
			tabId: string;
	  };

/** What the plan needs to know about one tabset. */
export interface TabsetSnapshot {
	rect: PanelRect;
	/** The selected (visible) tab, if any. */
	selectedTabId?: string;
}

/** The layout at one instant, as far as motion is concerned. */
export interface LayoutSnapshot {
	tabsets: Map<string, TabsetSnapshot>;
	/** Every tab in a tabset, and the tabset holding it. */
	tabOwner: Map<string, string>;
}

/**
 * Where a new panel grows in from: the midpoint of the edge it shares with
 * the panel it was split from (a panel that used to cover its space and
 * still sits beside it), or its centre when there is no such neighbour.
 * @param target - The new panel's rect.
 * @param neighbours - Panels on screen before AND after, as before/after pairs.
 * @returns The origin, in layout-root coordinates.
 */
export function arrivalOrigin(
	target: PanelRect,
	neighbours: ReadonlyArray<{ before: PanelRect; after: PanelRect }>,
): PanelPoint {
	const centre = {
		x: target.x + target.width / 2,
		y: target.y + target.height / 2,
	};
	let best: { area: number; origin: PanelPoint } | undefined;
	for (const { before, after } of neighbours) {
		const area = overlapArea(before, target);
		if (area <= 0) continue;
		const origin = sharedEdgeMidpoint(target, after);
		if (!origin) continue;
		if (!best || area > best.area) best = { area, origin };
	}
	return best?.origin ?? centre;
}

/** Edge contact tolerance: containers touch exactly, give or take rounding. */
const EDGE_TOLERANCE = 2;

function overlapArea(a: PanelRect, b: PanelRect): number {
	const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
	const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
	return w > 0 && h > 0 ? w * h : 0;
}

function sharedEdgeMidpoint(
	target: PanelRect,
	other: PanelRect,
): PanelPoint | undefined {
	const tRight = target.x + target.width;
	const tBottom = target.y + target.height;
	const oRight = other.x + other.width;
	const oBottom = other.y + other.height;
	const yLo = Math.max(target.y, other.y);
	const yHi = Math.min(tBottom, oBottom);
	const xLo = Math.max(target.x, other.x);
	const xHi = Math.min(tRight, oRight);
	if (yHi > yLo) {
		if (Math.abs(oRight - target.x) <= EDGE_TOLERANCE)
			return { x: target.x, y: (yLo + yHi) / 2 };
		if (Math.abs(other.x - tRight) <= EDGE_TOLERANCE)
			return { x: tRight, y: (yLo + yHi) / 2 };
	}
	if (xHi > xLo) {
		if (Math.abs(oBottom - target.y) <= EDGE_TOLERANCE)
			return { x: (xLo + xHi) / 2, y: target.y };
		if (Math.abs(other.y - tBottom) <= EDGE_TOLERANCE)
			return { x: (xLo + xHi) / 2, y: tBottom };
	}
	return undefined;
}

/**
 * Decide which panels animate, and how, from two snapshots.
 *
 * A tabset visible in both with a different rect moves; one visible only
 * after arrives; one visible only before is gone (it simply vanishes, and
 * its neighbours' own moves fill the space). A tabset whose rect did not
 * change animates only if it now shows a tab that came from elsewhere.
 * @param before - Snapshot taken before the change.
 * @param after - Snapshot taken after the commit.
 * @returns One plan per animated tabset.
 */
export function planLayoutMotion(
	before: LayoutSnapshot,
	after: LayoutSnapshot,
): PanelMotionPlan[] {
	const plans: PanelMotionPlan[] = [];
	const neighbours: { before: PanelRect; after: PanelRect }[] = [];
	for (const [id, a] of after.tabsets) {
		const b = before.tabsets.get(id);
		if (isVisibleRect(a.rect) && isVisibleRect(b?.rect)) {
			neighbours.push({ before: b.rect, after: a.rect });
		}
	}

	for (const [id, a] of after.tabsets) {
		if (!isVisibleRect(a.rect)) continue;
		const b = before.tabsets.get(id);
		if (!isVisibleRect(b?.rect)) {
			plans.push({
				kind: "arrive",
				tabsetId: id,
				to: a.rect,
				origin: arrivalOrigin(a.rect, neighbours),
			});
			continue;
		}
		if (!rectsEqual(b.rect, a.rect)) {
			// A panel that only shrank away from a held corner has nothing to
			// play: its size snaps by design and its corner did not move.
			if (!isNoopMove(moveGeometry(b.rect, a.rect))) {
				plans.push({
					kind: "move",
					tabsetId: id,
					from: b.rect,
					to: a.rect,
				});
			}
			continue;
		}
		const tab = a.selectedTabId;
		if (
			tab !== undefined &&
			tab !== b.selectedTabId &&
			before.tabOwner.get(tab) !== id
		) {
			plans.push({ kind: "tab-arrive", tabsetId: id, tabId: tab });
		}
	}
	return plans;
}

/**
 * Where a panel is on screen part-way through its motion, so a change that
 * interrupts it starts from what the operator is looking at rather than
 * from either end.
 * @param plan - The running plan (`move` or `arrive`).
 * @param progress - Eased progress in [0, 1] (`getComputedTiming().progress`).
 * @param arrivalScale - The scale an arrival started from.
 * @returns The visible rect.
 */
export function visualRectAt(
	plan: Extract<PanelMotionPlan, { kind: "move" | "arrive" }>,
	progress: number,
	arrivalScale: number,
): PanelRect {
	const p = Math.min(1, Math.max(0, progress));
	const r = 1 - p;
	if (plan.kind === "move") {
		const g = moveGeometry(plan.from, plan.to);
		return {
			x: plan.to.x + g.tx * r,
			y: plan.to.y + g.ty * r,
			width: plan.to.width - g.clipRight * r,
			height: plan.to.height - g.clipBottom * r,
		};
	}
	const s = arrivalScale + (1 - arrivalScale) * p;
	const o = plan.origin;
	return {
		x: o.x + (plan.to.x - o.x) * s,
		y: o.y + (plan.to.y - o.y) * s,
		width: plan.to.width * s,
		height: plan.to.height * s,
	};
}

/** Lengths the keyframes need, resolved from the theme. */
export interface FrameMetrics {
	/** Half the frame gutter: the tabset's margin inside its container. */
	margin: number;
	/** `--panel-radius`. */
	radius: number;
	/** The panel's inner radius (radius minus border width). */
	innerRadius: number;
}

/**
 * Keyframes for a moving panel's two elements.
 *
 * The container (the rect FlexLayout measures) carries half a gutter of
 * margin around the visible panel, so its clip is pushed in by that margin
 * wherever an edge is being revealed: the cut then sits where the panel's
 * old edge was, with the panel's own rounded corner. The tab content is the
 * panel's inner box, so its clip is the raw size delta. Both edges move in
 * lockstep, one border-width apart, as they do at rest.
 * @param g - Move geometry.
 * @param m - Frame metrics.
 * @returns Keyframe pairs for the container and the tab content.
 */
export function moveKeyframes(
	g: MoveGeometry,
	m: FrameMetrics,
): { container: Keyframe[]; tab: Keyframe[] } {
	const translate = `translate(${g.tx}px, ${g.ty}px)`;
	const cRight = g.clipRight > 0 ? g.clipRight + m.margin : 0;
	const cBottom = g.clipBottom > 0 ? g.clipBottom + m.margin : 0;
	const cRightEnd = g.clipRight > 0 ? m.margin : 0;
	const cBottomEnd = g.clipBottom > 0 ? m.margin : 0;
	const cRound = `round ${m.radius}px`;
	const tRound = `round 0 0 ${m.innerRadius}px ${m.innerRadius}px`;
	return {
		container: [
			{
				transform: translate,
				clipPath: `inset(0px ${cRight}px ${cBottom}px 0px ${cRound})`,
			},
			{
				transform: "translate(0px, 0px)",
				clipPath: `inset(0px ${cRightEnd}px ${cBottomEnd}px 0px ${cRound})`,
			},
		],
		tab: [
			{
				transform: translate,
				clipPath: `inset(0px ${g.clipRight}px ${g.clipBottom}px 0px ${tRound})`,
			},
			{
				transform: "translate(0px, 0px)",
				clipPath: `inset(0px 0px 0px 0px ${tRound})`,
			},
		],
	};
}

/**
 * Keyframes for an element growing in from an absolute origin.
 * @param element - The element's own rect (layout-root coordinates).
 * @param origin - The arrival origin (layout-root coordinates).
 * @param scale - The scale it grows from.
 * @returns A keyframe pair.
 */
export function arriveKeyframes(
	element: PanelRect,
	origin: PanelPoint,
	scale: number,
): Keyframe[] {
	const transformOrigin = `${origin.x - element.x}px ${origin.y - element.y}px`;
	return [
		{ opacity: 0, transform: `scale(${scale})`, transformOrigin },
		{ opacity: 1, transform: "scale(1)", transformOrigin },
	];
}
