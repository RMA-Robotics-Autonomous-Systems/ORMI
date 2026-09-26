/**
 * Panel motion: the DOM half. See `panel-motion.ts` for what moves and why.
 *
 * Lifecycle of one layout change:
 *
 * 1. `captureBefore(model)` runs BEFORE the change is applied (FlexLayout's
 *    `onAction`, or just before the dashboard swaps in a rebuilt model). It
 *    reads the timing tokens (one computed-style read, and the only cost
 *    when motion is off), stops any running motion, and snapshots every
 *    tabset from the model's own rects, or from where a running motion has
 *    got to, so an interrupted change starts from what is on screen.
 * 2. FlexLayout commits the new layout. A probe that FlexLayout renders
 *    inside every tabset (`PanelMotionProbe`) calls `afterCommit`, which
 *    defers to a microtask: by then the commit and FlexLayout's own second
 *    pass (it positions tab content from rects it measures in layout
 *    effects) are both done, and nothing has been painted yet.
 * 3. `play` measures the new rects from the DOM, plans, and starts the
 *    animations on the real elements, so live widgets and WebGL canvases
 *    keep rendering throughout.
 *
 * FlexLayout measures its own containers with `getBoundingClientRect` in a
 * layout effect on every render, and a transform on a container would feed
 * those measurements (and so every tab's position) a mid-flight rect. So
 * whenever FlexLayout re-renders while motion is running, the probe detaches
 * the animation effects for the length of that commit (`effect.target =
 * null`) and reattaches them in a microtask. The animations keep their
 * timeline, FlexLayout measures the true layout, and nothing is painted in
 * between.
 */

import { Model, TabNode, TabSetNode } from "flexlayout-react";
import {
	CAPTURE_MAX_AGE_MS,
	arrivalScaleFrom,
	arriveKeyframes,
	isVisibleRect,
	moveGeometry,
	moveKeyframes,
	parseDurationMs,
	planLayoutMotion,
	shouldAnimate,
	visualRectAt,
	type FrameMetrics,
	type LayoutSnapshot,
	type MotionTiming,
	type PanelMotionPlan,
	type PanelRect,
} from "./panel-motion";

/** Class set on elements while they move (flex-layout-theme.css). */
export const PANEL_MOTION_CLASS = "ormi-panel-motion";

/** Default easing when `--motion-ease` does not resolve. */
const FALLBACK_EASING = "cubic-bezier(0.2, 0, 0, 1)";

interface RunningMotion {
	plan: Extract<PanelMotionPlan, { kind: "move" | "arrive" }> | undefined;
	arrivalScale: number;
	animations: Animation[];
	targets: Element[];
	lifted: Element[];
}

interface PendingCapture {
	at: number;
	before: LayoutSnapshot;
	timing: MotionTiming;
	metrics: FrameMetrics;
}

/** Numbers read from the computed style of the metrics element. */
interface ResolvedTokens {
	timing: MotionTiming;
	metrics: FrameMetrics;
}

function px(value: string): number {
	const n = Number.parseFloat(value);
	return Number.isFinite(n) ? n : 0;
}

function relativeRect(el: Element, origin: DOMRect): PanelRect {
	const r = el.getBoundingClientRect();
	return {
		x: r.left - origin.left,
		y: r.top - origin.top,
		width: r.width,
		height: r.height,
	};
}

/**
 * Drives panel motion for one FlexLayout dashboard. Plain class: it holds
 * DOM handles and animation objects, none of which is React state.
 */
export class PanelMotionController {
	private area: HTMLElement | null = null;
	private pending: PendingCapture | null = null;
	private running = new Map<string, RunningMotion>();
	private scheduled = false;
	private suspended = false;
	private model: Model | null = null;

	/**
	 * Attach to the dashboard's panel area. Any pointer press in it ends
	 * running motion at once (the operator acts on where things ARE, and a
	 * splitter or tab drag must start from the true layout), and a resize of
	 * the area does too: a window resize is never animated.
	 * @param area - The positioned element FlexLayout fills; it holds the
	 * hidden `.ormi-motion-metrics` element the timing tokens resolve on.
	 * @returns Detach function.
	 */
	attach(area: HTMLElement): () => void {
		this.area = area;
		const onPointerDown = () => {
			this.pending = null;
			this.stopAll();
		};
		area.addEventListener("pointerdown", onPointerDown, true);
		let lastW = -1;
		let lastH = -1;
		const observer =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver((entries) => {
						const box = entries[entries.length - 1]?.contentRect;
						if (!box) return;
						if (
							lastW >= 0 &&
							(box.width !== lastW || box.height !== lastH)
						) {
							this.pending = null;
							this.stopAll();
						}
						lastW = box.width;
						lastH = box.height;
					});
		observer?.observe(area);
		return () => {
			area.removeEventListener("pointerdown", onPointerDown, true);
			observer?.disconnect();
			this.pending = null;
			this.stopAll();
			this.area = null;
		};
	}

