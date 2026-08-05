import { describe, expect, it } from "bun:test";

import type { AgentRecord } from "../state/c2-agents-store";
import {
	agentsTopicSignature,
	buildLocalizationTopic,
} from "./agent-localization-topics";

/** Minimal datasource settings for tests. */
const source = (id: string) => ({ id, title: id, enable: true });

const fullAgent = (over: Partial<AgentRecord> = {}): AgentRecord => ({
	agent_id: "a1",
	name: "Themis_Fr",
	namespace: "Themis_Fr",
	source: source("ds-1"),
	...over,
});

describe("agentsTopicSignature", () => {
	it("is stable for equal rosters (identity-irrelevant)", () => {
		const a = [fullAgent(), fullAgent({ agent_id: "a2", namespace: "n2" })];
		const b = [fullAgent(), fullAgent({ agent_id: "a2", namespace: "n2" })];
		expect(agentsTopicSignature(a)).toBe(agentsTopicSignature(b));
	});

	it("changes when membership changes", () => {
		const one = [fullAgent()];
		const two = [fullAgent(), fullAgent({ agent_id: "a2" })];
		expect(agentsTopicSignature(one)).not.toBe(agentsTopicSignature(two));
	});

	it("changes when a namespace changes", () => {
		const before = [fullAgent({ namespace: "Themis_Fr" })];
		const after = [fullAgent({ namespace: "Themis_De" })];
		expect(agentsTopicSignature(before)).not.toBe(
			agentsTopicSignature(after),
		);
	});

	it("changes when the source id changes (compared by id)", () => {
		const before = [fullAgent({ source: source("ds-1") })];
		const after = [fullAgent({ source: source("ds-2") })];
		expect(agentsTopicSignature(before)).not.toBe(
			agentsTopicSignature(after),
		);
	});

	it("is unchanged when source identity differs but id is equal", () => {
		const before = [fullAgent({ source: source("ds-1") })];
		const after = [fullAgent({ source: source("ds-1") })]; // fresh object
		expect(agentsTopicSignature(before)).toBe(agentsTopicSignature(after));
	});

	it("encodes null namespace/source as empty", () => {
		const sig = agentsTopicSignature([
			fullAgent({ namespace: null, source: null }),
		]);
		expect(sig).toBe("a1||");
	});
});

describe("buildLocalizationTopic", () => {
	it("builds a raw-typed localization SelectedTopic for a full agent", () => {
		const topic = buildLocalizationTopic(fullAgent());
		expect(topic).toEqual({
			topic: "/Themis_Fr/edge/multi_robot/localization",
			datasource_id: "ds-1",
			source: source("ds-1"),
			type: "nav_msgs/msg/Odometry",
			rawType: "nav_msgs/msg/Odometry",
			property: "",
		});
	});

	it("builds against the fallback source when the agent has a namespace but no own source", () => {
		const topic = buildLocalizationTopic(
			fullAgent({ source: null }),
			source("ds-fallback"),
		);
		expect(topic).toEqual({
			topic: "/Themis_Fr/edge/multi_robot/localization",
			datasource_id: "ds-fallback",
			source: source("ds-fallback"),
			type: "nav_msgs/msg/Odometry",
			rawType: "nav_msgs/msg/Odometry",
			property: "",
		});
	});

	it("prefers the agent's own source over the fallback", () => {
		const topic = buildLocalizationTopic(
			fullAgent({ source: source("ds-own") }),
			source("ds-fallback"),
		);
		expect(topic?.datasource_id).toBe("ds-own");
	});

	it("returns null when the agent has no namespace (even with a fallback)", () => {
		expect(
			buildLocalizationTopic(
				fullAgent({ namespace: null }),
				source("ds-fallback"),
			),
		).toBeNull();
	});

	it("returns null when there is no source anywhere (no own, no fallback)", () => {
		expect(buildLocalizationTopic(fullAgent({ source: null }))).toBeNull();
	});
});
