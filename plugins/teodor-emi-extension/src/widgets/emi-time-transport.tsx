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
 */

import { Button } from "@workspace/ui/components/button";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MinusIcon,
	PlusIcon,
} from "lucide-react";
import type { TimeGestures } from "./use-time-gestures";

/** How much one zoom press changes the visible span. */
const ZOOM_STEP = 1.6;

/** How far one arrow press slides the window, as a fraction of its width. */
const PAN_STEP = 0.25;

/** Props for {@link EmiTimeTransport}. */
export interface EmiTimeTransportProps {
	/** The gesture hook's control surface, from the panel that owns the host. */
	controls: TimeGestures["controls"];
	/** True while the whole run is shown — the panning controls do nothing then. */
	full: boolean;
}

/**
 * Zoom, pan and reset for a time-domain panel.
 *
 * @param props - Controls and whether the whole run is visible.
 * @returns React element.
 */
export function EmiTimeTransport(props: EmiTimeTransportProps) {
	const { controls, full } = props;

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
			<Button
				size="sm"
				variant="ghost"
				className="h-6 w-6 p-0"
				title="Later"
				aria-label="Later"
				disabled={full}
				onClick={() => controls.panBy(PAN_STEP)}
			>
				<ChevronRightIcon className="h-3 w-3" />
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
