"use client";

/**
 * W7 — the lag scatter.
 *
 * Every cross-coil pair the geometry accepted, plotted as what it predicted
 * against what happened. Points on the diagonal are the frame, the heading and
 * the speed all agreeing; a systematic offset from it is a frame error, and
 * scatter around it is the fix.
 */

import { useEffect, useRef, useState } from "react";
import { ScatterChartIcon } from "lucide-react";
import type { ControlElement, VerticalLayout } from "@jsonforms/core";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { drawLagChart, type LagReadout } from "../charts/lag-chart";
import { useEmiTheme } from "../charts/emi-theme";
import { useEmiReplay } from "../state/use-emi-run";
import {
	EmiPanelFrame,
	useElementSize,
	useHostElement,
} from "./emi-panel-frame";

/** Settings for the lag scatter. */
interface LagSettings extends Record<string, unknown> {
	title: string;
}

/**
 * The scatter.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
const LagScatter = (props: LagSettings) => {
	const { result, stale, snapshot } = useEmiReplay();

	const [hostRef, host] = useHostElement<HTMLDivElement>();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const theme = useEmiTheme(host);
	const size = useElementSize(host);
	const [readout, setReadout] = useState<LagReadout | null>(null);

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv || !result || size.width < 80 || size.height < 80) {
			return;
		}
		const next = drawLagChart(cv, {
			pairs: result.pairs,
			theme,
			width: size.width,
			height: size.height,
		});
		// A readout is a summary of what was drawn, so it can only be known
		// after drawing. It changes at the rate the replay changes, not at
		// pointer rate, so a state write here costs one render per recompute.
		setReadout((prev) =>
			prev &&
			next &&
			prev.plotted === next.plotted &&
			prev.clipped === next.clipped &&
			Object.is(prev.medianError, next.medianError)
				? prev
				: next,
		);
	}, [result, theme, size.width, size.height]);

	const note = readout
		? readout.plotted === 0 && readout.clipped === 0
			? "No cross-coil pairs at these tolerances — widen the across-track window, or the coils genuinely never agreed."
			: `${readout.plotted} pairs plotted` +
				(readout.clipped
					? `, ${readout.clipped} outside the robust limits (near-stationary links predicting multi-second lags)`
					: "") +
				(Number.isFinite(readout.medianError)
					? `. Median disagreement ${readout.medianError.toFixed(2)} s.`
					: ".")
		: "";

	return (
		<EmiPanelFrame title={props.title} snapshot={snapshot} stale={stale}>
			<div className="flex h-full w-full flex-col">
				<div ref={hostRef} className="min-h-0 flex-1">
					<canvas ref={canvasRef} style={{ display: "block" }} />
				</div>
				<p className="shrink-0 px-2 pb-1 text-[11px] leading-tight text-muted-foreground">
					{note}
				</p>
			</div>
		</EmiPanelFrame>
	);
};

/**
 * Widget definition for the lag scatter.
 *
 * @returns The definition.
 */
export function EmiLagScatterDefinition(): WidgetDefinition<LagSettings> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};
	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title],
	};

	return {
		id: "teodor-emi-lag-scatter",
		name: "EMI cross-coil lag",
		description:
			"Observed against predicted lag for every cross-coil pair.",
		titleProp: "title",
		icon: <ScatterChartIcon />,
		schema: {
			type: "object",
			properties: { title: { type: "string", title: "Title" } },
		},
		uischema: layout,
		data: { title: "EMI cross-coil lag" },
		Component: LagScatter,
	};
}
