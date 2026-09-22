/**
 * The time-window state machine.
 *
 * `resolveWindow` and `applyGesture` are the two predicates every time panel's
 * behaviour rests on, and they fail silently in both directions: a window that
 * quietly stops following reads as "the panel stopped updating", and a window
 * that quietly re-arms drags an operator off the stretch they were studying.
 * Neither produces an error, so this file is the only thing that notices.
 *
 * The assertions that matter most are the ones about the **unclamped** request.
 * Re-arming is decided from what the operator asked for, never by comparing a
 * resolved window against `f1 - ε`: a tolerance there is source-rate dependent,
 * and it would re-arm a window deliberately pinned at the end of a finished
 * recording. Every one of those assertions is run against two different extents,
 * which is what would expose a hidden rate-dependent tolerance.
 */

import { describe, expect, it } from "bun:test";
import {
	applyGesture,
	EMI_VIEW_FULL,
	FULL_SPAN_FRACTION,
	MIN_VIEW_FRACTION,
	resolveWindow,
	zoomAnchorFor,
	type EmiView,
} from "../emi-view";

/** A short run, and a run three orders of magnitude longer. */
const SHORT: readonly [number, number] = [0, 100];
const LONG: readonly [number, number] = [1_700_000_000, 1_700_100_000];

describe("resolveWindow", () => {
	it("shows the whole run for full", () => {
		expect(resolveWindow(EMI_VIEW_FULL, SHORT)).toEqual({
			t0: 0,
			t1: 100,
			mode: "full",
		});
	});

	it("puts a follow window's right edge on the newest sample", () => {
		expect(resolveWindow({ mode: "follow", width: 20 }, SHORT)).toEqual({
			t0: 80,
			t1: 100,
			mode: "follow",
		});
	});

	it("clamps a follow window wider than the run to the run", () => {
		// The state keeps the 250 s intent; only the window is clamped.
		expect(resolveWindow({ mode: "follow", width: 250 }, SHORT)).toEqual({
			t0: 0,
			t1: 100,
			mode: "follow",
		});
	});

	it("reports a pinned window verbatim when it fits", () => {
		expect(
			resolveWindow({ mode: "pinned", t0: 30, t1: 45 }, SHORT),
		).toEqual({ t0: 30, t1: 45, mode: "pinned" });
	});

	it("holds a pinned window inside the run, keeping its width", () => {
		// Asked for [90, 110]; only [80, 100] exists.
		expect(
			resolveWindow({ mode: "pinned", t0: 90, t1: 110 }, SHORT),
		).toEqual({ t0: 80, t1: 100, mode: "pinned" });
		// And on the other side.
		expect(
			resolveWindow({ mode: "pinned", t0: -10, t1: 10 }, SHORT),
		).toEqual({ t0: 0, t1: 20, mode: "pinned" });
	});

	it("clamps a pinned window wider than the run", () => {
		expect(
			resolveWindow({ mode: "pinned", t0: -50, t1: 150 }, SHORT),
		).toEqual({ t0: 0, t1: 100, mode: "pinned" });
	});

	it("shows what there is when the run has no span yet", () => {
		expect(resolveWindow({ mode: "follow", width: 20 }, [7, 7])).toEqual({
			t0: 7,
			t1: 7,
			mode: "follow",
		});
	});

	it("reports the mode it was handed and no derived booleans", () => {
		const resolved = resolveWindow({ mode: "follow", width: 250 }, SHORT);
		// Observationally the whole run, but the state is still following, and
		// the resolver says so rather than quietly relabelling it.
		expect(resolved.mode).toBe("follow");
		expect(Object.keys(resolved).sort()).toEqual(["mode", "t0", "t1"]);
	});
});

