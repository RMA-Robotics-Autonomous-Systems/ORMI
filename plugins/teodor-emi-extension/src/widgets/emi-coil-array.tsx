"use client";

/**
 * W3 — the coil array, from above.
 *
 * Follows the shared playhead: hovering a peak on the signal stack puts the rake
 * at that instant here, with the object under whichever coil raised it. With no
 * playhead it sits at the middle of the visible window, so the panel is never
 * blank.
 */

import { useEffect, useRef } from "react";
import { RadarIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { drawCoilArray, MIN_ARRAY_PX } from "../charts/coil-array";
import { useEmiTheme } from "../charts/emi-theme";
import { useEmiCursor, useEmiView } from "../state/atoms";
import { useEmiReplay } from "../state/use-emi-run";
import {
	EmiPanelFrame,
	useElementSize,
	useHostElement,
} from "./emi-panel-frame";
import { useRunExtent } from "./use-run-extent";

/** Settings for the coil array. */
interface CoilArraySettings extends Record<string, unknown> {
	title: string;
}

/**
 * The array.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const CoilArray = (props: CoilArraySettings) => {
	const { run, result, params, stale, snapshot } = useEmiReplay();
	const cursor = useEmiCursor();
	const view = useEmiView();

	const [hostRef, host] = useHostElement<HTMLDivElement>();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const theme = useEmiTheme(host);
	const size = useElementSize(host);
	const extent = useRunExtent(run);

	const midpoint = view
		? (view.t0 + view.t1) / 2
		: (extent[0] + extent[1]) / 2;
	const atTime = cursor?.t ?? midpoint;

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv || !run || !result || run.n === 0) return;
		if (size.width < MIN_ARRAY_PX || size.height < MIN_ARRAY_PX) return;
		drawCoilArray(cv, {
			run,
			result,
			params,
			theme,
			leverArm: snapshot.leverArm,
			atTime,
			hoverDet: cursor?.det ?? -1,
			width: size.width,
			height: size.height,
		});
	}, [
		run,
		result,
		params,
		theme,
		snapshot.leverArm,
		atTime,
		cursor,
		size.width,
		size.height,
	]);

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} stale={stale}>
			<div ref={hostRef} className="h-full w-full">
				<canvas ref={canvasRef} style={{ display: "block" }} />
			</div>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the coil array.
 *
 * @returns The definition.
 */
export function EmiCoilArrayDefinition(): WidgetDefinition<CoilArraySettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-coil-array",
		name: "EMI coil array",
		description:
			"The coil rake from above, with detections drifting astern as time advances.",
		titleProp: "title",
		icon: <RadarIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI coil array" },
		Component: CoilArray,
	};
}