	/**
	 * Snapshot the layout before a change is applied.
	 * @param model - The model as it is on screen now.
	 */
	captureBefore(model: Model): void {
		const tokens = this.readTokens();
		if (!tokens || !shouldAnimate(tokens.timing, prefersReducedMotion())) {
			this.pending = null;
			this.stopAll();
			return;
		}
		const before = snapshotModel(model, (id, rect) => {
			const motion = this.running.get(id);
			const anim = motion?.animations[0];
			if (!motion?.plan || !anim) return rect;
			const progress = anim.effect?.getComputedTiming().progress;
			return visualRectAt(
				motion.plan,
				typeof progress === "number" ? progress : 1,
				motion.arrivalScale,
			);
		});
		this.stopAll();
		this.pending = {
			at: performance.now(),
			before,
			timing: tokens.timing,
			metrics: tokens.metrics,
		};
	}

	/**
	 * Called from inside every FlexLayout commit (the probe's layout effect).
	 * Plays a pending capture, or shields FlexLayout's measurements from
	 * running motion for the length of the commit.
	 * @param model - The model being rendered.
	 */
	afterCommit(model: Model): void {
		this.model = model;
		if (this.scheduled) return;
		if (this.pending) {
			this.scheduled = true;
			queueMicrotask(this.flush);
			return;
		}
		if (this.running.size > 0 && !this.suspended) {
			this.suspended = true;
			for (const motion of this.running.values()) {
				for (const anim of motion.animations) {
					if (anim.effect instanceof KeyframeEffect)
						anim.effect.target = null;
				}
			}
			this.scheduled = true;
			queueMicrotask(this.flush);
		}
	}

	/** Microtask after a commit: resume shielded motion, then play. */
	private flush = (): void => {
		this.scheduled = false;
		if (this.suspended) {
			this.suspended = false;
			for (const motion of this.running.values()) {
				motion.animations.forEach((anim, i) => {
					const target = motion.targets[i];
					if (anim.effect instanceof KeyframeEffect && target) {
						anim.effect.target = target;
					}
				});
			}
		}
		const pending = this.pending;
		this.pending = null;
		if (!pending || !this.model) return;
		if (performance.now() - pending.at > CAPTURE_MAX_AGE_MS) return;
		this.play(this.model, pending);
	};

	private play(model: Model, pending: PendingCapture): void {
		const t0 = performance.now();
		const layoutRoot = this.area?.querySelector<HTMLElement>(
			".flexlayout__layout",
		);
		if (!layoutRoot) return;
		const origin = layoutRoot.getBoundingClientRect();

		const elements = new Map<
			string,
			{ container: HTMLElement; tab?: HTMLElement; tabRect?: PanelRect }
		>();
		const after = snapshotModel(model, (id, _rect, node) => {
			const tabset = layoutRoot.querySelector<HTMLElement>(
				`.flexlayout__tabset[data-layout-path="${node.getPath()}"]`,
			);
			const container = tabset?.parentElement;
			if (!tabset || !container)
				return { x: 0, y: 0, width: 0, height: 0 };
			const rect = relativeRect(container, origin);
			const selected = node.getSelectedNode();
			const tab =
				selected instanceof TabNode
					? findTabElement(layoutRoot, selected)
					: undefined;
			const content = tabset.querySelector(".flexlayout__tabset_content");
			elements.set(id, {
				container,
				tab,
				tabRect: content ? relativeRect(content, origin) : undefined,
			});
			return rect;
		});

		const plans = planLayoutMotion(pending.before, after);
		const { timing, metrics } = pending;
		const held: Animation[] = [];
		const options: KeyframeAnimationOptions = {
			duration: timing.durationMs,
			easing: timing.easing,
			fill: "backwards",
		};
		for (const plan of plans) {
			const el = elements.get(plan.tabsetId);
			if (!el) continue;
			const motion: RunningMotion = {
				plan: plan.kind === "tab-arrive" ? undefined : plan,
				arrivalScale: timing.arrivalScale,
				animations: [],
				targets: [],
				lifted: [],
			};
			const run = (target: Element, frames: Keyframe[]) => {
				const anim = target.animate(frames, options);
				// Held at the start pose; `startHeld` sets the clock going.
				anim.pause();
				held.push(anim);
				motion.animations.push(anim);
				motion.targets.push(target);
			};
			if (plan.kind === "move") {
				const frames = moveKeyframes(
					moveGeometry(plan.from, plan.to),
					metrics,
				);
				run(el.container, frames.container);
				if (el.tab) run(el.tab, frames.tab);
				motion.lifted.push(el.container);
				if (el.tab) motion.lifted.push(el.tab);
			} else if (plan.kind === "arrive") {
				run(
					el.container,
					arriveKeyframes(plan.to, plan.origin, timing.arrivalScale),
				);
				if (el.tab && el.tabRect) {
					run(
						el.tab,
						arriveKeyframes(
							el.tabRect,
							plan.origin,
							timing.arrivalScale,
						),
					);
				}
				motion.lifted.push(el.container);
				if (el.tab) motion.lifted.push(el.tab);
			} else if (el.tab && el.tabRect) {
				const centre = {
					x: el.tabRect.x + el.tabRect.width / 2,
					y: el.tabRect.y + el.tabRect.height / 2,
				};
				run(
					el.tab,
					arriveKeyframes(el.tabRect, centre, timing.arrivalScale),
				);
			}
			if (motion.animations.length === 0) continue;
			for (const lifted of motion.lifted)
				lifted.classList.add(PANEL_MOTION_CLASS);
			this.running.set(plan.tabsetId, motion);
			const last = motion.animations[motion.animations.length - 1]!;
			last.onfinish = () => {
				if (this.running.get(plan.tabsetId) === motion) {
					this.release(plan.tabsetId, motion);
				}
			};
		}
		startHeld(held);
		if (plans.length > 0 && typeof performance.measure === "function") {
			performance.measure("ormi:panel-motion", {
				start: t0,
				end: performance.now(),
				detail: { panels: plans.length },
			});
		}
	}