describe("follow against a growing run", () => {
	it("tracks the newest sample and keeps its width", () => {
		const view: EmiView = { mode: "follow", width: 20 };
		expect(resolveWindow(view, [0, 100])).toEqual({
			t0: 80,
			t1: 100,
			mode: "follow",
		});
		expect(resolveWindow(view, [0, 137.5])).toEqual({
			t0: 117.5,
			t1: 137.5,
			mode: "follow",
		});
	});

	it("widens toward a remembered intent the run has not reached", () => {
		// The operator asked for a minute on a run that was 30 s long.
		const view: EmiView = { mode: "follow", width: 60 };
		expect(resolveWindow(view, [0, 30])).toEqual({
			t0: 0,
			t1: 30,
			mode: "follow",
		});
		expect(resolveWindow(view, [0, 90])).toEqual({
			t0: 30,
			t1: 90,
			mode: "follow",
		});
	});
});

describe("a pinned window at the end of the run", () => {
	it("drifts left as the run grows rather than re-arming", () => {
		// This is the behaviour the no-tolerance rule chooses, so it is pinned
		// here on purpose: an operator who pinned the end of a finished
		// recording must not be dragged forward when more samples arrive.
		const view: EmiView = { mode: "pinned", t0: 80, t1: 100 };
		expect(resolveWindow(view, [0, 100])).toEqual({
			t0: 80,
			t1: 100,
			mode: "pinned",
		});
		expect(resolveWindow(view, [0, 130])).toEqual({
			t0: 80,
			t1: 100,
			mode: "pinned",
		});
	});

	it("is not re-armed by any gesture it did not make", () => {
		const view: EmiView = { mode: "pinned", t0: 80, t1: 100 };
		// The extent has grown well past the pinned window; nothing changes
		// until the operator asks for something.
		expect(resolveWindow(view, [0, 400]).mode).toBe("pinned");
	});
});

describe("applyGesture — reset", () => {
	const gesture = { kind: "reset" } as const;

	it("returns to the whole run from every mode", () => {
		expect(applyGesture(EMI_VIEW_FULL, SHORT, gesture)).toEqual(
			EMI_VIEW_FULL,
		);
		expect(
			applyGesture({ mode: "follow", width: 20 }, SHORT, gesture),
		).toEqual(EMI_VIEW_FULL);
		expect(
			applyGesture({ mode: "pinned", t0: 10, t1: 20 }, SHORT, gesture),
		).toEqual(EMI_VIEW_FULL);
	});
});

describe("applyGesture — follow and pin", () => {
	it("arms following from pinned, at the pinned width", () => {
		const next = applyGesture({ mode: "pinned", t0: 30, t1: 45 }, SHORT, {
			kind: "follow",
		});
		expect(next).toEqual({ mode: "follow", width: 15 });
		expect(resolveWindow(next, SHORT)).toEqual({
			t0: 85,
			t1: 100,
			mode: "follow",
		});
	});

	it("is a no-op while already following, so the intent survives", () => {
		// Re-deriving the width here would overwrite a remembered 60 s with
		// today's clamped 30 s and the window would stop widening.
		const view: EmiView = { mode: "follow", width: 60 };
		expect(applyGesture(view, [0, 30], { kind: "follow" })).toBe(view);
	});

	it("does not arm following from full — it is already on screen", () => {
		expect(applyGesture(EMI_VIEW_FULL, SHORT, { kind: "follow" })).toBe(
			EMI_VIEW_FULL,
		);
	});

	it("pins the window that is on screen", () => {
		expect(
			applyGesture({ mode: "follow", width: 20 }, SHORT, { kind: "pin" }),
		).toEqual({ mode: "pinned", t0: 80, t1: 100 });
	});

	it("pins the clamped window, not the remembered intent", () => {
		expect(
			applyGesture({ mode: "follow", width: 60 }, [0, 30], {
				kind: "pin",
			}),
		).toEqual({ mode: "pinned", t0: 0, t1: 30 });
	});

	it("leaves pinned and full alone", () => {
		const pinned: EmiView = { mode: "pinned", t0: 10, t1: 20 };
		expect(applyGesture(pinned, SHORT, { kind: "pin" })).toBe(pinned);
		expect(applyGesture(EMI_VIEW_FULL, SHORT, { kind: "pin" })).toBe(
			EMI_VIEW_FULL,
		);
	});
});

