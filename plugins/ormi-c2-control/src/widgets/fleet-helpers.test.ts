import { describe, expect, it } from "bun:test";

import { C2Vehicle } from "../types/c2-types";
import {
	collectTelemetry,
	extractAgentPosition,
	extractAgentTelemetry,
	mergeFleet,
	readNamespace,
} from "./fleet-helpers";

describe("readNamespace (namespace probe order)", () => {
	it("prefers a top-level namespace", () => {
		expect(
			readNamespace({
				namespace: "Themis_Fr",
				agent_profile: { namespace: "Other" },
				name: "Also",
			}),
		).toBe("Themis_Fr");
	});

	it("falls back to agent_profile.namespace", () => {
		expect(
			readNamespace({ agent_profile: { namespace: "Atlas_Be" } }),
		).toBe("Atlas_Be");
	});

	it("falls back to name when no namespace is present", () => {
		expect(readNamespace({ name: "Rover_1" })).toBe("Rover_1");
	});

	it("trims and rejects blank/whitespace-only candidates", () => {
		expect(readNamespace({ namespace: "  Spaced  " })).toBe("Spaced");
		expect(readNamespace({ namespace: "   ", name: "Fallback" })).toBe(
			"Fallback",
		);
	});

	it("returns undefined when nothing usable is present", () => {
		expect(readNamespace({})).toBeUndefined();
		expect(readNamespace({ namespace: "", name: "" })).toBeUndefined();
		expect(readNamespace({ namespace: 42 } as never)).toBeUndefined();
	});
});

describe("extractAgentPosition (defensive, §7 two variants)", () => {
	it("reads the nav_msgs/Odometry variant", () => {
		const raw = { pose: { pose: { position: { x: 1, y: 2, z: 3 } } } };
		expect(extractAgentPosition(raw)).toEqual({ x: 1, y: 2, z: 3 });
	});

	it("reads a nested odometry.pose.pose.position", () => {
		const raw = {
			odometry: { pose: { pose: { position: { x: 4, y: 5 } } } },
		};
		expect(extractAgentPosition(raw)).toEqual({ x: 4, y: 5 });
	});

	it("reads the Localization variant (lat/lon)", () => {
		const raw = { localization: { latitude: 50.1, longitude: 4.2 } };
		expect(extractAgentPosition(raw)).toEqual({ x: 50.1, y: 4.2 });
	});

	it("returns undefined on missing/garbage shapes (no throw)", () => {
		expect(extractAgentPosition(null)).toBeUndefined();
		expect(extractAgentPosition({})).toBeUndefined();
		expect(extractAgentPosition({ pose: {} })).toBeUndefined();
		expect(extractAgentPosition(42)).toBeUndefined();
	});
});

describe("extractAgentTelemetry (defensive)", () => {
	it("normalizes a single agent feedback object", () => {
		const raw = {
			agent_id: "a1",
			state: "ACTIVE",
			pose: { pose: { position: { x: 1, y: 1 } } },
		};
		expect(extractAgentTelemetry(raw)).toEqual([
			{ agent_id: "a1", state: "ACTIVE", position: { x: 1, y: 1 } },
		]);
	});

	it("normalizes a wrapper carrying an agents[] array", () => {
		const raw = {
			agents: [
				{ agent_id: "a1", state: 0 },
				{ agent_id: "a2", state: 1 },
			],
		};
		const out = extractAgentTelemetry(raw);
		expect(out.map((t) => t.agent_id)).toEqual(["a1", "a2"]);
	});

	it("drops entries without an agent id and never throws", () => {
		expect(extractAgentTelemetry({ agents: [{ state: 1 }, null] })).toEqual(
			[],
		);
		expect(extractAgentTelemetry(undefined)).toEqual([]);
	});
});

describe("collectTelemetry (per-agent, interleaved single-agent messages)", () => {
	// One Feedback message per agent, interleaved on the shared topic — the
	// real /multi_robot/edge/feedback shape (each agent has its own publisher).
	const buffer: unknown[] = [
		{ agent_id: "a1", state: 0 },
		{ agent_id: "a2", state: 0 },
		{ agent_id: "a3", state: 0 },
		{ agent_id: "a1", state: 1 }, // a1 updates later in the window
	];

	it("surfaces the latest message for every agent simultaneously", () => {
		const out = collectTelemetry([buffer]);
		expect(out.map((t) => t.agent_id).sort()).toEqual(["a1", "a2", "a3"]);
		expect(out.find((t) => t.agent_id === "a1")?.state).toBe(1); // last wins
	});

	it("dedupes across multiple per-source buffers", () => {
		const out = collectTelemetry([
			[{ agent_id: "a1", state: 0 }],
			[{ agent_id: "a2", state: 0 }],
		]);
		expect(out.map((t) => t.agent_id).sort()).toEqual(["a1", "a2"]);
	});

	it("ignores empty buffers and null entries (no throw)", () => {
		expect(collectTelemetry([[null, undefined], []])).toEqual([]);
	});
});

describe("mergeFleet (roster is last-known-value, never blanks)", () => {
	const roster: C2Vehicle[] = [
		{ agent_id: "a1", name: "Rover-1" },
		{ agent_id: "a2", name: "Drone-2" },
	];

	it("keeps every registered vehicle even with no telemetry", () => {
		const rows = mergeFleet(roster, []);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.vehicle && !r.telemetry)).toBe(true);
		expect(rows.every((r) => !r.unregistered)).toBe(true);
	});

	it("cross-references live telemetry onto roster rows", () => {
		const rows = mergeFleet(roster, [
			{ agent_id: "a1", state: "ACTIVE", position: { x: 1, y: 2 } },
		]);
		const a1 = rows.find((r) => r.agent_id === "a1")!;
		expect(a1.telemetry?.state).toBe("ACTIVE");
		const a2 = rows.find((r) => r.agent_id === "a2")!;
		expect(a2.telemetry).toBeUndefined();
	});

	it("appends agents reporting live but absent from the roster", () => {
		const rows = mergeFleet(roster, [{ agent_id: "ghost" }]);
		const ghost = rows.find((r) => r.agent_id === "ghost")!;
		expect(ghost.unregistered).toBe(true);
		expect(ghost.vehicle).toBeUndefined();
	});

	it("sorts rows by agent id", () => {
		const rows = mergeFleet(
			[{ agent_id: "z" }, { agent_id: "a" }],
			[{ agent_id: "m" }],
		);
		expect(rows.map((r) => r.agent_id)).toEqual(["a", "m", "z"]);
	});
});