	/** End every running motion now, at its final state. */
	stopAll(): void {
		for (const [id, motion] of this.running) {
			for (const anim of motion.animations) anim.cancel();
			this.release(id, motion);
		}
		this.suspended = false;
	}

	private release(id: string, motion: RunningMotion): void {
		for (const el of motion.lifted) el.classList.remove(PANEL_MOTION_CLASS);
		this.running.delete(id);
	}

	/**
	 * Resolve the tokens on the metrics element: one computed-style read.
	 * `--motion-layout` is a `calc()` over `--motion-duration`, which only a
	 * real property resolves, hence `transition-duration` rather than
	 * reading the custom property's text.
	 */
	private readTokens(): ResolvedTokens | undefined {
		const metricsEl = this.area?.querySelector(".ormi-motion-metrics");
		if (!metricsEl) return undefined;
		const cs = getComputedStyle(metricsEl);
		const durationMs = parseDurationMs(cs.transitionDuration);
		return {
			timing: {
				durationMs,
				easing: firstEasing(cs.transitionTimingFunction),
				arrivalScale: arrivalScaleFrom(Number.parseFloat(cs.opacity)),
			},
			metrics: {
				margin: px(cs.marginLeft),
				radius: px(cs.borderTopLeftRadius),
				innerRadius: px(cs.borderTopRightRadius),
			},
		};
	}
}

/**
 * Start held animations one frame late. The frame right after a layout
 * change is the expensive one: every resized widget reflows, canvases
 * reallocate, a 3D scene re-renders at its new size (150 ms measured for a
 * maximised scene on the dev build). Started with the commit, the motion's
 * clock runs through that frame and most of it is never seen. Held at the
 * start pose until the frame after it, the operator sees all of it; the
 * cost is one frame of latency, during which the panel shows where it was.
 * @param held - Paused animations, at currentTime 0.
 */
function startHeld(held: Animation[]): void {
	if (held.length === 0) return;
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			for (const anim of held) {
				// Cancelled meanwhile (interrupted, pointer press, resize).
				if (anim.playState === "paused") anim.play();
			}
		}),
	);
}

/** First entry of a computed timing-function list (commas live inside the parens). */
function firstEasing(value: string | undefined): string {
	if (!value) return FALLBACK_EASING;
	let depth = 0;
	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		if (c === "(") depth++;
		else if (c === ")") depth--;
		else if (c === "," && depth === 0) return value.slice(0, i).trim();
	}
	return value.trim() || FALLBACK_EASING;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function findTabElement(
	layoutRoot: HTMLElement,
	tab: TabNode,
): HTMLElement | undefined {
	const parent = tab.getMoveableElement()?.parentElement;
	if (parent?.classList.contains("flexlayout__tab")) return parent;
	return (
		layoutRoot.querySelector<HTMLElement>(
			`.flexlayout__tab[data-layout-path="${tab.getPath()}"]`,
		) ?? undefined
	);
}

/**
 * Snapshot the main window's tabsets.
 * @param model - The model.
 * @param rectOf - Resolves a tabset's rect (from the model, or measured).
 * @returns The snapshot.
 */
function snapshotModel(
	model: Model,
	rectOf: (id: string, modelRect: PanelRect, node: TabSetNode) => PanelRect,
): LayoutSnapshot {
	const snapshot: LayoutSnapshot = {
		tabsets: new Map(),
		tabOwner: new Map(),
	};
	model.visitWindowNodes(Model.MAIN_WINDOW_ID, (node) => {
		if (node instanceof TabSetNode) {
			const r = node.getRect();
			const id = node.getId();
			const rect = rectOf(
				id,
				{ x: r.x, y: r.y, width: r.width, height: r.height },
				node,
			);
			const selected = node.getSelectedNode();
			snapshot.tabsets.set(id, {
				rect: isVisibleRect(rect)
					? rect
					: { x: 0, y: 0, width: 0, height: 0 },
				selectedTabId: selected?.getId(),
			});
		} else if (node instanceof TabNode) {
			const parent = node.getParent();
			if (parent instanceof TabSetNode) {
				snapshot.tabOwner.set(node.getId(), parent.getId());
			}
		}
	});
	return snapshot;
}
