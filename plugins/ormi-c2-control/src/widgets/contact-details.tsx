"use client";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Crosshair, X } from "lucide-react";
import { useMemo } from "react";

import { getAgentName } from "../state/c2-agents-store";
import { useMissionGraph } from "../state/mission-graph-store";
import { essenceLabel, isSimulatedEssence } from "./findings";
import {
	contactFacts,
	contactName,
	type MissionContact,
} from "./mission-contacts";

/**
 * A measured quantity, as an operator can read it.
 *
 * The wire carries float32s that a float64 round-trip renders in full — a
 * 0.1 m depth printed as `0.10000000149011612 m`, which reads as a machine
 * leaking rather than as a depth. Significant figures rather than a fixed
 * number of decimals, because one table holds metres, teslas and counts: 3
 * s.f. keeps a 0.000123 readable and an 1834 honest. Integers, zero and
 * anything non-finite are passed through as themselves — rounding an exact 0
 * into `0.00` invents a precision nobody measured.
 *
 * @param value - The raw number.
 * @returns The string to print.
 */
export function formatMeasurement(value: number): string {
	if (!Number.isFinite(value)) return "n/a";
	if (Number.isInteger(value)) return String(value);
	const abs = Math.abs(value);
	// Outside the range where a decimal reads at a glance, say it in exponent
	// form rather than as a row of zeros.
	if (abs >= 1e6 || abs < 1e-4) return value.toExponential(2);
	return String(Number(value.toPrecision(3)));
}

/**
 * Everything about one contact: what was found, by whom, during which step,
 * where and how well, how much to believe it, what the sensor measured, and
 * who went to it. The same view in the map's popup and under the asset tree.
 *
 * @param props.contact - The contact.
 * @param props.onShow - "Show on map", when the caller can.
 * @param props.onClose - Close the view, when the caller can.
 */
export function ContactDetails(props: {
	contact: MissionContact;
	onShow?: () => void;
	onClose?: () => void;
}) {
	const { contact, onShow, onClose } = props;
	const graph = useMissionGraph(contact.missionId);
	const facts = useMemo(() => {
		const labels = new Map(
			(graph?.nodes ?? []).map((node) => [node.id, node.label]),
		);
		return contactFacts(contact, {
			agent: (id) => getAgentName(id),
			node: (id) => labels.get(id) ?? "",
		});
	}, [contact, graph]);

	return (
		<div className="flex flex-col gap-1.5 text-xs">
			<div className="flex items-center gap-1.5">
				<span className="font-medium">{contactName(contact)}</span>
				{isSimulatedEssence(contact.essence) && (
					<Badge
						variant="outline"
						className="border-info text-info"
						title="Not a confirmed real finding"
					>
						{essenceLabel(contact.essence)}
					</Badge>
				)}
				<span className="ml-auto" />
				{onShow && (
					<Button
						size="icon-sm"
						variant="ghost"
						title="Show on the map"
						aria-label="Show on the map"
						onClick={onShow}
					>
						<Crosshair />
					</Button>
				)}
				{onClose && (
					<Button
						size="icon-sm"
						variant="ghost"
						title="Close"
						aria-label="Close contact details"
						onClick={onClose}
					>
						<X />
					</Button>
				)}
			</div>
			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
				{facts.map((fact) => (
					<div key={fact.label} className="contents">
						<dt className="text-muted-foreground">{fact.label}</dt>
						<dd
							className={`break-all ${fact.warn ? "text-warning" : ""}`}
						>
							{fact.value}
						</dd>
					</div>
				))}
			</dl>
			<div className="text-muted-foreground">Measurements</div>
			{contact.measurements.length === 0 ? (
				<div>none reported</div>
			) : (
				<table className="w-full">
					<thead className="text-muted-foreground">
						<tr>
							<th className="text-left font-normal">Quantity</th>
							<th className="text-right font-normal">Value</th>
							<th className="text-right font-normal">±σ</th>
							<th className="text-right font-normal">Depth</th>
						</tr>
					</thead>
					<tbody>
						{contact.measurements.map((m, index) => (
							<tr key={`${m.quantity}:${index}`}>
								<td>
									{m.quantity.replaceAll("_", " ") || "n/a"}
								</td>
								<td
									className="text-right tabular-nums"
									title={`${m.value} ${m.unit}`.trim()}
								>
									{formatMeasurement(m.value)} {m.unit}
								</td>
								<td
									className="text-right tabular-nums"
									title={String(m.sigma)}
								>
									{formatMeasurement(m.sigma)}
								</td>
								<td
									className="text-right tabular-nums"
									title={`${m.depth_m} m`}
								>
									{formatMeasurement(m.depth_m)} m
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
