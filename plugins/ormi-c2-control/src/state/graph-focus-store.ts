"use client";

/**
 * Graph focus — "show me this node" from another widget to the graph editor.
 *
 * The mission feedback lists where each agent is in its chain; clicking a row
 * asks the graph editor to select that node and bring it into view. A request,
 * not a selection: the editor owns its selection and acts on each request once
 * (`seq` tells a repeated click on the same node from a stale one). Same
 * module-level `useSyncExternalStore` contract as the other plugin stores; no
 * ORMI core change.
 */

import { useSyncExternalStore } from "react";

/** One request to focus a graph node. */
export interface GraphFocusRequest {
	missionId: string;
	nodeId: string;
	/** Increases with every request, so the same node can be asked for again. */
	seq: number;
}

let current: GraphFocusRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();

/**
 * Ask the graph editor showing `missionId` to select and show `nodeId`.
 * @param missionId - The mission whose graph holds the node.
 * @param nodeId - The graph node.
 */
export function focusGraphNode(missionId: string, nodeId: string): void {
	seq += 1;
	current = { missionId, nodeId, seq };
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function snapshot(): GraphFocusRequest | null {
	return current;
}

/**
 * Be told about every focus request, as it is made (for a widget that acts on
 * each one rather than rendering the latest).
 * @param listener - Called with each request.
 * @returns Unsubscribe.
 */
export function subscribeGraphFocus(
	listener: (request: GraphFocusRequest) => void,
): () => void {
	return subscribe(() => {
		if (current) listener(current);
	});
}

/** The latest focus request, or null. */
export function useGraphFocusRequest(): GraphFocusRequest | null {
	return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Test-only: reset the module state. */
export function __resetGraphFocusStore(): void {
	current = null;
	seq = 0;
	listeners.clear();
}
