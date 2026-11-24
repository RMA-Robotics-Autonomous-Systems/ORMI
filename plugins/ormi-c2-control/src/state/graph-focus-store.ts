"use client";

/**
 * Graph focus: "show me this node", from another widget to the node editor,
 * as an adapter over the editor's one selection (`editor-selection-store.ts`).
 *
 * The mission feedback lists where each agent is in its chain; clicking a
 * row selects that node (owned by the node editor) and asks the editor to
 * bring it into view through the reveal channel. `seq` tells a repeated
 * click on the same node from a stale one.
 */

import {
	requestReveal,
	setEditorSelection,
	subscribeReveal,
} from "./editor-selection-store";

/** One request to focus a graph node. */
export interface GraphFocusRequest {
	missionId: string;
	nodeId: string;
	/** Increases with every request, so the same node can be asked for again. */
	seq: number;
}

/**
 * Select `nodeId` in the node editor showing `missionId`, and ask it to show it.
 * @param missionId - The mission whose graph holds the node.
 * @param nodeId - The graph node.
 */
export function focusGraphNode(missionId: string, nodeId: string): void {
	const item = { kind: "node" as const, missionId, id: nodeId };
	setEditorSelection([item], "graph");
	requestReveal(item);
}

/**
 * Be told about every focus request, as it is made.
 * @param listener - Called with each request.
 * @returns Unsubscribe.
 */
export function subscribeGraphFocus(
	listener: (request: GraphFocusRequest) => void,
): () => void {
	return subscribeReveal(({ item, seq }) => {
		if (item.kind !== "node") return;
		listener({ missionId: item.missionId, nodeId: item.id, seq });
	});
}
