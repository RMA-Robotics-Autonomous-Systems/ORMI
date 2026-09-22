/**
 * What the shared time window is doing, as three modes rather than two numbers.
 *
 * An absolute `{t0, t1}` window can say where the operator is looking but not
 * what should happen when a sample arrives, and a live cockpit needs both. A
 * window pinned by any zoom never re-anchors, so on a growing run every new
 * sample lands off the right edge and the operator concludes the panel stopped
 * updating. Nullability hid the problem rather than solving it: `null` meaning
 * "the whole run" only *incidentally* followed the live edge, because the extent
 * it resolved against happened to widen.
 *
 * So the state is a discriminated union over the intent — "the whole run",
 * "riding the newest sample" and "pinned here" are three different answers, and
 * a consumer cannot reach the numbers without saying which one it is handling.
 *
 * Everything here is pure: no React, no jotai, no DOM. `resolveWindow` and
 * `applyGesture` are the two predicates the whole cockpit's time behaviour rests
 * on, and predicates of this kind fail silently — hence
 * `__tests__/emi-view.test.ts`.
 */

/** What the shared time window is currently doing. */
export type EmiView =
	/** The whole run, widening as it grows. */
	| { readonly mode: "full" }
	/** Glued to the newest sample, showing `width` seconds behind it. */
	| { readonly mode: "follow"; readonly width: number }
	/** Held at an absolute window, whatever arrives. */
	| { readonly mode: "pinned"; readonly t0: number; readonly t1: number };

/** The opening view: the whole run. */
export const EMI_VIEW_FULL: EmiView = { mode: "full" };

/** Widest zoom-in, as a fraction of the whole run. */
export const MIN_VIEW_FRACTION = 0.0025;

/** Fraction of the visible window one wheel notch scrubs sideways. */
export const WHEEL_PAN_FRACTION = 0.0015;

/**
 * Visible fraction of the run at which a window counts as the whole thing.
 *
 * Zooming out lands on floating-point noise rather than exactly on the span, and
 * a window 0.9999 of the run wide is "the whole run" to everyone except a
 * comparison against `span`.
 */
export const FULL_SPAN_FRACTION = 0.999;

/** The window a view resolves to against a given extent. */
export interface ResolvedWindow {
	/** Left edge, seconds from run start. */
	readonly t0: number;
	/** Right edge. */
	readonly t1: number;
	/**
	 * The mode this came from, verbatim.
	 *
	 * Reported rather than re-derived, and with **no accompanying booleans**: a
	 * `full` flag beside a `following` flag is two answers that can disagree,
	 * which is the failure this consolidation removes. `full` is
	 * `mode === "full"`; the Follow control is lit when `mode !== "pinned"`.
	 */
	readonly mode: EmiView["mode"];
}

/**
 * The one place three modes become two numbers.
 *
 * **The resolver clamps; the state remembers the intent.** `follow{width: 60}`
 * on a 30 s run resolves to the whole 30 s now and to 60 s once the run is
 * longer — the state is never normalised into `full` on its behalf, because the
 * operator asked for a minute and the run will get there.
 *
 * The minimum zoom is {@link applyGesture}'s rule, not this function's: a window
 * narrower than {@link MIN_VIEW_FRACTION} cannot be produced by a gesture, and
 * silently widening one here would make the resolver disagree with the state it
 * was handed.
 *
 * @param view - The current intent.
 * @param extent - `[first, last]` sample time of the run, seconds.
 * @returns The window to draw, and the mode it came from.
 */
export function resolveWindow(
	view: EmiView,
	extent: readonly [number, number],
): ResolvedWindow {
	const [f0, f1] = extent;
	const span = f1 - f0;
	// Nothing to divide up. Every mode shows what there is.
	if (!(span > 0)) return { t0: f0, t1: f1, mode: view.mode };

	switch (view.mode) {
		case "full":
			return { t0: f0, t1: f1, mode: "full" };
		case "follow": {
			const width = Math.min(Math.max(view.width, 0), span);
			return { t0: f1 - width, t1: f1, mode: "follow" };
		}
		case "pinned": {
			const width = Math.min(Math.max(view.t1 - view.t0, 0), span);
			const t0 = Math.min(Math.max(view.t0, f0), f1 - width);
			return { t0, t1: t0 + width, mode: "pinned" };
		}
	}
}

/** Where a gesture points, for a gesture that has somewhere to point. */
export interface ZoomAnchor {
	/** The time to hold still, seconds. */
	t: number;
	/** Where across the new window it should sit, 0 at the left edge. */
	fraction: number;
}

/**
 * A gesture as **intent**.
 *
 * `width`, the anchor and `t0` are *unclamped requests*. That is the whole
 * point: whether a gesture re-arms follow is decided from what the operator
 * asked for, and a request already clamped into the run can no longer say that
 * it reached past the end.
 */
export type ViewGesture =
	/**
	 * Show `width` seconds.
	 *
	 * `anchor` is present when the gesture named a place — a wheel is over a
	 * sample, and that sample stays under the pointer. It is **absent for a
	 * button**, which has no pointer and so has nothing honest to name; the
	 * reducer then derives the anchor from the mode
	 * ({@link zoomAnchorFor}). Absent is a real answer, not a default the
	 * caller withheld, which is why it is optional rather than a value every
	 * caller invents and the reducer overrides.
	 */
	| {
			kind: "zoomTo";
			width: number;
			anchor?: ZoomAnchor;
	  }
	/** Put the left edge at `t0`, keeping the current width. */
	| { kind: "panTo"; t0: number }
	/** Back to the whole run. */
	| { kind: "reset" }
	/** Jump to the newest sample and stay on it. */
	| { kind: "follow" }
	/** Stop following: hold the window that is on screen now. */
	| { kind: "pin" };

