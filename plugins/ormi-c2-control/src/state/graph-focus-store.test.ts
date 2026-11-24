import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetEditorSelectionStore,
	getEditorSelection,
} from "./editor-selection-store";
import {
	focusGraphNode,
	subscribeGraphFocus,
	type GraphFocusRequest,
} from "./graph-focus-store";

beforeEach(() => {
	__resetEditorSelectionStore();
});

describe("graph focus requests", () => {
	it("delivers every request, the same node asked for twice included", () => {
		const seen: GraphFocusRequest[] = [];
		const stop = subscribeGraphFocus((request) => seen.push(request));
		focusGraphNode("m-1", "go-es");
		focusGraphNode("m-1", "go-es");
		stop();
		focusGraphNode("m-1", "go-ge");
		expect(seen.map((r) => r.nodeId)).toEqual(["go-es", "go-es"]);
		expect(seen[1]!.seq).toBeGreaterThan(seen[0]!.seq);
	});

	it("selects the node, owned by the node editor", () => {
		focusGraphNode("m-1", "go-es");
		expect(getEditorSelection()).toEqual({
			items: [{ kind: "node", missionId: "m-1", id: "go-es" }],
			owner: "graph",
			group: false,
		});
	});
});
