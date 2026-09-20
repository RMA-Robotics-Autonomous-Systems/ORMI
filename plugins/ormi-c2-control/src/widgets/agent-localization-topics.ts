"use client";

/**
 * Per-agent localization topic derivation for the mission map's agent overlay.
 *
 * Each agent in the C2 agents roster ({@link useAgents}) that carries BOTH a
 * `namespace` and a datasource `source` exposes its position on a NAMESPACED
 * topic `{namespace}/edge/multi_robot/localization` (`nav_msgs/msg/Odometry`).
 * This module turns the roster into the `SelectedTopic[]` the map subscribes to,
 * plus a `topic-key → agent_id` map so each incoming source can be labeled.
 *
 * ⚠ STABILITY — `LocalDataSourcesProvider`'s subscription effect depends on its
 * `SelectedTopics` array BY REFERENCE: a fresh array every render thrashes every
 * per-agent subscribe/unsubscribe. {@link useAgentLocalizationTopics} therefore
 * rebuilds only when the pure {@link agentsTopicSignature} STRING (not the
 * roster array) changes, so the returned `topics` array keeps a stable identity until
 * membership / namespace / source actually changes.
 */

import { useState } from "react";

import type {
	DatasourceProviderSettings,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { createTopicKey } from "@workspace/utils";

import type { AgentRecord } from "../state/c2-agents-store";
import { useAgents } from "../state/c2-agents-store";
import { buildNamespacedTopic } from "./fleet-helpers";

/** Raw ROS type for the per-agent localization Odometry stream. */
const LOCALIZATION_RAW_TYPE = "nav_msgs/msg/Odometry";

/**
 * Pure signature of a roster for memo keying.
 *
 * Encodes exactly the fields that affect the derived subscription set —
 * `agent_id`, `namespace`, and `source.id` — so the signature is stable across
 * identical re-publishes and changes only on a membership / namespace / source
 * change. The `§` separator can't appear in a UUID, namespace, or source id.
 *
 * @param agents - The agent roster.
 * @returns A deterministic signature string.
 */
export function agentsTopicSignature(agents: AgentRecord[]): string {
	return agents
		.map((a) => `${a.agent_id}|${a.namespace ?? ""}|${a.source?.id ?? ""}`)
		.join("§");
}

/**
 * Build the localization {@link SelectedTopic} for one agent, or null when the
 * agent lacks a `namespace` or a resolvable `source` (no per-agent stream to
 * subscribe to).
 *
 * The agent namespace reaches the store via the REST roster, which records no
 * ROS `source`. The per-agent localization stream therefore subscribes against
 * the `fallbackSource` — the ROS datasource the operator already configured for
 * live telemetry (the map's feedback/overlay topic). The source resolves as
 * `agent.source ?? fallbackSource`, so a roster-fed agent still subscribes.
 *
 * Pure (no React) so it is unit-testable. The raw-typed topic mirrors how the
 * plugin's `TopicSelect`-sourced topics are shaped: `rawType` is the ROS type
 * and `type` mirrors it (raw match), `property` is empty (the whole Odometry
 * message is delivered).
 *
 * @param agent - The agent record.
 * @param fallbackSource - The ROS source to use when the agent has no `source`.
 * @returns The localization SelectedTopic, or null when not subscribable.
 */
export function buildLocalizationTopic(
	agent: AgentRecord,
	fallbackSource?: DatasourceProviderSettings,
): SelectedTopic | null {
	return buildAgentTopic(
		agent,
		"localization",
		LOCALIZATION_RAW_TYPE,
		fallbackSource,
	);
}

/** Raw ROS type of the per-agent Nav2 global-plan stream. */
export const TRAJECTORY_RAW_TYPE = "autonomy_msgs/msg/AutonomyTrajectory";

/**
 * Build any per-agent `{namespace}/edge/multi_robot/{suffix}` topic, or null
 * when the agent lacks a namespace or a resolvable source. The generalisation of
 * {@link buildLocalizationTopic} (same source rule, same shape).
 *
 * @param agent - The agent record.
 * @param suffix - The topic suffix (`localization`, `autonomy_trajectory`, …).
 * @param rawType - The ROS message type of that topic.
 * @param fallbackSource - The ROS source to use when the agent has no `source`.
 * @returns The SelectedTopic, or null when not subscribable.
 */
export function buildAgentTopic(
	agent: AgentRecord,
	suffix: string,
	rawType: string,
	fallbackSource?: DatasourceProviderSettings,
): SelectedTopic | null {
	const namespace = agent.namespace;
	const source = agent.source ?? fallbackSource ?? null;
	if (!namespace || !source) return null;
	const topic = buildNamespacedTopic(namespace, suffix);
	return {
		topic,
		datasource_id: (source as DatasourceProviderSettings).id,
		source,
		type: rawType,
		rawType,
		property: "",
	};
}

/**
 * React hook: the per-agent localization topics + a `topic-key → agent_id` map.
 *
 * Reads the agent roster and, for every agent carrying both a namespace and a
 * source, builds a localization `SelectedTopic` and records its provider topic
 * key (via the same {@link createTopicKey} the provider uses) → `agent_id`, so
 * the map overlay can label each incoming source.
 *
 * The memo is keyed on {@link agentsTopicSignature} (a STRING) PLUS the
 * `fallbackSource.id`, NOT the roster array, so the returned `topics` identity
 * stays stable until the subscription set actually changes — REQUIRED so
 * `LocalDataSourcesProvider` does not re-run its subscription effect on every
 * render (see the module header). Threading the fallback source id into the
 * signature rebuilds the topic set when the operator's configured ROS source
 * changes.
 *
 * @param fallbackSource - The ROS source for agents that have no own `source`
 *   (roster-fed agents); typically the map's configured feedback/overlay topic.
 * @returns `{ topics, agentByKey }`.
 */
export function useAgentLocalizationTopics(
	fallbackSource?: DatasourceProviderSettings,
): {
	topics: SelectedTopic[];
	agentByKey: Map<string, string>;
} {
	return useAgentTopics(
		"localization",
		LOCALIZATION_RAW_TYPE,
		fallbackSource,
	);
}

/**
 * React hook: one per-agent topic per roster agent (optionally only the agents
 * in `onlyAgentIds`), plus a `topic-key → agent_id` map. Same stability rule as
 * {@link useAgentLocalizationTopics}: the memo is keyed on a signature STRING,
 * so the returned array keeps its identity until the subscription set changes.
 *
 * @param suffix - The topic suffix.
 * @param rawType - The ROS message type.
 * @param fallbackSource - The ROS source for agents without their own.
 * @param onlyAgentIds - When given, restrict to these agents (e.g. the
 *   vehicles of the selected mission), so no idle robot is subscribed.
 * @returns `{ topics, agentByKey }`.
 */
export function useAgentTopics(
	suffix: string,
	rawType: string,
	fallbackSource?: DatasourceProviderSettings,
	onlyAgentIds?: readonly string[],
): {
	topics: SelectedTopic[];
	agentByKey: Map<string, string>;
} {
	const allAgents = useAgents();
	const only = onlyAgentIds ? [...onlyAgentIds].sort().join(",") : null;
	const agents =
		only == null
			? allAgents
			: allAgents.filter((a) => onlyAgentIds!.includes(a.agent_id));
	const signature = `${suffix}|${rawType}|${only ?? "*"}|${agentsTopicSignature(agents)}@${fallbackSource?.id ?? ""}`;

	// Identity is held across renders in state, tagged with the `signature` it
	// was built from, and rebuilt only when that signature changes — so the
	// returned array stays stable until membership/namespace/source (or the
	// fallback source id) changes, see the module header. This is React's
	// "adjust state while rendering" pattern: the comparison really reads the
	// signature, so there is no dead memo key for the compiler to strip, and no
	// dependency list to silence.
	const [built, setBuilt] = useState<{
		signature: string;
		value: { topics: SelectedTopic[]; agentByKey: Map<string, string> };
	} | null>(null);
	if (built === null || built.signature !== signature) {
		const value = buildAgentTopicSet(
			agents,
			suffix,
			rawType,
			fallbackSource,
		);
		setBuilt({ signature, value });
		return value;
	}
	return built.value;
}

/**
 * Build the per-agent topic set and its `topic-key → agent_id` map. Pure.
 *
 * @param agents - The (already filtered) roster.
 * @param suffix - The topic suffix.
 * @param rawType - The ROS message type.
 * @param fallbackSource - The ROS source for agents without their own.
 * @returns `{ topics, agentByKey }`.
 */
function buildAgentTopicSet(
	agents: readonly AgentRecord[],
	suffix: string,
	rawType: string,
	fallbackSource?: DatasourceProviderSettings,
): { topics: SelectedTopic[]; agentByKey: Map<string, string> } {
	const topics: SelectedTopic[] = [];
	const agentByKey = new Map<string, string>();
	for (const agent of agents) {
		const topic = buildAgentTopic(agent, suffix, rawType, fallbackSource);
		if (!topic) continue;
		topics.push(topic);
		agentByKey.set(createTopicKey(topic), agent.agent_id);
	}
	return { topics, agentByKey };
}