describe("applyGesture — zoomTo", () => {
	it("follows when an unanchored request comes from the live edge", () => {
		for (const [f0, f1] of [SHORT, LONG]) {
			const next = applyGesture({ mode: "full" }, [f0, f1], {
				kind: "zoomTo",
				width: (f1 - f0) / 4,
			});
			expect(next).toEqual({ mode: "follow", width: (f1 - f0) / 4 });
		}
	});

	it("keeps following and only changes the width", () => {
		const next = applyGesture({ mode: "follow", width: 40 }, SHORT, {
			kind: "zoomTo",
			width: 25,
		});
		expect(next).toEqual({ mode: "follow", width: 25 });
	});

	it("pins when the request is anchored inside the run", () => {
		// The wheel states a place: "look here", not "look at the end".
		const next = applyGesture(EMI_VIEW_FULL, SHORT, {
			kind: "zoomTo",
			width: 10,
			anchor: { t: 50, fraction: 0.5 },
		});
		expect(next).toEqual({ mode: "pinned", t0: 45, t1: 55 });
	});

	it("keeps the anchored sample under the pointer", () => {
		const view: EmiView = { mode: "pinned", t0: 20, t1: 60 };
		const { t0, t1 } = resolveWindow(view, SHORT);
		const t = 35;
		const fraction = (t - t0) / (t1 - t0);
		const next = applyGesture(view, SHORT, {
			kind: "zoomTo",
			width: 10,
			anchor: { t, fraction },
		});
		const after = resolveWindow(next, SHORT);
		expect((t - after.t0) / (after.t1 - after.t0)).toBeCloseTo(
			fraction,
			12,
		);
	});

	it("resolves to full once the request covers the run", () => {
		for (const [f0, f1] of [SHORT, LONG]) {
			const span = f1 - f0;
			expect(
				applyGesture(
					{ mode: "pinned", t0: f0, t1: f0 + span / 2 },
					[f0, f1],
					{ kind: "zoomTo", width: span * FULL_SPAN_FRACTION },
				),
			).toEqual(EMI_VIEW_FULL);
			// A request wider than the run is the same answer.
			expect(
				applyGesture(EMI_VIEW_FULL, [f0, f1], {
					kind: "zoomTo",
					width: span * 4,
				}),
			).toEqual(EMI_VIEW_FULL);
		}
	});

	it("will not zoom in past the minimum view", () => {
		const next = applyGesture(EMI_VIEW_FULL, SHORT, {
			kind: "zoomTo",
			width: 0.000_01,
			anchor: { t: 50, fraction: 0.5 },
		});
		const { t0, t1 } = resolveWindow(next, SHORT);
		expect(t1 - t0).toBeCloseTo(100 * MIN_VIEW_FRACTION, 12);
	});

	it("leaves the state alone when the run has no span", () => {
		const view: EmiView = { mode: "pinned", t0: 1, t1: 2 };
		expect(applyGesture(view, [5, 5], { kind: "zoomTo", width: 1 })).toBe(
			view,
		);
	});
});

