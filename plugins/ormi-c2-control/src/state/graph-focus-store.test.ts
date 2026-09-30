import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetGraphFocusStore,
	focusGraphNode,
	subscribeGraphFocus,
	type GraphFocusRequest,
} from "./graph-focus-store";

beforeEach(() => {
	__resetGraphFocusStore();
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
});
