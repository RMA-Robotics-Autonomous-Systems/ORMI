/**
 * Tab strip indicator: the DOM half. See `tab-indicator.ts` for what moves.
 *
 * Lifecycle of one tab selection:
 *
 * 1. `captureBeforeSelect(model, tabId)` runs from FlexLayout's `onAction`
 *    for a `SELECT_TAB`, before the selection is applied. It measures where
 *    the indicator is now: the old selected button, or where a running slide
 *    has got to.
 * 2. FlexLayout commits. The panel-motion probe it renders in every tabset
 *    calls `afterCommit`, which defers to a microtask (commit and
 *    FlexLayout's own measuring pass done, nothing painted yet).
 * 3. `flush` measures the new selected button, parks the stand-in on it and
 *    plays it from the old one with the Web Animations API, on the tab
 *    container's `::before`.
 *
 * Only a click selects a tab (FlexLayout's tab drag is an HTML5 drag, which
 * never fires `click`), so a tab drag never starts a slide; a `dragstart`
 * or a press on a splitter ends a running one at once, so neither ever runs
 * under the operator's pointer. At rest nothing is left behind: the data
 * attribute and the custom properties are removed when the slide ends.
 */

import { Model, TabNode, TabSetNode } from "flexlayout-react";

import {
	CAPTURE_MAX_AGE_MS,
	parseDurationMs,
	shouldAnimate,
} from "./panel-motion";
import { firstEasing, prefersReducedMotion } from "./panel-motion-controller";
import {
	planTabSlide,
	tabSlideKeyframes,
	visualTabRect,
	type TabRect,
} from "./tab-indicator";

/** Set on the tab container while its indicator slides (flex-layout-theme.css). */
export const TAB_SLIDE_ATTR = "data-ormi-tab-slide";

const TAB_CONTAINER = ".flexlayout__tabset_tabbar_inner_tab_container";
const SELECTED_BUTTON = ".flexlayout__tab_button--selected";
const SLIDE_PROPS = [
	"--ormi-tab-x",
	"--ormi-tab-y",
	"--ormi-tab-w",
	"--ormi-tab-h",
] as const;

interface PendingSlide {
	at: number;
	container: HTMLElement;
	from: TabRect;
	durationMs: number;
	easing: string;
}

interface RunningSlide {
	container: HTMLElement;
	to: TabRect;
	animation: Animation;
}

/**
 * A button's box in its container's padding-box coordinates, which is what
 * an absolutely positioned `::before` of the container is placed in.
 */
function rectIn(
	container: HTMLElement,
	el: Element | null,
): TabRect | undefined {
	if (!el) return undefined;
	const c = container.getBoundingClientRect();
	const r = el.getBoundingClientRect();
	return {
		x: r.left - c.left - container.clientLeft,
		y: r.top - c.top - container.clientTop,
		width: r.width,
		height: r.height,
	};
}

/**
 * Drives the tab strip indicator for one FlexLayout dashboard. Plain class:
 * it holds DOM handles and an animation, none of which is React state.
 */
export class TabIndicatorMotion {
	private area: HTMLElement | null = null;
	private pending: PendingSlide | null = null;
	private running: RunningSlide | null = null;
	private scheduled = false;

	/**
	 * Attach to the dashboard's panel area.
	 * @param area - The positioned element FlexLayout fills; it holds the
	 * hidden `.ormi-motion-metrics` element the timing tokens resolve on.
	 * @returns Detach function.
	 */
	attach(area: HTMLElement): () => void {
		this.area = area;
		const onDragStart = () => this.stop();
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest(".flexlayout__splitter")
			) {
				this.stop();
			}
		};
		area.addEventListener("dragstart", onDragStart, true);
		area.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			area.removeEventListener("dragstart", onDragStart, true);
			area.removeEventListener("pointerdown", onPointerDown, true);
			this.stop();
			this.area = null;
		};
	}

	/**
	 * Measure the indicator before a tab selection is applied.
	 * @param model - The model as it is on screen now.
	 * @param tabId - The tab about to be selected.
	 */
	captureBeforeSelect(model: Model, tabId: string): void {
		this.pending = null;
		const node = model.getNodeById(tabId);
		const tabset = node instanceof TabNode ? node.getParent() : undefined;
		if (!(tabset instanceof TabSetNode)) return;
		if (tabset.getSelectedNode() === node) return;

		const timing = this.readTiming();
		if (!timing || !shouldAnimate(timing, prefersReducedMotion())) {
			this.stop();
			return;
		}
		const container = this.area
			?.querySelector(
				`.flexlayout__tabset[data-layout-path="${tabset.getPath()}"]`,
			)
			?.querySelector<HTMLElement>(TAB_CONTAINER);
		if (!container) {
			this.stop();
			return;
		}

		let from: TabRect | undefined;
		const running = this.running;
		if (running?.container === container) {
			from = visualTabRect(
				running.to,
				getComputedStyle(container, "::before").transform,
			);
		} else {
			from = rectIn(container, container.querySelector(SELECTED_BUTTON));
		}
		this.stop();
		if (!from) return;
		this.pending = { at: performance.now(), container, from, ...timing };
	}

	/** Called from inside every FlexLayout commit (the panel-motion probe). */
	afterCommit(): void {
		if (!this.pending || this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(this.flush);
	}

	private flush = (): void => {
		this.scheduled = false;
		const pending = this.pending;
		this.pending = null;
		if (!pending) return;
		if (performance.now() - pending.at > CAPTURE_MAX_AGE_MS) return;
		const { container } = pending;
		if (!container.isConnected) return;
		const to = rectIn(container, container.querySelector(SELECTED_BUTTON));
		const slide = planTabSlide(pending.from, to);
		if (!slide || !to) return;

		container.style.setProperty("--ormi-tab-x", `${to.x}px`);
		container.style.setProperty("--ormi-tab-y", `${to.y}px`);
		container.style.setProperty("--ormi-tab-w", `${to.width}px`);
		container.style.setProperty("--ormi-tab-h", `${to.height}px`);
		container.setAttribute(TAB_SLIDE_ATTR, "");
		const animation = container.animate(tabSlideKeyframes(slide), {
			duration: pending.durationMs,
			easing: pending.easing,
			pseudoElement: "::before",
		});
		const running: RunningSlide = { container, to, animation };
		this.running = running;
		const end = () => {
			if (this.running === running) this.stop();
		};
		animation.onfinish = end;
		animation.oncancel = end;
	};

	/** End a running slide now, leaving the tab strip as it is at rest. */
	stop(): void {
		const running = this.running;
		if (!running) return;
		this.running = null;
		running.animation.cancel();
		running.container.removeAttribute(TAB_SLIDE_ATTR);
		for (const prop of SLIDE_PROPS) {
			running.container.style.removeProperty(prop);
		}
	}

	/**
	 * `--motion-base` and `--motion-ease`, resolved on the metrics element
	 * through `animation-duration` / `animation-timing-function` (a `calc()`
	 * over `--motion-duration` resolves only on a real property).
	 */
	private readTiming(): { durationMs: number; easing: string } | undefined {
		const metrics = this.area?.querySelector(".ormi-motion-metrics");
		if (!metrics) return undefined;
		const cs = getComputedStyle(metrics);
		return {
			durationMs: parseDurationMs(cs.animationDuration),
			easing: firstEasing(cs.animationTimingFunction),
		};
	}
}
