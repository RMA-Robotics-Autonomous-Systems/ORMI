/**
 * The typed ports of the behaviour graph: what every node takes in and gives
 * out, and which output may be wired into which input.
 *
 * Pure (no React, no xyflow), so the compiler mirror, the editor's connection
 * check and the tests all read the SAME table. It mirrors the port table at
 * the top of the fog's `mission_program.hpp` (graph schema 2):
 *
 * | kind      | inputs                                   | outputs                     |
 * | --------- | ---------------------------------------- | --------------------------- |
 * | agent     | —                                        | next: flow, agent: agent *  |
 * | action    | in: flow, target: waypoint / zone        | next: flow                  |
 * | wait      | in: flow, when: true/false *             | next: flow                  |
 * | condition | agent: agent (Agent holding only)        | value: true/false *         |
 * | asset     | —                                        | value: waypoint / zone *    |
 *
 * `*` = many edges allowed. Every other port takes one edge: wiring a second
 * one into it REPLACES the first (see {@link connectionPlan}). A step's flow
 * input takes one step before it, or the agents that start the chain there.
 *
 * ## Where the editor is stricter than the fog
 *
 * The fog has no map, so to it an asset's output is just "an asset" and fits
 * any target. The editor knows each feature's type, so a zone cannot be wired
 * into a NAVIGATE and a waypoint cannot be wired into a COVERAGE — the drag is
 * refused on the canvas, before it becomes a mission the planner rejects.
 */

/** What travels along an edge. */
export type PortType =
	"flow" | "waypoint" | "zone" | "asset" | "agent" | "bool";

/** One input or output of a node. */
export interface PortSpec {
	/** Stable id, stored on the edge as `source_port` / `target_port`. */
	id: string;
	type: PortType;
	/** Operator-facing caption, shown beside the handle. */
	label: string;
	/** Whether more than one edge may use it. */
	multi: boolean;
}

/** A node's ports, inputs on the left and outputs on the right. */
export interface NodePorts {
	inputs: PortSpec[];
	outputs: PortSpec[];
}

/** The fields of a node the ports depend on. */
export interface PortNode {
	kind: string;
	action?: string;
	feature_id?: string;
	condition?: { op?: string };
}

/** Operator-facing name of each port type. */
export const PORT_TYPE_LABEL: Record<PortType, string> = {
	flow: "then",
	waypoint: "waypoint",
	zone: "zone",
	asset: "asset",
	agent: "agent",
	bool: "true/false",
};

/**
 * A step's flow input takes ONE step before it, or any number of agents (the
 * head of a chain, shared by a team) — never both. {@link connectionPlan}
 * enforces that; `multi` is true so the agents fit.
 */
const FLOW_IN: PortSpec = { id: "in", type: "flow", label: "", multi: true };
const FLOW_OUT: PortSpec = {
	id: "next",
	type: "flow",
	label: "then",
	multi: false,
};

/**
 * The type an asset's output carries, from its map feature type. A cue is a
 * point, so it is somewhere to go; an unknown type (catalogue not loaded, or
 * no feature picked) is `asset`, which fits either target.
 *
 * @param featureType - The MapDB `feature_type`, if known.
 * @returns The port type.
 */
export function assetPortType(featureType: string | undefined): PortType {
	if (featureType === "zone") return "zone";
	if (featureType === "waypoint" || featureType === "cue") return "waypoint";
	return "asset";
}

/**
 * The type an action's target takes.
 *
 * @param action - The action, if one is named.
 * @returns `waypoint` for NAVIGATE, `zone` for COVERAGE, else `asset`.
 */
export function targetPortType(action: string | undefined): PortType {
	if (action === "NAVIGATE") return "waypoint";
	if (action === "COVERAGE") return "zone";
	return "asset";
}

/**
 * A node's ports.
 *
 * @param node - The node.
 * @param featureTypes - `feature_id → feature_type` of the map, so an asset's
 *   output is typed; without it every asset is `asset`.
 * @returns Its inputs and outputs, in display order.
 */
export function nodePorts(
	node: PortNode,
	featureTypes?: Readonly<Record<string, string>>,
): NodePorts {
	switch (node.kind) {
		case "agent":
			return {
				inputs: [],
				outputs: [
					FLOW_OUT,
					{ id: "agent", type: "agent", label: "agent", multi: true },
				],
			};
		case "action": {
			const type = targetPortType(node.action);
			return {
				inputs: [
					FLOW_IN,
					{
						id: "target",
						type,
						label: PORT_TYPE_LABEL[type],
						multi: false,
					},
				],
				outputs: [FLOW_OUT],
			};
		}
		case "wait":
			return {
				inputs: [
					FLOW_IN,
					{ id: "when", type: "bool", label: "when", multi: true },
				],
				outputs: [FLOW_OUT],
			};
		case "condition":
			return {
				inputs:
					node.condition?.op === "AgentHolding"
						? [
								{
									id: "agent",
									type: "agent",
									label: "agent",
									multi: false,
								},
							]
						: [],
				outputs: [
					{
						id: "value",
						type: "bool",
						label: "true/false",
						multi: true,
					},
				],
			};
		case "asset": {
			const type = assetPortType(
				node.feature_id ? featureTypes?.[node.feature_id] : undefined,
			);
			return {
				inputs: [],
				outputs: [
					{
						id: "value",
						type,
						label: PORT_TYPE_LABEL[type],
						multi: true,
					},
				],
			};
		}
		default:
			return { inputs: [], outputs: [] };
	}
}

