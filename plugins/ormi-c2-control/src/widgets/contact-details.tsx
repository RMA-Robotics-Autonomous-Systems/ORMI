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
						title="Not a confirmed real finding: simulated, exercise, test, or never stated."
					>
						{essenceLabel(contact.essence)}
					</Badge>
				)}
				<span className="ml-auto" />
				{onShow && (
					<Button
						size="icon-sm"
						variant="ghost"
						className="h-6 w-6"
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
						className="h-6 w-6"
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
									{m.quantity.replaceAll("_", " ") || "—"}
								</td>
								<td className="text-right tabular-nums">
									{m.value} {m.unit}
								</td>
								<td className="text-right tabular-nums">
									{m.sigma}
								</td>
								<td className="text-right tabular-nums">
									{m.depth_m} m
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
