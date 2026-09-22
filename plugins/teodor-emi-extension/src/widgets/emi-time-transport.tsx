"use client";

/**
 * The window, as controls rather than as gestures.
 *
 * Every route to a time window writes through `useTimeGestures`, so this is a
 * second set of hands on the same steering — never a second implementation.
 * That is what stops the slider from disagreeing with the chart, which is the
 * classic failure of a chart with both a transport and a wheel.
 *
 * It exists because gestures are discoverable only by trying them. A wheel that
 * zooms and a shift-wheel that scrubs are excellent once you know; a panel with
 * no visible control offers no way to find out, and a trackpad user who has
 * never pressed shift over a chart will conclude the run cannot be zoomed.
 *
 * The same argument is why following the live edge has a **button** and not only
 * an implicit rule: a window that re-anchors itself when a drag reaches the end
 * is excellent once you know, and invisible until then.
 */

import { Button } from "@workspace/ui/components/button";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MinusIcon,
	PlusIcon,
} from "lucide-react";
import type { EmiView } from "../state/emi-view";
import type { TimeGestures } from "./use-time-gestures";

/** How much one zoom press changes the visible span. */
const ZOOM_STEP = 1.6;

/** How far one arrow press slides the window, as a fraction of its width. */
const PAN_STEP = 0.25;

/** Props for {@link EmiTimeTransport}. */
export interface EmiTimeTransportProps {
	/** The gesture hook's control surface, from the panel that owns the host. */
	controls: TimeGestures["controls"];
	/**
	 * What the shared window is doing.
	 *
	 * Three states drive four controls, so this replaces the `full` boolean it
	 * used to take rather than sitting beside it: a second flag would be a
	 * second answer to the same question.
	 */
	mode: EmiView["mode"];
}

/** What the follow toggle says about itself, per mode. */
const FOLLOW_TITLE: Record<EmiView["mode"], string> = {
	// Reads as on, and does nothing — so it says why. Without this the operator
	// goes looking for the setting that is "stuck".
	full: "The whole run is shown, so the newest sample is always visible",
	follow: "Following the newest sample — click to pin this window",
	pinned: "Jump to the newest sample and follow it",
};

/**
 * Zoom, pan, follow and reset for a time-domain panel.
 *
 * @param props - Controls and what the window is currently doing.
 * @returns React element.
 */
export function EmiTimeTransport(props: EmiTimeTransportProps) {
	const { controls, mode } = props;
	const full = mode === "full";
	// Lit for `follow` and for `full`, because in both the newest sample is on
	// screen and stays there. Only `pinned` is not keeping up.
	const following = mode !== "pinned";

	return (
		<div className="flex items-center gap-1">
			<Button
				size="sm"
				variant="ghost"
				className="h-6 w-6 p-0"
				title="Zoom out"
				aria-label="Zoom out"
				disabled={full}
				onClick={() => controls.zoomBy(ZOOM_STEP)}
			>
				<MinusIcon className="h-3 w-3" />
			</Button>
			<Button
				size="sm"
				variant="ghost"
				className="h-6 w-6 p-0"
				title="Zoom in"
				aria-label="Zoom in"
				onClick={() => controls.zoomBy(1 / ZOOM_STEP)}
			>
				<PlusIcon className="h-3 w-3" />
			</Button>
			<Button
				size="sm"
				variant="ghost"
				className="h-6 w-6 p-0"
				title="Earlier"
				aria-label="Earlier"
				disabled={full}
				onClick={() => controls.panBy(-PAN_STEP)}
			>
				<ChevronLeftIcon className="h-3 w-3" />
			</Button>
			{/*
			  Disabled rather than hidden while the whole run is shown: a control
			  that disappears takes the row's width with it and shuffles every
			  button beside it under the cursor.
			*/}
			<input
				type="range"
				min={0}
				max={1000}
				step={1}
				value={Math.round(controls.offset * 1000)}
				disabled={full}
				aria-label="Position in the recording"
				title="Position in the recording"
				className="h-1 w-20 cursor-pointer accent-current disabled:cursor-default disabled:opacity-40"
				onChange={(ev) =>
					controls.panTo(Number(ev.target.value) / 1000)
				}
			/>
			{/*
			  Under `follow` the slider sits at its far end and creeps by itself
			  as the run grows, which is the feedback that "later" would give —
			  so the arrow is disabled and says so instead of nudging a window
			  that is already at the end.
			*/}
			<Button
				size="sm"
				variant="ghost"
				className="h-6 w-6 p-0"
				title={following ? "Already at the newest sample" : "Later"}
				aria-label="Later"
				disabled={following}
				onClick={() => controls.panBy(PAN_STEP)}
			>
				<ChevronRightIcon className="h-3 w-3" />
			</Button>
			{/*
			  States itself in a word, not in a colour. The variant change is a
			  second, redundant signal — an operator who cannot read the accent
			  (a wall console at an angle, reduced motion, colour vision) must
			  still be able to tell whether the panel is keeping up, and
			  `aria-pressed` is what says it to a screen reader.
			*/}
			<Button
				size="sm"
				variant={following ? "secondary" : "ghost"}
				className="h-6 px-2 text-[11px]"
				title={FOLLOW_TITLE[mode]}
				aria-pressed={following}
				disabled={full}
				onClick={following ? controls.pin : controls.follow}
			>
				follow
			</Button>
			<Button
				size="sm"
				variant="ghost"
				className="h-6 px-2 text-[11px]"
				title="Show the whole run"
				disabled={full}
				onClick={controls.reset}
			>
				reset
			</Button>
		</div>
	);
}