/** Whether a port type is a place (an asset, a waypoint or a zone). */
function isPlace(type: PortType): boolean {
	return type === "asset" || type === "waypoint" || type === "zone";
}

/**
 * Whether an output of type `out` may be wired into an input of type `into`:
 * the same type, or an untyped `asset` on either side of a place.
 *
 * @param out - The source port's type.
 * @param into - The target port's type.
 * @returns True when the edge is allowed.
 */
export function portsFit(out: PortType, into: PortType): boolean {
	if (out === into) return true;
	return (
		(out === "asset" && isPlace(into)) || (into === "asset" && isPlace(out))
	);
}

/** One port of one node. */
export interface PortRef {
	node: string;
	port: string;
}

/** The fields of an edge the plan reads. */
export interface PortEdge {
	id: string;
	source: string;
	source_port: string;
	target: string;
	target_port: string;
}

/** Whether a drag may become an edge, and which edges it replaces. */
export type ConnectionPlan =
	{ ok: true; replaces: string[] } | { ok: false; reason: string };

/**
 * Decide a connection: refused with a reason, or allowed, naming the edges it
 * replaces. A single port (every flow port, an action's target, a condition's
 * agent) keeps ONE edge, so a new drag into it takes the old edge's place
 * rather than being refused — re-wiring is the common gesture.
 *
 * @param nodes - The graph's nodes.
 * @param edges - The graph's edges.
 * @param from - The output dragged from.
 * @param to - The input dropped on.
 * @param featureTypes - The map's feature types, for asset outputs.
 * @returns The plan.
 */
export function connectionPlan(
	nodes: readonly (PortNode & { id: string })[],
	edges: readonly PortEdge[],
	from: PortRef,
	to: PortRef,
	featureTypes?: Readonly<Record<string, string>>,
): ConnectionPlan {
	if (from.node === to.node) {
		return { ok: false, reason: "A node cannot be wired to itself." };
	}
	const source = nodes.find((node) => node.id === from.node);
	const target = nodes.find((node) => node.id === to.node);
	if (!source || !target) return { ok: false, reason: "No such node." };
	const out = nodePorts(source, featureTypes).outputs.find(
		(port) => port.id === from.port,
	);
	const into = nodePorts(target, featureTypes).inputs.find(
		(port) => port.id === to.port,
	);
	if (!out || !into) return { ok: false, reason: "No such port." };
	if (!portsFit(out.type, into.type)) {
		return {
			ok: false,
			reason: `A ${PORT_TYPE_LABEL[out.type]} cannot go into a ${PORT_TYPE_LABEL[into.type]} input.`,
		};
	}
	if (
		edges.some(
			(edge) =>
				edge.source === from.node &&
				edge.source_port === from.port &&
				edge.target === to.node &&
				edge.target_port === to.port,
		)
	) {
		return { ok: false, reason: "These two ports are already wired." };
	}
	// A step follows one step, or is the first step of its agents' chain.
	if (into.type === "flow") {
		const before = edges.filter(
			(edge) => edge.target === to.node && edge.target_port === to.port,
		);
		const kindOf = (id: string) =>
			nodes.find((node) => node.id === id)?.kind;
		const agentsBefore = before.filter(
			(edge) => kindOf(edge.source) === "agent",
		);
		if (source.kind === "agent" && agentsBefore.length < before.length) {
			return {
				ok: false,
				reason: "This step already follows another step; only the first step of a chain takes agents.",
			};
		}
		if (source.kind !== "agent" && agentsBefore.length > 0) {
			return {
				ok: false,
				reason: "This step is the first of an agent's chain; it cannot also follow another step.",
			};
		}
	}
	const replaces = edges
		.filter(
			(edge) =>
				((!into.multi ||
					(into.type === "flow" && source.kind !== "agent")) &&
					edge.target === to.node &&
					edge.target_port === to.port) ||
				(!out.multi &&
					edge.source === from.node &&
					edge.source_port === from.port),
		)
		.map((edge) => edge.id);
	return { ok: true, replaces };
}