describe("an unanchored zoom takes its anchor from the mode", () => {
	// A button has no pointer, so the reducer answers with the place the
	// operator is demonstrably attending to. Derived from the **mode**, never
	// from the direction of the zoom: anchoring a pinned zoom on the live edge
	// took an operator studying a detection mid-run to the end of the survey
	// the moment they pressed zoom-out for context — the window sliding out
	// from under them, which is the failure detach-on-pan exists to prevent.
	for (const [f0, f1] of [SHORT, LONG]) {
		const span = f1 - f0;
		const label = `on a ${span} s run`;
		/** Mid-run, so nothing here is decided by the clamp. */
		const pinned: EmiView = {
			mode: "pinned",
			t0: f0 + span * 0.4,
			t1: f0 + span * 0.6,
		};
		const centre = f0 + span * 0.5;

		it(`anchors on the newest sample from full ${label}`, () => {
			expect(zoomAnchorFor(EMI_VIEW_FULL, [f0, f1])).toEqual({
				t: f1,
				fraction: 1,
			});
		});

		it(`anchors on the newest sample from follow ${label}`, () => {
			expect(
				zoomAnchorFor({ mode: "follow", width: span / 4 }, [f0, f1]),
			).toEqual({ t: f1, fraction: 1 });
		});

		it(`anchors on the pinned window's centre ${label}`, () => {
			expect(zoomAnchorFor(pinned, [f0, f1])).toEqual({
				t: centre,
				fraction: 0.5,
			});
		});

		it(`starts following when zooming in from full ${label}`, () => {
			expect(
				applyGesture(EMI_VIEW_FULL, [f0, f1], {
					kind: "zoomTo",
					width: span * 0.2,
				}),
			).toEqual({ mode: "follow", width: span * 0.2 });
		});

		it(`keeps following at the new width, zooming in from follow ${label}`, () => {
			const next = applyGesture(
				{ mode: "follow", width: span * 0.4 },
				[f0, f1],
				{ kind: "zoomTo", width: span * 0.2 },
			);
			expect(next).toEqual({ mode: "follow", width: span * 0.2 });
			expect(resolveWindow(next, [f0, f1]).t1).toBeCloseTo(f1, 6);
		});

		it(`keeps following at the new width, zooming out from follow ${label}`, () => {
			const next = applyGesture(
				{ mode: "follow", width: span * 0.2 },
				[f0, f1],
				{ kind: "zoomTo", width: span * 0.4 },
			);
			expect(next).toEqual({ mode: "follow", width: span * 0.4 });
		});

		it(`stays pinned, centre kept, zooming IN from pinned ${label}`, () => {
			const next = applyGesture(pinned, [f0, f1], {
				kind: "zoomTo",
				width: span * 0.1,
			});
			expect(next.mode).toBe("pinned");
			const after = resolveWindow(next, [f0, f1]);
			expect((after.t0 + after.t1) / 2).toBeCloseTo(centre, 6);
			expect(after.t1 - after.t0).toBeCloseTo(span * 0.1, 6);
		});

		it(`stays pinned, centre kept, zooming OUT from pinned ${label}`, () => {
			// The defect this replaced: this used to resolve to `follow`.
			const next = applyGesture(pinned, [f0, f1], {
				kind: "zoomTo",
				width: span * 0.4,
			});
			expect(next.mode).toBe("pinned");
			const after = resolveWindow(next, [f0, f1]);
			expect((after.t0 + after.t1) / 2).toBeCloseTo(centre, 6);
			expect(after.t1 - after.t0).toBeCloseTo(span * 0.4, 6);
		});

		it(`stays pinned zooming out from a window near the end ${label}`, () => {
			// Near the end the centre-anchored request still fits, so the
			// operator keeps the stretch they were reading.
			const nearEnd: EmiView = {
				mode: "pinned",
				t0: f1 - span * 0.2,
				t1: f1 - span * 0.05,
			};
			expect(
				applyGesture(nearEnd, [f0, f1], {
					kind: "zoomTo",
					width: span * 0.2,
				}).mode,
			).toBe("pinned");
		});

		it(`stays pinned when the clamp moves the centre ${label}`, () => {
			// At the very start of the run a centre-anchored zoom-out asks for
			// a window that begins before `f0`. The resolver holds it inside
			// the run — the centre moves, the mode does not.
			const atStart: EmiView = {
				mode: "pinned",
				t0: f0,
				t1: f0 + span * 0.1,
			};
			const next = applyGesture(atStart, [f0, f1], {
				kind: "zoomTo",
				width: span * 0.4,
			});
			expect(next.mode).toBe("pinned");
			const after = resolveWindow(next, [f0, f1]);
			expect(after.t0).toBeCloseTo(f0, 6);
			expect(after.t1 - after.t0).toBeCloseTo(span * 0.4, 6);
		});

		it(`lets a stated anchor override the mode ${label}`, () => {
			// The wheel is the caller that states one, and it must win: a
			// wheel over the live edge really does mean "zoom about here".
			expect(
				applyGesture(pinned, [f0, f1], {
					kind: "zoomTo",
					width: span * 0.1,
					anchor: { t: f1, fraction: 1 },
				}),
			).toEqual({ mode: "follow", width: span * 0.1 });
		});
	}
});