/** A requested width, held between the minimum zoom and the whole run. */
const clampWidth = (width: number, span: number): number =>
	Math.min(span, Math.max(span * MIN_VIEW_FRACTION, width));

/**
 * Where a zoom with no stated place should anchor, from the mode alone.
 *
 * A button has no pointer, so it anchors on whatever the operator is
 * demonstrably attending to. At the live edge — `full` or `follow` — that is the
 * newest sample, which is also what makes "zooming starts following" true with
 * no special case. Away from it, in `pinned`, it is the window they placed: the
 * centre, in **both** directions.
 *
 * Deriving it from the mode rather than from the direction of the zoom is the
 * point. Anchoring a pinned zoom on `f1` would send an operator studying a
 * detection mid-run to the end of the survey the moment they pressed zoom-out
 * for context — the window sliding out from under them, which is exactly the
 * failure detach-on-pan exists to prevent.
 *
 * @param view - The current intent.
 * @param extent - `[first, last]` sample time of the run, seconds.
 * @returns The anchor to use for an unanchored zoom.
 */
export function zoomAnchorFor(
	view: EmiView,
	extent: readonly [number, number],
): ZoomAnchor {
	if (view.mode === "pinned") {
		const cur = resolveWindow(view, extent);
		return { t: (cur.t0 + cur.t1) / 2, fraction: 0.5 };
	}
	return { t: extent[1], fraction: 1 };
}

/**
 * The next view state — the only place detach and re-arm are decided.
 *
 * Deliberately not in the gesture handlers: five consumers read the window and
 * only the handlers write it, so the handlers are exactly where these rules
 * would drift apart. The complete rule set is four lines:
 *
 * 1. Every zoom resolves to an explicit anchor — the one the gesture stated, or
 *    the one its mode implies ({@link zoomAnchorFor}). Nothing is guessed from
 *    the direction of the zoom.
 * 2. Any gesture whose **unclamped** request reaches or passes `f1` resolves to
 *    `follow`.
 * 3. Otherwise it resolves to `pinned`.
 * 4. Zooming out to `width >= span * FULL_SPAN_FRACTION` resolves to `full`, and
 *    so does `reset`.
 *
 * **Rule 2 has no tolerance, and that is the subtle part.** `resolveWindow`'s
 * pinned clamp already forces `t0 <= f1 - width`, so a pinned window dragged to
 * the end sits at `t1 === f1` and then drifts left as the extent widens.
 * Deciding from the *resolved* window against `f1 - ε` cannot work: an ε large
 * enough to survive one commit's worth of samples is source-rate dependent, and
 * it would re-arm a window an operator deliberately pinned at the end of a
 * finished recording. `requestedT1 >= f1` is exact, frame-rate independent and
 * source-rate independent, and it means "the operator asked for more than
 * exists", whose only honest answer is to follow. A drag that stops one pixel
 * short asks for `t1 < f1` and stays pinned — they stopped short on purpose.
 *
 * Nothing here looks at `EmiRun.source`. A bag is not the opposite of live —
 * "a recording presented as a live source" is this plugin's defining move — and
 * the only thing that matters is whether the extent grows, which the extent
 * already says. On a drained bag `follow` resolves to a window at the end that
 * never moves: inert, harmless, free.
 *
 * @param view - The current intent.
 * @param extent - `[first, last]` sample time of the run, seconds.
 * @param g - The gesture, with unclamped requests.
 * @returns The next intent; the same object when nothing changed.
 */
export function applyGesture(
	view: EmiView,
	extent: readonly [number, number],
	g: ViewGesture,
): EmiView {
	const [f0, f1] = extent;
	const span = f1 - f0;
	if (!(span > 0)) return view;

	switch (g.kind) {
		case "reset":
			return EMI_VIEW_FULL;

		case "follow": {
			// From `full` the newest sample is already on screen, and from
			// `follow` this is a no-op that must not rewrite the remembered
			// width — returning the same object also spares every panel a
			// render.
			if (view.mode !== "pinned") return view;
			const cur = resolveWindow(view, extent);
			return { mode: "follow", width: cur.t1 - cur.t0 };
		}

		case "pin": {
			// Only following can be stopped. Pinning the whole run would leave
			// a state that looks identical and behaves differently.
			if (view.mode !== "follow") return view;
			const cur = resolveWindow(view, extent);
			return { mode: "pinned", t0: cur.t0, t1: cur.t1 };
		}

		case "zoomTo": {
			const width = clampWidth(g.width, span);
			if (width >= span * FULL_SPAN_FRACTION) return EMI_VIEW_FULL;
			// A stated place wins; a button has none, so the mode answers.
			const anchor = g.anchor ?? zoomAnchorFor(view, extent);
			const t0 = anchor.t - anchor.fraction * width;
			const t1 = t0 + width;
			// Unclamped. `t0` may sit before `f0`; the resolver deals with that.
			return t1 >= f1
				? { mode: "follow", width }
				: { mode: "pinned", t0, t1 };
		}

		case "panTo": {
			// The whole run has nothing to pan, and a sideways wheel over a
			// fully zoomed-out chart should not change the mode.
			if (view.mode === "full") return view;
			const cur = resolveWindow(view, extent);
			const width = cur.t1 - cur.t0;
			const t1 = g.t0 + width;
			if (t1 >= f1) {
				// Already following: keep the remembered width rather than
				// overwriting it with today's clamped one.
				return view.mode === "follow"
					? view
					: { mode: "follow", width };
			}
			return { mode: "pinned", t0: g.t0, t1 };
		}
	}
}