describe("applyGesture — panTo", () => {
	it("pins when the request stays inside the run", () => {
		expect(
			applyGesture({ mode: "pinned", t0: 20, t1: 40 }, SHORT, {
				kind: "panTo",
				t0: 55,
			}),
		).toEqual({ mode: "pinned", t0: 55, t1: 75 });
	});

	it("detaches a following window when the operator pans backwards", () => {
		expect(
			applyGesture({ mode: "follow", width: 20 }, SHORT, {
				kind: "panTo",
				t0: 10,
			}),
		).toEqual({ mode: "pinned", t0: 10, t1: 30 });
	});

	it("remembers the unclamped request, leaving the clamp to the resolver", () => {
		// A drag can ask for a window that starts before the run. The state
		// keeps the request; only the window is held inside the run.
		const next = applyGesture({ mode: "pinned", t0: 20, t1: 40 }, SHORT, {
			kind: "panTo",
			t0: -15,
		});
		expect(next).toEqual({ mode: "pinned", t0: -15, t1: 5 });
		expect(resolveWindow(next, SHORT)).toEqual({
			t0: 0,
			t1: 20,
			mode: "pinned",
		});
	});

	it("does nothing from full — there is nothing to pan", () => {
		// A sideways wheel over a fully zoomed-out chart must not change the
		// mode under the operator.
		expect(
			applyGesture(EMI_VIEW_FULL, SHORT, { kind: "panTo", t0: 40 }),
		).toBe(EMI_VIEW_FULL);
	});

	it("keeps a following window's remembered intent when it stays at the end", () => {
		const view: EmiView = { mode: "follow", width: 60 };
		expect(applyGesture(view, [0, 30], { kind: "panTo", t0: 30 })).toBe(
			view,
		);
	});
});

describe("re-arming is decided from the unclamped request", () => {
	// The crux, run against two extents three orders of magnitude apart: a
	// tolerance hidden anywhere in this path would have to be expressed in
	// seconds, so it cannot be right for both.
	for (const [f0, f1] of [SHORT, LONG]) {
		const span = f1 - f0;
		const width = span / 5;
		const pinned: EmiView = { mode: "pinned", t0: f0, t1: f0 + width };
		const label = `on a ${span} s run`;

		it(`re-arms when the request lands exactly on the newest sample ${label}`, () => {
			expect(
				applyGesture(pinned, [f0, f1], {
					kind: "panTo",
					t0: f1 - width,
				}),
			).toEqual({ mode: "follow", width });
		});

		it(`re-arms when the request reaches past the newest sample ${label}`, () => {
			expect(
				applyGesture(pinned, [f0, f1], {
					kind: "panTo",
					t0: f1 - width + span,
				}),
			).toEqual({ mode: "follow", width });
		});

		it(`stays pinned when the request stops one epsilon short ${label}`, () => {
			// The nearest representable value below the edge — one ULP at this
			// magnitude, so it is ~1e-14 s on the short run and ~4e-7 s on the
			// long one. Any tolerance at all would swallow one of the two, and
			// the operator who stopped short did so on purpose.
			const requestedT0 = f1 - width;
			const short = requestedT0 - Math.abs(requestedT0) * Number.EPSILON;
			expect(short).toBeLessThan(requestedT0);
			const next = applyGesture(pinned, [f0, f1], {
				kind: "panTo",
				t0: short,
			});
			expect(next.mode).toBe("pinned");
		});

		it(`re-arms from the far end of the slider ${label}`, () => {
			// `panTo(1)` asks for `f0 + (span - width) * 1`, which is exactly
			// `f1 - width`. No special case in the caller.
			const requestedT0 = f0 + (span - width) * 1;
			expect(
				applyGesture(pinned, [f0, f1], {
					kind: "panTo",
					t0: requestedT0,
				}),
			).toEqual({ mode: "follow", width });
		});

		it(`stays pinned just inside the far end of the slider ${label}`, () => {
			const requestedT0 = f0 + (span - width) * 0.999;
			expect(
				applyGesture(pinned, [f0, f1], {
					kind: "panTo",
					t0: requestedT0,
				}).mode,
			).toBe("pinned");
		});

		it(`re-arms a wheel zoom stated on the newest sample ${label}`, () => {
			// A stated anchor — only the wheel has one — is judged by the same
			// rule as everything else.
			expect(
				applyGesture(pinned, [f0, f1], {
					kind: "zoomTo",
					width: width / 2,
					anchor: { t: f1, fraction: 1 },
				}),
			).toEqual({ mode: "follow", width: width / 2 });
		});

		it(`does not re-arm a wheel zoom one width short of the end ${label}`, () => {
			expect(
				applyGesture(pinned, [f0, f1], {
					kind: "zoomTo",
					width: width / 2,
					anchor: { t: f1 - width, fraction: 1 },
				}).mode,
			).toBe("pinned");
		});
	}
});

describe("the transition table", () => {
	const extent: readonly [number, number] = [0, 100];
	const from: Record<EmiView["mode"], EmiView> = {
		full: EMI_VIEW_FULL,
		follow: { mode: "follow", width: 20 },
		pinned: { mode: "pinned", t0: 20, t1: 40 },
	};

	/** Every gesture, with the anchors the UI actually issues. */
	const gestures = {
		"zoom in (button, no stated anchor)": {
			kind: "zoomTo",
			width: 10,
		},
		"zoom out (button, no stated anchor)": {
			kind: "zoomTo",
			width: 40,
		},
		"zoom in (wheel, stated mid-run)": {
			kind: "zoomTo",
			width: 10,
			anchor: { t: 50, fraction: 0.5 },
		},
		"pan backwards": { kind: "panTo", t0: 5 },
		"pan onto the newest sample": { kind: "panTo", t0: 100 },
		reset: { kind: "reset" },
		follow: { kind: "follow" },
		pin: { kind: "pin" },
	} as const;

	/** Expected mode, and the window it resolves to. */
	const table: Record<
		keyof typeof gestures,
		Record<EmiView["mode"], [EmiView["mode"], number, number]>
	> = {
		"zoom in (button, no stated anchor)": {
			// At the live edge the button anchors there, so zooming starts
			// following. From `pinned` it anchors on the window's centre — 30
			// — and stays where the operator is looking.
			full: ["follow", 90, 100],
			follow: ["follow", 90, 100],
			pinned: ["pinned", 25, 35],
		},
		"zoom out (button, no stated anchor)": {
			// 40 of 100 s is short of `span * FULL_SPAN_FRACTION`, so this is a
			// window rather than the whole run. The pinned row is the case the
			// mode-derived anchor exists for: zooming out for context must not
			// jump to the end of the survey.
			full: ["follow", 60, 100],
			follow: ["follow", 60, 100],
			pinned: ["pinned", 10, 50],
		},
		"zoom in (wheel, stated mid-run)": {
			full: ["pinned", 45, 55],
			follow: ["pinned", 45, 55],
			pinned: ["pinned", 45, 55],
		},
		"pan backwards": {
			// Nothing to pan when the whole run is shown.
			full: ["full", 0, 100],
			follow: ["pinned", 5, 25],
			pinned: ["pinned", 5, 25],
		},
		"pan onto the newest sample": {
			full: ["full", 0, 100],
			follow: ["follow", 80, 100],
			pinned: ["follow", 80, 100],
		},
		reset: {
			full: ["full", 0, 100],
			follow: ["full", 0, 100],
			pinned: ["full", 0, 100],
		},
		follow: {
			full: ["full", 0, 100],
			follow: ["follow", 80, 100],
			pinned: ["follow", 80, 100],
		},
		pin: {
			full: ["full", 0, 100],
			follow: ["pinned", 80, 100],
			pinned: ["pinned", 20, 40],
		},
	};

	for (const name of Object.keys(gestures) as Array<keyof typeof gestures>) {
		for (const mode of Object.keys(from) as Array<EmiView["mode"]>) {
			const [wantMode, wantT0, wantT1] = table[name][mode];
			it(`${mode} + ${name} ⇒ ${wantMode} [${wantT0}, ${wantT1}]`, () => {
				const next = applyGesture(from[mode], extent, gestures[name]);
				expect(next.mode).toBe(wantMode);
				const resolved = resolveWindow(next, extent);
				expect(resolved.t0).toBeCloseTo(wantT0, 9);
				expect(resolved.t1).toBeCloseTo(wantT1, 9);
			});
		}
	}
});
